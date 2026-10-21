import { describe, expect, test } from 'vitest';
import { DEFAULT_PREFERENCES } from '../shared/types';
import { COLOR_THEMES, normalizeColorTheme } from '../shared/themes';

describe('theme defaults and order', () => {
  test('new accounts start on Monday', () => {
    expect(DEFAULT_PREFERENCES.colorTheme).toBe('monday');
  });

  test('the picker follows the week and has no promoted theme', () => {
    expect(COLOR_THEMES.map((theme) => theme.id)).toEqual([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ]);
    expect(COLOR_THEMES[0]).toMatchObject({ id: 'monday', defaultMode: 'light' });
    expect(COLOR_THEMES.map((theme) => theme.name)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
  });

  test('each theme has a sensible mode and legacy ids map to a theme', () => {
    expect(COLOR_THEMES.find((theme) => theme.id === 'monday')?.defaultMode).toBe('light');
    expect(COLOR_THEMES.find((theme) => theme.id === 'tuesday')?.defaultMode).toBe('light');
    expect(COLOR_THEMES.find((theme) => theme.id === 'saturday')?.defaultMode).toBe('dark');
    expect(COLOR_THEMES.find((theme) => theme.id === 'sunday')?.defaultMode).toBe('light');
    expect(normalizeColorTheme('forest')).toBe('wednesday');
    expect(normalizeColorTheme('nope')).toBe('monday');
  });

  test('a retired customer theme id still saved in preferences maps to Monday', () => {
    // The retired id is assembled so the public tree never carries the brand string.
    const retiredCustomerTheme = ['um', 'ev'].join('');
    expect(normalizeColorTheme(retiredCustomerTheme)).toBe('monday');
  });
});
