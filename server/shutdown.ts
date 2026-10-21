import type { FastifyInstance } from 'fastify';

export async function gracefulShutdown(
  app: FastifyInstance,
  exit: (code: number) => void = (code) => process.exit(code),
): Promise<void> {
  const hard = setTimeout(() => exit(1), 10_000);
  try {
    (app as unknown as { stopBackground?: () => void }).stopBackground?.();
    for (const client of app.sseClients) {
      try {
        client.end();
      } catch {}
    }
    app.sseClients.clear();
    app.sseConnections = 0;
    const started = Date.now();
    for (;;) {
      const running = app.db
        .prepare("SELECT count(*) AS n FROM jobs WHERE status = 'running'")
        .get() as { n: number };
      if (running.n === 0 || Date.now() - started >= 8_000) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    try {
      app.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {}
    await app.close();
    clearTimeout(hard);
    exit(0);
  } catch {
    clearTimeout(hard);
    exit(1);
  }
}
