export interface Env {
  ROOM_STATE: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env) {
    return handleRequest(request, env);
  }
};

async function handleRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (url.pathname === '/health') {
    return new Response('OK', { status: 200, headers: corsHeaders });
  }

  const pathParts = url.pathname.split('/');
  if (pathParts.length !== 3 || pathParts[1] !== 'room') {
    return new Response('Not found', { status: 404, headers: corsHeaders });
  }

  const roomId = pathParts[2];
  const id = env.ROOM_STATE.idFromName(roomId);
  const roomObject = env.ROOM_STATE.get(id);

  return roomObject.fetch(request);
}

export class RoomState {
  state: DurableObjectState;
  sessions: Map<WebSocket, { role: 'sender' | 'receiver' }>;
  
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.sessions = new Map();
  }

  async fetch(request: Request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }
    
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    
    if (role !== 'sender' && role !== 'receiver') {
      return new Response('Invalid role', { status: 400 });
    }

    // Role validation
    if (role === 'sender') {
      for (const existingSession of this.sessions.values()) {
        if (existingSession.role === 'sender') {
          return new Response('Room already has a sender', { status: 403 });
        }
      }
    } else {
      // receiver
      let hasSender = false;
      for (const existingSession of this.sessions.values()) {
        if (existingSession.role === 'receiver') {
          return new Response('Room already has a receiver', { status: 403 });
        }
        if (existingSession.role === 'sender') {
          hasSender = true;
        }
      }
      if (!hasSender) {
        // optionally, don't allow receiver without sender, but sender might drop and reconnect.
      }
    }
    
    const [client, server] = Object.values(new WebSocketPair());
    
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    server.accept();
    this.sessions.set(server, { role });
    
    server.addEventListener('message', event => {
      try {
        const data = JSON.parse(event.data as string);
        for (const [session] of this.sessions) {
          if (session !== server) {
            session.send(JSON.stringify(data));
          }
        }
      } catch (err) {
        // Ignore malformed
      }
    });
    
    server.addEventListener('close', () => {
      this.sessions.delete(server);
      for (const [session] of this.sessions) {
        try {
          session.send(JSON.stringify({ type: 'peer-disconnected' }));
        } catch(e) {}
      }
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}
