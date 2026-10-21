export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  unread: number;
}

export function toNotification(payload: PushPayload): {
  title: string;
  options: {
    body: string;
    tag: string;
    icon: string;
    badge: string;
    data: { url: string };
  };
} {
  const body = payload.body.length > 140 ? `${payload.body.slice(0, 137)}…` : payload.body;
  return {
    title: payload.title,
    options: {
      body,
      tag: payload.tag,
      icon: '/pwa-192x192.png',
      badge: '/badge-96.png',
      data: { url: payload.url },
    },
  };
}
