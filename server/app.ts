import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { startupWarnings, type Config } from './config';
import { openDb, type Db } from './db/db';
import type { AiGateway as AiGatewayType } from './ai/gateway';
import { AppError } from './lib/errors';
import { authPlugin } from './auth/plugin';
import { authRoutes } from './auth/routes';
import { usersRoutes } from './routes/users';
import { workspacesRoutes } from './routes/workspaces';
import { boardsRoutes } from './routes/boards';
import { itemsRoutes } from './routes/items';
import { miscRoutes } from './routes/misc';
import { automationsRoutes } from './routes/automations';
import { workflowsRoutes } from './routes/workflows';
import { dashboardsRoutes } from './routes/dashboards';
import { filesRoutes } from './routes/files';
import { formsRoutes } from './routes/forms';
import { importexportRoutes } from './routes/importexport';
import { templatesRoutes } from './routes/templates';
import { columnsExtraRoutes } from './routes/columns-extra';
import { docsRoutes } from './routes/docs';
import { trashRoutes } from './routes/trash';
import { tokensRoutes } from './routes/tokens';
import { adminDataRoutes } from './routes/admin-data';
import { webhooksRoutes } from './routes/webhooks';
import { inboundWebhooksRoutes } from './routes/inbound-webhooks';
import { goLiveRoutes } from './routes/go-live';
import { homeRoutes } from './routes/home';
import { onboardingRoutes } from './routes/onboarding';
import { emailRoutes } from './routes/email';
import { unsubscribeRoutes } from './routes/unsubscribe';
import { sharingRoutes } from './routes/sharing';
import { auditRoutes } from './routes/audit';
import { knowledgeRoutes } from './routes/knowledge';
import { aiHelpersRoutes } from './routes/ai-helpers';
import { pushRoutes } from './routes/push';
import { opsRoutes } from './routes/ops';
import { metrics } from './services/metrics';
import { registerWebhookListener } from './services/webhooks';
import { realtimeRoutes } from './realtime/routes';
import { AiGateway } from './ai/gateway';
import { OpenRouterClient } from './ai/openrouter';
import { createFakeFetch } from './ai/fake';
import { aiRoutes } from './ai/routes';
import { resetRunning } from './jobs/queue';
import { startWorker } from './jobs/worker';
import { JOB_HANDLERS } from './jobs/handlers';
import { startScheduler } from './jobs/scheduler';
import { registerAutomationEngine } from './automations/engine';
import { registerWorkflowEngine } from './workflows/engine';
import { AI_COLUMN_HANDLERS } from './jobs/ai-column';
import { createMailer, type Mailer } from './email/mailer';
import { setMailMode } from './services/email';

export interface AppOptions {
  config: Config;
  dbPath?: string;
  aiFetch?: typeof fetch;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: Config;
    ai: AiGatewayType;
    mailer: Mailer;
    stopBackground: () => void;
    sseConnections: number;
    sseClients: Set<{ end: () => void }>;
  }
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: opts.config.logLevel },
    bodyLimit: 1_048_576,
    trustProxy: opts.config.trustProxy,
  });

  // Keep the exact JSON bytes so inbound webhooks can verify an HMAC signature.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const raw = typeof body === 'string' ? body : body.toString('utf8');
    (req as typeof req & { rawBody?: string }).rawBody = raw;
    if (!raw) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (error) {
      done(error as Error);
    }
  });

  const db = openDb(opts.dbPath ?? opts.config.databasePath);
  app.decorate('db', db);
  app.decorate('config', opts.config);

  const fetchImpl = opts.aiFetch ?? (opts.config.aiFake ? createFakeFetch() : fetch);
  const apiKey = opts.config.aiFake && !opts.aiFetch ? 'fake-key' : opts.config.openrouterApiKey;
  const ai = new AiGateway(
    db,
    opts.config,
    new OpenRouterClient(apiKey, opts.config.appUrl, fetchImpl),
  );
  app.decorate('ai', ai);
  const mailer = createMailer(opts.config);
  app.decorate('mailer', mailer);
  app.decorate('sseConnections', 0);
  app.decorate('sseClients', new Set<{ end: () => void }>());
  setMailMode(mailer.mode);
  app.log.info(
    mailer.mode === 'smtp'
      ? `Email: smtp via ${opts.config.smtp!.host}:${opts.config.smtp!.port}`
      : mailer.mode === 'fake'
        ? 'Email: fake (captured)'
        : 'Email: off',
  );
  for (const warning of startupWarnings(opts.config)) app.log.warn(warning);
  if (opts.config.aiFake) app.log.warn('AI_FAKE is on: AI responses are fake');
  let stopWorker: (() => void) | undefined;
  let stopScheduler: (() => void) | undefined;
  app.decorate('stopBackground', () => {
    stopWorker?.();
    stopScheduler?.();
  });
  app.addHook('onResponse', async (req, reply) => {
    metrics.http(reply.statusCode);
  });
  app.addHook('onClose', async () => {
    stopWorker?.();
    stopScheduler?.();
    db.close();
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      reply.code(err.status).send({
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      });
      return;
    }
    if (err instanceof ZodError) {
      reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid request', details: err.flatten() },
      });
      return;
    }
    if ((err as { statusCode?: number }).statusCode === 413) {
      reply.code(413).send({ error: { code: 'too_large', message: 'File is too large' } });
      return;
    }
    if ((err as { statusCode?: number }).statusCode === 429) {
      reply.code(429).send({ error: { code: 'rate_limited', message: (err as Error).message } });
      return;
    }
    req.log.error(err);
    reply.code(500).send({ error: { code: 'internal', message: 'Something went wrong' } });
  });

  app.get('/api/health', async () => ({ ok: true, version: '0.1.0' }));

  await app.register(multipart, {
    limits: { fileSize: opts.config.maxUploadMb * 1024 * 1024, files: 1 },
    throwFileSizeLimit: true,
  });
  await authPlugin(app, opts.config);
  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(workspacesRoutes);
  await app.register(boardsRoutes);
  await app.register(itemsRoutes);
  await app.register(miscRoutes);
  await app.register(automationsRoutes);
  await app.register(workflowsRoutes);
  await app.register(dashboardsRoutes);
  await app.register(filesRoutes);
  await app.register(formsRoutes);
  await app.register(importexportRoutes);
  await app.register(templatesRoutes);
  await app.register(columnsExtraRoutes);
  await app.register(docsRoutes);
  await app.register(trashRoutes);
  await app.register(tokensRoutes);
  await app.register(webhooksRoutes);
  await app.register(inboundWebhooksRoutes);
  await app.register(goLiveRoutes);
  await app.register(homeRoutes);
  await app.register(onboardingRoutes);
  await app.register(emailRoutes);
  await app.register(unsubscribeRoutes);
  await app.register(sharingRoutes);
  await app.register(auditRoutes);
  await app.register(knowledgeRoutes);
  await app.register(aiHelpersRoutes);
  await app.register(pushRoutes);
  await app.register(opsRoutes);
  await app.register(adminDataRoutes);
  await app.register(realtimeRoutes);
  await app.register(aiRoutes);

  resetRunning(db);
  const chunkCount = (
    db.prepare('SELECT count(*) AS n FROM knowledge_chunks').get() as { n: number }
  ).n;
  if (chunkCount === 0) {
    const { enqueue } = await import('./jobs/queue');
    enqueue(db, 'knowledge_backfill', {}, { dedupeKey: 'kb' });
  }
  registerAutomationEngine(app);
  registerWorkflowEngine(app);
  registerWebhookListener(app);
  if (process.env.NODE_ENV !== 'test') {
    stopWorker = startWorker(app, JOB_HANDLERS);
    stopScheduler = startScheduler(app);
  }

  if (opts.config.isProduction) {
    app.register(fastifyStatic, {
      root: path.join(path.dirname(fileURLToPath(import.meta.url)), '../web'),
      wildcard: false,
      cacheControl: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (/(sw\.js|registerSW\.js|manifest\.webmanifest|index\.html)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'no-cache');
        }
        if (filePath.endsWith('manifest.webmanifest')) {
          res.setHeader('Content-Type', 'application/manifest+json');
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
        return;
      }
      reply.sendFile('index.html');
    });
  }

  return app;
}
