import type { FastifyInstance } from 'fastify';
import type { StreamEvent } from '../../shared/types';
import { bus } from './bus';
import { boardAccess } from '../services/permissions';

export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/stream', async (req, reply) => {
    const user = req.user!;
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');
    app.sseConnections += 1;
    app.sseClients.add(reply.raw);

    const send = (event: StreamEvent) => {
      if (!reply.raw.writableEnded) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const unsubscribe = bus.subscribe((message) => {
      if (message.userId !== undefined && message.userId !== user.id) return;
      if (message.boardId !== undefined) {
        if (boardAccess(app.db, user, message.boardId) === 'none') return;
      }
      send(message.event);
    });

    const ping = setInterval(() => {
      if (!reply.raw.writableEnded) reply.raw.write(': ping\n\n');
    }, 25_000);

    req.raw.on('close', () => {
      clearInterval(ping);
      unsubscribe();
      app.sseClients.delete(reply.raw);
      app.sseConnections = Math.max(0, app.sseConnections - 1);
    });
  });
}
