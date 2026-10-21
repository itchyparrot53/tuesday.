import { expect, test } from 'vitest';
import { hashPassword, verifyPassword } from '../server/lib/password';
import { positionAfter, GAP } from '../server/lib/positions';

test('passwords hash and verify', async () => {
  const stored = await hashPassword('password123');
  expect(stored.startsWith('scrypt$16384$8$1$')).toBe(true);
  expect(await verifyPassword('password123', stored)).toBe(true);
  expect(await verifyPassword('wrong-password', stored)).toBe(false);
});

test('positionAfter places between neighbours', () => {
  expect(positionAfter(null, null)).toBe(GAP);
  expect(positionAfter(1000, null)).toBe(1000 + GAP);
  expect(positionAfter(null, 1000)).toBe(1000 - GAP);
  expect(positionAfter(1000, 2000)).toBe(1500);
});
