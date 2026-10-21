import type { FastifyReply } from 'fastify';
import type { AiStreamEvent } from '../../shared/ai';

export function startNdjson(reply: FastifyReply): {
  emit(event: AiStreamEvent): void;
  end(): void;
} {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  });
  return {
    emit: (event) => {
      if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(event) + '\n');
    },
    end: () => {
      if (!reply.raw.writableEnded) reply.raw.end();
    },
  };
}
