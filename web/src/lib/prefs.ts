import { DEFAULT_PREFERENCES, type Preferences } from '../../../shared/types';
import { normalizeColorTheme } from '../../../shared/themes';

let media: MediaQueryList | null = null;
let current: Preferences = { ...DEFAULT_PREFERENCES };

export function resolveTheme(preference: Preferences['theme']): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function paint(p: Preferences): void {
  document.documentElement.dataset.theme = resolveTheme(p.theme);
  document.documentElement.dataset.density = p.density;
  document.documentElement.dataset.colorTheme = p.colorTheme;
}

export function applyPrefs(p: Preferences): void {
  current = { ...DEFAULT_PREFERENCES, ...p, colorTheme: normalizeColorTheme(p.colorTheme) };
  paint(current);
  try {
    localStorage.setItem('tuesday:prefs', JSON.stringify(current));
  } catch {}
  if (!media && typeof window !== 'undefined' && window.matchMedia) {
    media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener?.('change', () => {
      if (current.theme === 'system') paint(current);
    });
  }
}

export function cachedPrefs(): Preferences {
  try {
    const stored = JSON.parse(
      localStorage.getItem('tuesday:prefs') ?? '{}',
    ) as Partial<Preferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...stored,
      colorTheme: normalizeColorTheme(stored.colorTheme),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function currentPrefs(): Preferences {
  return current;
}
