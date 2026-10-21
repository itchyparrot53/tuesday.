import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { Config } from '../config';
import type { User } from '../../shared/types';
import { AppError } from '../lib/errors';
import {
  getSessionUser,
  extendSession,
  setSessionCookie,
  sessionNeedsExtension,
  touchSession,
} from './sessions';
import { getTokenBySecret, touchToken } from '../services/tokens';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    authKind?: 'session' | 'token';
  }
}

const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'GET /api/auth/state',
  'POST /api/auth/setup',
  'POST /api/auth/login',
  'POST /api/auth/forgot',
  'GET /api/auth/reset/:token',
  'POST /api/auth/reset',
  'GET /api/auth/oidc/start',
  'GET /api/auth/oidc/callback',
  'GET /api/health/deep',
  'GET /api/metrics',
  'GET /api/invites/:token',
  'POST /api/auth/accept-invite',
  'GET /api/public/forms/:token',
  'POST /api/public/forms/:token',
  'POST /api/email/unsubscribe',
  'POST /api/hooks/board/:token',
]);

const tokenRate = new Map<string, { windowStart: number; count: number }>();

export async function authPlugin(app: FastifyInstance, config: Config): Promise<void> {
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;

    const authorization = req.headers.authorization;
    if (authorization?.startsWith('Bearer tue_')) {
      const token = authorization.slice('Bearer '.length);
      const found = getTokenBySecret(app.db, token);
      if (!found) throw new AppError(401, 'unauthenticated', 'Invalid API token');
      const windowStart = Math.floor(Date.now() / 60_000);
      const bucket = tokenRate.get(found.prefix);
      if (!bucket || bucket.windowStart !== windowStart) {
        tokenRate.set(found.prefix, { windowStart, count: 1 });
      } else {
        bucket.count++;
        if (bucket.count > 600) throw new AppError(429, 'rate_limited', 'Too many requests');
      }
      if (found.scope === 'read' && req.method !== 'GET') {
        throw new AppError(403, 'forbidden', 'This token is read-only');
      }
      req.user = found.user;
      req.authKind = 'token';
      touchToken(app.db, found.id, found.lastUsedAt);
      return;
    }

    const route = req.routeOptions?.url;
    const inboundHook = req.method === 'POST' && route === '/api/hooks/board/:token';
    if (
      !inboundHook &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      req.headers['x-requested-with'] !== 'tuesday'
    ) {
      throw new AppError(403, 'csrf', 'Missing request header');
    }

    const token = req.cookies.tue_session;
    if (token) {
      const found = getSessionUser(app.db, token);
      if (found) {
        req.user = found.user;
        touchSession(app.db, token);
        if (sessionNeedsExtension(found.expiresAt)) {
          extendSession(app.db, token);
          setSessionCookie(reply, token, config);
        }
      }
    }

    const key = `${req.method} ${route}`;
    if (!req.user && !PUBLIC_ROUTES.has(key)) {
      throw new AppError(401, 'unauthenticated', 'Sign in to continue');
    }
  });
}
