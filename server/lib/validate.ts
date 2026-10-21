import type { z } from 'zod';
import { badRequest } from './errors';

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  return schema.parse(body);
}

export function parseId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id');
  return id;
}
