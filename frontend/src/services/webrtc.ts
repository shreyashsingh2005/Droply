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

  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(roomId: string, role: 'sender' | 'receiver') {
    this.signaling = new SignalingService(roomId, role);
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // Fallback TURN would go here in production
      ]
    });

    this.pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE Connection State: ${this.pc.iceConnectionState}`);
      if (this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed') {
        if (this.connectionTimeoutId) {
          clearTimeout(this.connectionTimeoutId);
          this.connectionTimeoutId = null;
        }
      }
      this.onConnectionStateChange?.(this.pc.iceConnectionState);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[WebRTC] Sending ICE candidate`);
        this.signaling.send({ type: 'candidate', candidate: event.candidate.toJSON() });
      }
    };

    if (role === 'sender') {
      this.dc = this.pc.createDataChannel('file-transfer');
      console.log('[WebRTC] Created DataChannel (sender)');
      this.setupDataChannel();
    } else {
      this.pc.ondatachannel = (event) => {
        console.log('[WebRTC] Received DataChannel (receiver)');
        this.dc = event.channel;
        this.setupDataChannel();
      };
    }

    this.signaling.onMessage = async (msg: SignalingMessage) => {
      switch (msg.type) {
        case 'start':
        case 'ready': // Fallback for older worker deployments
          console.log('[WebRTC] Received start/ready signal. Generating offer...');
          if (this.dc) { // I am sender
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            console.log('[WebRTC] Sending offer');
            this.signaling.send({ type: 'offer', sdp: offer });
          }
          break;
        case 'offer':
          console.log('[WebRTC] Received offer. Setting remote description...');
          await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await this.processPendingCandidates();
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          console.log('[WebRTC] Sending answer');
          this.signaling.send({ type: 'answer', sdp: answer });
          break;
        case 'answer':
          console.log('[WebRTC] Received answer. Setting remote description...');
          await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await this.processPendingCandidates();
          break;
        case 'candidate':
          if (msg.candidate) {
            if (this.pc.remoteDescription) {
              console.log('[WebRTC] Adding ICE candidate immediately');
              try {
                await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } catch (e) {
                console.error('[WebRTC] Failed to add ICE candidate', e);
              }
            } else {
              console.log('[WebRTC] Queuing ICE candidate (remote description not set)');
              this.pendingCandidates.push(msg.candidate);
            }
          }
          break;
        default:
          break;
      }
    };
  }

  private async processPendingCandidates() {
    for (const candidate of this.pendingCandidates) {
      console.log('[WebRTC] Processing queued ICE candidate');
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('[WebRTC] Failed to add queued ICE candidate', e);
      }
    }
    this.pendingCandidates = [];
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

  private connectionTimeoutId: number | null = null;

  async connect() {
    // 30 second global timeout for entire WebRTC establishment
    this.connectionTimeoutId = window.setTimeout(() => {
      console.error('[WebRTC] Connection timeout reached (30s). Failing connection.');
      this.disconnect();
      this.onConnectionStateChange?.('failed' as RTCIceConnectionState);
    }, 30000);

    this.signaling.onClose = () => {
      if (this.pc.iceConnectionState !== 'connected' && this.pc.iceConnectionState !== 'completed') {
        this.onConnectionStateChange?.('failed' as RTCIceConnectionState);
      }
    };
    
    this.signaling.onOpen = () => {
      // Send ready signal immediately to accommodate older worker deployments
      // that do not send 'start' automatically.
      this.signaling.send({ type: 'ready' } as unknown as SignalingMessage);
    };
    
    this.signaling.connect();
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
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
    console.log('[WebRTC] Disconnecting peer and signaling');
    this.dc?.close();
    this.pc.close();
    this.signaling.disconnect();
  }
}
