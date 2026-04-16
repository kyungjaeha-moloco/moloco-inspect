import type { Plugin, ViteDevServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

export function canvasApiPlugin(): Plugin {
  let wss: WebSocketServer;
  let activeClient: WebSocket | null = null;
  const pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }>();

  return {
    name: 'canvas-api',
    configureServer(server: ViteDevServer) {
      // WebSocket server
      wss = new WebSocketServer({ noServer: true });

      server.httpServer?.on('upgrade', (request, socket, head) => {
        if (request.url === '/__canvas_bridge') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        }
      });

      wss.on('connection', (ws) => {
        console.log('[canvas-api] Browser connected');
        activeClient = ws;

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            const pending = pendingRequests.get(msg.id);
            if (pending) {
              if (msg.error) {
                pending.reject(new Error(msg.error));
              } else {
                pending.resolve(msg.result);
              }
              pendingRequests.delete(msg.id);
            }
          } catch (e) {
            console.error('[canvas-api] Bad message:', e);
          }
        });

        ws.on('close', () => {
          console.log('[canvas-api] Browser disconnected');
          if (activeClient === ws) activeClient = null;
        });
      });

      // Helper to send command to browser and wait for response
      function sendCommand(type: string, payload?: any): Promise<any> {
        return new Promise((resolve, reject) => {
          if (!activeClient || activeClient.readyState !== WebSocket.OPEN) {
            reject(new Error('No browser connected. Open http://localhost:4180 first.'));
            return;
          }
          const id = randomUUID();
          pendingRequests.set(id, { resolve, reject });
          activeClient.send(JSON.stringify({ id, type, payload }));

          // Timeout after 10 seconds
          setTimeout(() => {
            if (pendingRequests.has(id)) {
              pendingRequests.delete(id);
              reject(new Error('Request timed out'));
            }
          }, 10000);
        });
      }

      // HTTP middleware
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url || '';

        if (!url.startsWith('/api/')) {
          return next();
        }

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // Parse body for POST/PATCH
        let body: any = {};
        if (req.method === 'POST' || req.method === 'PATCH') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk as Buffer);
          }
          try {
            body = JSON.parse(Buffer.concat(chunks).toString());
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            return;
          }
        }

        try {
          // Route handling
          if (url === '/api/state' && req.method === 'GET') {
            const result = await sendCommand('getState');
            res.writeHead(200);
            res.end(JSON.stringify(result));
          }
          else if (url === '/api/screens' && req.method === 'GET') {
            const result = await sendCommand('getScreens');
            res.writeHead(200);
            res.end(JSON.stringify(result));
          }
          else if (url.match(/^\/api\/screens\/[^/]+$/) && req.method === 'GET') {
            const id = url.split('/api/screens/')[1];
            const result = await sendCommand('getScreen', { id });
            res.writeHead(200);
            res.end(JSON.stringify(result));
          }
          else if (url === '/api/screens' && req.method === 'POST') {
            const result = await sendCommand('createScreen', body);
            res.writeHead(201);
            res.end(JSON.stringify(result));
          }
          else if (url.match(/^\/api\/screens\/[^/]+$/) && req.method === 'PATCH') {
            const id = url.split('/api/screens/')[1];
            const result = await sendCommand('updateScreen', { id, ...body });
            res.writeHead(200);
            res.end(JSON.stringify(result));
          }
          else if (url === '/api/edges' && req.method === 'POST') {
            const result = await sendCommand('createEdge', body);
            res.writeHead(201);
            res.end(JSON.stringify(result));
          }
          else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
          }
        } catch (err: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}
