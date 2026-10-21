import { openDB } from 'idb';

export interface OutboxEntry {
  id?: number;
  method: 'POST' | 'PUT' | 'PATCH';
  path: string;
  body: unknown;
  label: string;
  createdAt: string;
  attempts: number;
  userId: number;
}

const QUEUEABLE: {
  method: string;
  pattern: RegExp;
  label: (match: RegExpMatchArray, body: unknown) => string;
}[] = [
  {
    method: 'PUT',
    pattern: /^\/items\/(\d+)\/values\/\d+$/,
    label: (match) => `Edit a field on item #${match[1]}`,
  },
  {
    method: 'PATCH',
    pattern: /^\/items\/(\d+)$/,
    label: (match) => `Rename item #${match[1]}`,
  },
  {
    method: 'POST',
    pattern: /^\/boards\/(\d+)\/items$/,
    label: (_match, body) => `Create ${(body as { name?: string })?.name ?? 'an item'}`,
  },
  {
    method: 'POST',
    pattern: /^\/items\/(\d+)\/updates$/,
    label: (match) => `Post an update on item #${match[1]}`,
  },
  {
    method: 'POST',
    pattern: /^\/notifications\/read$/,
    label: () => 'Mark notifications read',
  },
];

export function isQueueable(method: string, path: string): string | null {
  for (const entry of QUEUEABLE) {
    if (entry.method !== method) continue;
    const match = path.match(entry.pattern);
    if (match) return entry.label(match, undefined);
  }
  return null;
}

async function db() {
  return openDB('tuesday', 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('outbox')) {
        database.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

function notify(): void {
  window.dispatchEvent(new Event('tuesday:outbox-changed'));
}

export async function enqueue(
  entry: Omit<OutboxEntry, 'id' | 'attempts' | 'createdAt'>,
): Promise<void> {
  const connection = await db();
  await connection.add('outbox', {
    ...entry,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  notify();
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const connection = await db();
  const entries = (await connection.getAll('outbox')) as OutboxEntry[];
  return entries.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

export async function countOutbox(): Promise<number> {
  const connection = await db();
  return connection.count('outbox');
}

export async function clearOutbox(): Promise<void> {
  const connection = await db();
  await connection.clear('outbox');
  notify();
}

export async function replay(): Promise<{
  sent: number;
  failed: { label: string; message: string }[];
}> {
  const entries = await listOutbox();
  const connection = await db();
  const failed: { label: string; message: string }[] = [];
  let sent = 0;
  for (const entry of entries) {
    try {
      const response = await fetch(`/api${entry.path}`, {
        method: entry.method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tuesday' },
        body: JSON.stringify(entry.body ?? {}),
      });
      if (response.ok) {
        await connection.delete('outbox', entry.id as number);
        sent++;
        continue;
      }
      if (response.status >= 400 && response.status < 500) {
        const data = await response.json().catch(() => ({}));
        failed.push({ label: entry.label, message: data?.error?.message ?? 'Rejected' });
        await connection.delete('outbox', entry.id as number);
        continue;
      }
      await connection.put('outbox', { ...entry, attempts: entry.attempts + 1 });
      break;
    } catch {
      await connection.put('outbox', { ...entry, attempts: entry.attempts + 1 });
      break;
    }
  }
  notify();
  return { sent, failed };
}
