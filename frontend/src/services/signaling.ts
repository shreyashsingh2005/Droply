export type SignalingMessage = 
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | { type: 'peer-disconnected' }
  | { type: 'transfer-request'; files: { name: string, size: number, type: string }[] }
  | { type: 'transfer-accept' }
  | { type: 'transfer-reject' };

export class SignalingService {
  private ws: WebSocket | null = null;
  public onMessage: ((msg: SignalingMessage) => void) | null = null;
  public onOpen: (() => void) | null = null;
  public onClose: (() => void) | null = null;
  public onError: ((err: Event) => void) | null = null;

  private roomId: string;
  private role: 'sender' | 'receiver';

  constructor(roomId: string, role: 'sender' | 'receiver') {
    this.roomId = roomId;
    this.role = role;
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // In production, point to the Cloudflare Worker URL if provided via VITE_SIGNALING_URL.
    // Otherwise, fallback to the same host (if deployed together on Cloudflare Pages).
    const prodHost = import.meta.env.VITE_SIGNALING_URL || window.location.host;
    
    const wsUrl = import.meta.env.DEV 
      ? `ws://127.0.0.1:8787/room/${this.roomId}?role=${this.role}`
      : `${protocol}//${prodHost}/room/${this.roomId}?role=${this.role}`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SignalingMessage;
        this.onMessage?.(data);
      } catch (err) {
        console.error('Failed to parse signaling message', err);
      }
    };

    this.ws.onclose = () => {
      this.onClose?.();
    };

    this.ws.onerror = (err) => {
      this.onError?.(err);
    };
  }

  send(message: SignalingMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
