export type SignalingMessage = 
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | { type: 'peer-disconnected' }
  | { type: 'peer-connected'; role: string }
  | { type: 'start' }
  | { type: 'ready' }
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
    let wsUrl = '';
    
    if (import.meta.env.DEV) {
      wsUrl = `ws://127.0.0.1:8787/room/${this.roomId}?role=${this.role}`;
    } else {
      let prodHostEnv = import.meta.env.VITE_SIGNALING_URL;
      if (!prodHostEnv) {
        console.warn('[Signaling] VITE_SIGNALING_URL not set in environment. Falling back to default worker.');
        prodHostEnv = 'droply-signaling.shreyashsingh9717.workers.dev';
      }
      
      if (prodHostEnv) {
        // Use native URL parsing for absolute safety
        if (!/^https?:\/\//i.test(prodHostEnv) && !/^wss?:\/\//i.test(prodHostEnv)) {
          prodHostEnv = `https://${prodHostEnv}`;
        }
        
        try {
          const urlObj = new URL(prodHostEnv);
          urlObj.protocol = urlObj.protocol.replace(/^http/i, 'ws');
          // Set pathname explicitly (avoids double /room/room/ or trailing slash issues)
          urlObj.pathname = `/room/${this.roomId}`;
          urlObj.searchParams.set('role', this.role);
          wsUrl = urlObj.toString();
        } catch (e) {
          // Fallback just in case
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${protocol}//${window.location.host}/room/${this.roomId}?role=${this.role}`;
        }
      } else {
        // Fallback to same host
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/room/${this.roomId}?role=${this.role}`;
      }
    }
    
    console.log(`[Signaling] Connecting to ${wsUrl}`);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[Signaling] WebSocket connected successfully');
      this.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SignalingMessage;
        console.log(`[Signaling] Received message: ${data.type}`);
        this.onMessage?.(data);
      } catch (err) {
        console.error('[Signaling] Failed to parse signaling message', err);
      }
    };

    this.ws.onclose = (event) => {
      console.log(`[Signaling] WebSocket closed. Code: ${event.code}, Reason: ${event.reason || 'None'}`);
      this.onClose?.();
    };

    this.ws.onerror = (err) => {
      console.error('[Signaling] WebSocket error observed:', err);
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
