import { buildApp } from './app';
import { applyPendingRestore } from './services/backups';
import { loadConfig } from './config';
import { gracefulShutdown } from './shutdown';

const config = loadConfig();
applyPendingRestore(config);
const app = await buildApp({ config });

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await gracefulShutdown(app);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: '0.0.0.0' });
