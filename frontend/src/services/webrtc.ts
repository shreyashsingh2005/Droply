import { SignalingService } from './signaling';
import type { SignalingMessage } from './signaling';



export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

export class WebRTCService {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private signaling: SignalingService;
  
  public onConnectionStateChange: ((state: RTCIceConnectionState) => void) | null = null;
  public onDataChannelOpen: (() => void) | null = null;
  public onMessage: ((data: ArrayBuffer | string) => void) | null = null;

  constructor(roomId: string, role: 'sender' | 'receiver') {
    this.signaling = new SignalingService(roomId, role);
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // Fallback TURN would go here in production
      ]
    });

    this.pc.oniceconnectionstatechange = () => {
      this.onConnectionStateChange?.(this.pc.iceConnectionState);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.send({ type: 'candidate', candidate: event.candidate.toJSON() });
      }
    };

    if (role === 'sender') {
      this.dc = this.pc.createDataChannel('file-transfer');
      this.setupDataChannel();
    } else {
      this.pc.ondatachannel = (event) => {
        this.dc = event.channel;
        this.setupDataChannel();
      };
    }

    this.signaling.onMessage = async (msg: SignalingMessage) => {
      switch (msg.type) {
        case 'start':
          if (this.dc) { // I am sender
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            this.signaling.send({ type: 'offer', sdp: offer });
          }
          break;
        case 'offer':
          await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.signaling.send({ type: 'answer', sdp: answer });
          break;
        case 'answer':
          await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          break;
        case 'candidate':
          if (msg.candidate) {
            await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          }
          break;
        default:
          // pass other messages via a custom callback if needed, 
          // but we can just use WebRTC data channel for app level messaging
          break;
      }
    };
  }

  private setupDataChannel() {
    if (!this.dc) return;
    this.dc.binaryType = 'arraybuffer';
    
    this.dc.onopen = () => {
      this.onDataChannelOpen?.();
    };
    
    this.dc.onmessage = (event) => {
      this.onMessage?.(event.data);
    };
  }

  async connect() {
    this.signaling.onClose = () => {
      if (this.pc.iceConnectionState !== 'connected' && this.pc.iceConnectionState !== 'completed') {
        this.onConnectionStateChange?.('failed' as RTCIceConnectionState);
      }
    };
    
    this.signaling.connect();
    
    // We don't need to initiate offer here anymore.
    // We wait for the 'start' message from the signaling server when both peers have joined.
  }

  sendData(data: ArrayBuffer | string) {
    if (this.dc?.readyState === 'open') {
      if (typeof data === 'string') {
        this.dc.send(data);
      } else {
        this.dc.send(data);
      }
    }
  }

  get bufferedAmount() {
    return this.dc?.bufferedAmount || 0;
  }

  disconnect() {
    this.dc?.close();
    this.pc.close();
    this.signaling.disconnect();
  }
}
