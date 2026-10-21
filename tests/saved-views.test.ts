import { describe, expect, test } from 'vitest';
import { preferencesSchema } from '../shared/schemas';

function view(index: number) {
  return {
    id: `view-${index}`,
    name: `View ${index}`,
    boardFilter: null,
    dateFilter: 'all' as const,
    favoritesOnly: false,
  };
}

describe('saved queue views', () => {
  test('accepts 20 views and rejects 21', () => {
    expect(
      preferencesSchema.safeParse({
        savedQueueViews: Array.from({ length: 20 }, (_, index) => view(index)),
      }).success,
    ).toBe(true);
    expect(
      preferencesSchema.safeParse({
        savedQueueViews: Array.from({ length: 21 }, (_, index) => view(index)),
      }).success,
    ).toBe(false);
  });
});
