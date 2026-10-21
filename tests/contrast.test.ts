import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { COLOR_THEME_IDS } from '../shared/themes';
import { contrastRatio } from '../web/src/lib/labelColors';

const css = readFileSync(new URL('../web/src/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

type Declarations = Record<string, string>;

function parseBlocks(source: string): Map<string, Declarations> {
  const blocks = new Map<string, Declarations>();
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const raw = match[1].replace(/\/\*[\s\S]*?\*\//g, '');
    const selector =
      raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .pop()
        ?.replace(/\s+/g, ' ') ?? '';
    const declarations: Declarations = {};
    for (const declaration of match[2].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
      declarations[declaration[1]] = declaration[2];
    }
    if (Object.keys(declarations).length > 0) blocks.set(selector, declarations);
  }
  return blocks;
}

const blocks = parseBlocks(css);

const root = blocks.get(':root') ?? {};
const darkRoot = blocks.get(":root[data-theme='dark']") ?? {};

function resolve(theme: string, mode: 'light' | 'dark'): Declarations {
  const themeBlock = blocks.get(`:root[data-theme='${mode}'][data-color-theme='${theme}']`) ?? {};
  return { ...(mode === 'dark' ? darkRoot : root), ...themeBlock };
}

const pairs: { name: string; foreground: string; background: string }[] = [
  { name: 'ink on canvas', foreground: 'ink', background: 'canvas' },
  { name: 'ink on surface', foreground: 'ink', background: 'surface' },
  { name: 'muted on surface', foreground: 'muted', background: 'surface' },
  { name: 'danger-text on danger-soft', foreground: 'danger-text', background: 'danger-soft' },
];

describe('theme contrast', () => {
  for (const theme of COLOR_THEME_IDS) {
    for (const mode of ['light', 'dark'] as const) {
      test(`${theme} ${mode} meets AA for every text pair`, () => {
        const tokens = resolve(theme, mode);
        for (const pair of pairs) {
          const foreground = tokens[pair.foreground];
          const background = tokens[pair.background];
          expect(foreground, `${theme} ${mode}: --${pair.foreground} missing`).toBeTruthy();
          expect(background, `${theme} ${mode}: --${pair.background} missing`).toBeTruthy();
          const ratio = contrastRatio(foreground, background);
          expect(
            ratio,
            `${theme} ${mode}: ${pair.name} is ${ratio.toFixed(2)}:1 (${foreground} on ${background})`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

describe('theme boot script', () => {
  test('every colour theme id is listed before first paint', () => {
    for (const id of COLOR_THEME_IDS) {
      expect(html, `web/index.html boot script is missing "${id}"`).toContain(`'${id}'`);
    }
  });
});
