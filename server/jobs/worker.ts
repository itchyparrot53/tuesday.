import type { FastifyInstance } from 'fastify';
import { claimNext, complete, fail } from './queue';
import { metrics } from '../services/metrics';

export type JobHandler = (app: FastifyInstance, payload: any) => Promise<void>;

export function startWorker(
  app: FastifyInstance,
  handlers: Record<string, JobHandler>,
  options: { intervalMs?: number; concurrency?: number } = {},
): () => void {
  const intervalMs = options.intervalMs ?? 1000;
  const concurrency = options.concurrency ?? 2;
  let stopped = false;
  let active = 0;

  async function run(job: NonNullable<ReturnType<typeof claimNext>>) {
    try {
      const handler = handlers[job.kind];
      if (!handler) throw new Error(`No handler for job kind ${job.kind}`);
      await handler(app, JSON.parse(job.payload));
      complete(app.db, job.id);
      metrics.job(job.kind, 'done');
    } catch (err) {
      fail(app.db, job.id, err instanceof Error ? err.message : String(err));
      metrics.job(job.kind, 'failed');
    } finally {
      active--;
    }
  }

  function tick() {
    if (stopped) return;
    while (active < concurrency) {
      const job = claimNext(app.db);
      if (!job) break;
      active++;
      void run(job);
    }
  }

  const timer = setInterval(tick, intervalMs);
  tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export async function runOnce(
  app: FastifyInstance,
  handlers: Record<string, JobHandler>,
): Promise<number> {
  let processed = 0;
  for (;;) {
    const job = claimNext(app.db);
    if (!job) break;
    try {
      const handler = handlers[job.kind];
      if (!handler) throw new Error(`No handler for job kind ${job.kind}`);
      await handler(app, JSON.parse(job.payload));
      complete(app.db, job.id);
      metrics.job(job.kind, 'done');
    } catch (err) {
      fail(app.db, job.id, err instanceof Error ? err.message : String(err));
    }
    processed++;
  }
  return processed;
}
