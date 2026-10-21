import { describe, expect, test } from 'vitest';
import { computeLabelStyle, contrastRatio, labelStyle } from '../web/src/lib/labelColors';

const solids = [
  '#2BB673',
  '#F5A524',
  '#E5484D',
  '#3E8EF7',
  '#8E59FF',
  '#FF6FB1',
  '#14B8A6',
  '#9CA3AF',
  '#EAB308',
  '#6366F1',
  '#F97316',
  '#84CC16',
];

describe('label colours', () => {
  test.each(solids)('%s has accessible text in both themes', (hex) => {
    for (const theme of ['light', 'dark'] as const) {
      const style = labelStyle(hex, theme);
      expect(contrastRatio(style.text, style.tint)).toBeGreaterThanOrEqual(4.5);
      expect(style.solid.toLowerCase()).toBe(hex.toLowerCase());
    }
  });

  test('unknown colours are computed to at least 4.5', () => {
    for (const theme of ['light', 'dark'] as const) {
      const style = computeLabelStyle('#123456', theme);
      expect(contrastRatio(style.text, style.tint)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
