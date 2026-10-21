// @ts-nocheck
/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { registerRuntimeCaching } from './sw/routes';
import { toNotification } from './sw/push';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRuntimeCaching();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^\/f\//],
  }),
);

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const { title, options } = toNotification(data);
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.navigator.setAppBadge?.(Number(data.unread ?? 0)),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients[0];
      if (existing) {
        existing.focus();
        existing.navigate(url);
        return;
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === 'SKIP_WAITING') void self.skipWaiting();
  if (data?.type === 'CLEAR_API_CACHE') void caches.delete('tuesday-api');
});
