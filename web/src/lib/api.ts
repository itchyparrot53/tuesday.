export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

import { enqueue, isQueueable } from '../pwa/outbox';

export async function api<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'tuesday',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    const label = isQueueable(method, path);
    if (error instanceof TypeError && label) {
      await enqueue({
        method: method as 'POST' | 'PUT' | 'PATCH',
        path,
        body,
        label,
        userId: Number(localStorage.getItem('tuesday:last-user') ?? 0),
      });
      window.dispatchEvent(new Event('tuesday:offline'));
      return { queued: true } as T;
    }
    throw new ApiError(0, 'offline', "You're offline.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'internal',
      data?.error?.message ?? 'Request failed',
      data?.error?.details,
    );
  }
  return data as T;
}
