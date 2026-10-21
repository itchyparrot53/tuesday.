import { describe, expect, test } from 'vitest';
import { DEFAULT_ROUTING, FEATURE_LABELS } from '../shared/ai';

describe('AI feature catalogue', () => {
  test('every feature has a unique label', () => {
    const labels = Object.values(FEATURE_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('the old title alias is gone', () => {
    expect(Object.keys(DEFAULT_ROUTING)).not.toContain('title');
    expect(Object.values(FEATURE_LABELS)).not.toContain('Title');
  });
});
