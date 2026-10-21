import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

const API_CACHE = 'tuesday-api';
const STATIC_CACHE = 'tuesday-static';

const API_PATHS: RegExp[] = [
  /^\/api\/auth\/me$/,
  /^\/api\/home$/,
  /^\/api\/my-work$/,
  /^\/api\/notifications$/,
  /^\/api\/workspaces$/,
  /^\/api\/me\/favorites$/,
  /^\/api\/me\/shared-boards$/,
  /^\/api\/users$/,
  /^\/api\/ai\/conversations$/,
  /^\/api\/boards\/\d+$/,
  /^\/api\/boards\/\d+\/items$/,
];

export function registerRuntimeCaching(): void {
  registerRoute(
    ({ url, request }) =>
      request.method === 'GET' &&
      url.origin === self.location.origin &&
      API_PATHS.some((pattern) => pattern.test(url.pathname)),
    new NetworkFirst({
      cacheName: API_CACHE,
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 }),
        new CacheableResponsePlugin({ statuses: [200] }),
      ],
    }),
  );

  registerRoute(
    ({ request }) => ['font', 'image'].includes(request.destination),
    new CacheFirst({
      cacheName: STATIC_CACHE,
      plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 3600 })],
    }),
  );
}
