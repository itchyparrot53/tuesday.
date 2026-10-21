import { useEffect, useState } from 'react';

export interface LabelStyle {
  solid: string;
  tint: string;
  text: string;
}

const TABLE: Record<string, { solid: string; light: [string, string]; dark: [string, string] }> = {
  green: { solid: '#2BB673', light: ['#D5F0E3', '#267552'], dark: ['#24493C', '#53C48E'] },
  amber: { solid: '#F5A524', light: ['#FDEDD3', '#906122'], dark: ['#614424', '#F6AC36'] },
  red: { solid: '#E5484D', light: ['#FADADB', '#AD3940'], dark: ['#5C2830', '#EE8488'] },
  blue: { solid: '#3E8EF7', light: ['#D8E8FD', '#3366B0'], dark: ['#2A3D63', '#72ADF9'] },
  violet: { solid: '#8E59FF', light: ['#E8DEFF', '#7348C9'], dark: ['#422D66', '#B390FF'] },
  pink: { solid: '#FF6FB1', light: ['#FFE2EF', '#A14974'], dark: ['#64344E', '#FF8FC2'] },
  teal: { solid: '#14B8A6', light: ['#D0F1ED', '#18736E'], dark: ['#1D494B', '#3CC4B5'] },
  grey: { solid: '#9CA3AF', light: ['#EBEDEF', '#686874'], dark: ['#46434E', '#AEB4BD'] },
  yellow: { solid: '#EAB308', light: ['#FBF0CE', '#886714'], dark: ['#5D481C', '#EAB50D'] },
  indigo: { solid: '#6366F1', light: ['#E0E0FC', '#5555C5'], dark: ['#353162', '#989AF6'] },
  orange: { solid: '#F97316', light: ['#FEE3D0', '#A44E1A'], dark: ['#623520', '#FA954E'] },
  lime: { solid: '#84CC16', light: ['#E6F5D0', '#54761B'], dark: ['#3F4F20', '#88CE1D'] },
};

export const LABEL_SOLIDS = Object.values(TABLE).map((entry) => entry.solid);
export const DEFAULT_LABEL_COLOR = TABLE.blue.solid;

function parse(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function mix(hex: string, target: string, ratio: number): string {
  const a = parse(hex);
  const b = parse(target);
  return toHex([
    a[0] + (b[0] - a[0]) * ratio,
    a[1] + (b[1] - a[1]) * ratio,
    a[2] + (b[2] - a[2]) * ratio,
  ]);
}

function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

export function computeLabelStyle(
  hex: string,
  theme: 'light' | 'dark',
  surface = theme === 'light' ? '#FFFFFF' : '#211A24',
): LabelStyle {
  const target = theme === 'light' ? '#1E1420' : '#FFFFFF';
  const tint = mix(hex, surface, theme === 'light' ? 0.8 : 0.7);
  let text = hex;
  let ratio = contrastRatio(text, tint);
  let step = 0;
  while (ratio < 4.6 && step <= 100) {
    step += 1;
    text = mix(hex, target, step / 100);
    ratio = contrastRatio(text, tint);
  }
  return { solid: hex, tint, text };
}

export function labelKey(hex: string): string {
  const normalized = hex.toLowerCase();
  const found = Object.entries(TABLE).find(([, row]) => row.solid.toLowerCase() === normalized);
  return found?.[0] ?? hex.toUpperCase();
}

export const SATURDAY_SHADES: Record<string, string> = {
  green: '#00C4D4',
  amber: '#22D3EE',
  red: '#00E5FF',
  blue: '#00B8D4',
  violet: '#66E0EE',
  pink: '#A5F3FC',
  teal: '#0E9FB3',
  grey: '#5F7F84',
  yellow: '#7DE7F2',
  indigo: '#38D6E8',
  orange: '#0891B2',
  lime: '#4DD8E6',
};

function activeColorTheme(): string | undefined {
  return typeof document === 'undefined' ? undefined : document.documentElement.dataset.colorTheme;
}

export function labelStyle(hex: string, theme: 'light' | 'dark'): LabelStyle {
  const normalized = hex.toLowerCase();
  if (activeColorTheme() === 'saturday') {
    const key = labelKey(normalized);
    const saturday = SATURDAY_SHADES[key] ?? '#00E5FF';
    return computeLabelStyle(saturday, theme, theme === 'light' ? '#FFFFFF' : '#0E0E0E');
  }
  const entry = Object.values(TABLE).find((row) => row.solid.toLowerCase() === normalized);
  if (!entry) return computeLabelStyle(hex, theme);
  const [tint, text] = theme === 'light' ? entry.light : entry.dark;
  return { solid: entry.solid, tint, text };
}

export function useTheme(): 'light' | 'dark' {
  const read = () => ({
    theme: (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
      ? 'dark'
      : 'light') as 'light' | 'dark',
    colorTheme:
      typeof document !== 'undefined' ? document.documentElement.dataset.colorTheme : undefined,
  });
  const [state, setState] = useState(read);
  useEffect(() => {
    const update = () =>
      setState((previous) => {
        const next = read();
        return previous.theme === next.theme && previous.colorTheme === next.colorTheme
          ? previous
          : next;
      });
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-color-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return state.theme;
}
