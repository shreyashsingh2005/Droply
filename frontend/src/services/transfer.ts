import { WebRTCService } from './webrtc';
import type { FileMetadata } from './webrtc';

const CHUNK_SIZE = 16384;
const MAX_BUFFERED_AMOUNT = 64 * 1024; // 64KB

type TransferMessage = 
  | { type: 'metadata', files: FileMetadata[] }
  | { type: 'accept' }
  | { type: 'reject' }
  | { type: 'start-file', index: number }
  | { type: 'complete-file', index: number, hash: string }
  | { type: 'cancel' };

export class TransferProtocol {
  private rtc: WebRTCService;
  private files: File[] = [];
  private currentFileIndex = 0;
  private offset = 0;
  
  public onMetadataReceived: ((files: FileMetadata[]) => void) | null = null;
  public onTransferAccepted: (() => void) | null = null;
  public onTransferRejected: (() => void) | null = null;
  public onFileProgress: ((index: number, bytes: number, total: number) => void) | null = null;
  public onFileComplete: ((index: number, blob: Blob, hash: string, meta: FileMetadata) => void) | null = null;
  public onAllComplete: (() => void) | null = null;
  public onCancel: (() => void) | null = null;
  public onConnectionStateChange: ((state: RTCIceConnectionState) => void) | null = null;

  // Receiver state
  private receiveBuffer: Blob[] = [];
  private receivedBytes = 0;
  private expectedFiles: FileMetadata[] = [];
  private currentReceiveIndex = 0;

  constructor(roomId: string, role: 'sender' | 'receiver') {
    this.rtc = new WebRTCService(roomId, role);
    
    this.rtc.onMessage = (data) => {
      if (typeof data === 'string') {
        const msg: TransferMessage = JSON.parse(data);
        this.handleMessage(msg);
      } else {
        // Binary chunk
        this.receiveBuffer.push(new Blob([data as ArrayBuffer]));
        this.receivedBytes += (data as ArrayBuffer).byteLength;
        const totalSize = this.expectedFiles[this.currentReceiveIndex]?.size || 0;
        this.onFileProgress?.(this.currentReceiveIndex, this.receivedBytes, totalSize);
      }
    };
    this.rtc.onConnectionStateChange = (state) => this.onConnectionStateChange?.(state);
  }

  get webRTC() {
    return this.rtc;
  }

  private handleMessage(msg: TransferMessage) {
    switch (msg.type) {
      case 'metadata':
        this.expectedFiles = msg.files;
        this.onMetadataReceived?.(msg.files);
        break;
      case 'accept':
        this.onTransferAccepted?.();
        this.startSendingFiles();
        break;
      case 'reject':
        this.onTransferRejected?.();
        break;
      case 'start-file':
        this.currentReceiveIndex = msg.index;
        this.receiveBuffer = [];
        this.receivedBytes = 0;
        break;
      case 'complete-file': {
        const fileMeta = this.expectedFiles[msg.index];
        const blob = new Blob(this.receiveBuffer, { type: fileMeta?.type || 'application/octet-stream' });
        this.onFileComplete?.(msg.index, blob, msg.hash, fileMeta);
        
        if (msg.index === this.expectedFiles.length - 1) {
          this.onAllComplete?.();
        }
        break;
      }
      case 'cancel':
        this.onCancel?.();
        break;
    }
  }

  sendFilesMetadata(files: File[]) {
    this.files = files;
    this.currentFileIndex = 0;
    this.offset = 0;
    this.rtc.sendData(JSON.stringify({
      type: 'metadata',
      files: files.map(f => ({ name: f.name, size: f.size, type: f.type }))
    }));
  }

  acceptTransfer() {
    this.rtc.sendData(JSON.stringify({ type: 'accept' }));
  }

  rejectTransfer() {
    this.rtc.sendData(JSON.stringify({ type: 'reject' }));
  }

  cancelTransfer() {
    this.rtc.sendData(JSON.stringify({ type: 'cancel' }));
  }

  private async startSendingFiles() {
    if (this.files.length === 0) return;
    this.currentFileIndex = 0;
    await this.sendNextFile();
  }

  private async sendNextFile() {
    if (this.currentFileIndex >= this.files.length) {
      this.onAllComplete?.();
      return;
    }
    this.offset = 0;
    this.rtc.sendData(JSON.stringify({ type: 'start-file', index: this.currentFileIndex }));
    this.readNextChunk();
  }

  private readNextChunk = () => {
    const file = this.files[this.currentFileIndex];
    if (!file) return;
    
    if (this.rtc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      setTimeout(this.readNextChunk, 50);
      return;
    }

    const slice = file.slice(this.offset, this.offset + CHUNK_SIZE);
    
    // Fallback to arrayBuffer for simplicity with chunking, FileReader is more robust across older browsers, but arrayBuffer is simpler
    slice.arrayBuffer().then(async (buffer) => {
      this.rtc.sendData(buffer);
      this.offset += buffer.byteLength;
      this.onFileProgress?.(this.currentFileIndex, this.offset, file.size);

      if (this.offset < file.size) {
        this.readNextChunk();
      } else {
        const hash = await this.computeHash(file);
        this.rtc.sendData(JSON.stringify({ type: 'complete-file', index: this.currentFileIndex, hash }));
        
        // Move to next file
        this.currentFileIndex++;
        // Give a slight delay before starting next file to let receiver process
        setTimeout(() => this.sendNextFile(), 100);
      }
    });
  }

  private async computeHash(file: File | Blob): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async verifyHash(blob: Blob, expectedHash: string): Promise<boolean> {
    const hash = await this.computeHash(blob);
    return hash === expectedHash;
  }
}
