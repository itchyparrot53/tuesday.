import { AxeBuilder } from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { expect, type Locator, type Page } from '@playwright/test';
import type { Preferences } from '../shared/types';

export async function axeCheck(page: Page, label = ''): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  if (serious.length) {
    throw new Error(
      serious
        .map(
          (violation) =>
            `${violation.id}: ${violation.help}${label ? ` [${label}]` : ''}\n${violation.nodes
              .slice(0, 4)
              .map(
                (node) =>
                  `  ${node.target.join(' ')}${node.failureSummary ? `\n    ${node.failureSummary.replace(/\n/g, '\n    ')}` : ''}\n    HTML: ${node.html.slice(0, 600)}`,
              )
              .join('\n')}`,
        )
        .join('\n'),
    );
  }
}

export async function setPrefs(page: Page, prefs: Partial<Preferences>): Promise<void> {
  try {
    await page.request.patch('/api/me', { data: { preferences: prefs } });
  } catch {}
  await page.evaluate((next) => {
    try {
      const current = JSON.parse(localStorage.getItem('tuesday:prefs') ?? '{}');
      localStorage.setItem('tuesday:prefs', JSON.stringify({ ...current, ...next }));
    } catch {}
  }, prefs);
  await page.reload();
  await page.waitForTimeout(250);
}

export async function designShots(
  page: Page,
  name: string,
  options: { axe?: boolean; density?: 'comfortable' | 'compact' } = {},
): Promise<void> {
  mkdirSync('e2e/screenshots/design', { recursive: true });
  const density = options.density ?? 'comfortable';
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 375] as const) {
      await page.setViewportSize({ width, height: 900 });
      try {
        await page.request.patch('/api/me', { data: { preferences: { theme, density } } });
      } catch {}
      await page.evaluate(
        ({ nextTheme, nextDensity }) => {
          try {
            const current = JSON.parse(localStorage.getItem('tuesday:prefs') ?? '{}');
            const next = { ...current, theme: nextTheme, density: nextDensity };
            localStorage.setItem('tuesday:prefs', JSON.stringify(next));
          } catch {}
          document.documentElement.dataset.theme = nextTheme;
          document.documentElement.dataset.density = nextDensity;
        },
        { nextTheme: theme, nextDensity: density },
      );
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `e2e/screenshots/design/${name}-${theme}-${width}.png`,
        fullPage: true,
      });
      if (options.axe !== false) await axeCheck(page, `${name} ${theme} ${width}`);
      if (width === 375 && !name.startsWith('board-')) {
        await expectNoHorizontalScroll(page);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    try {
      const current = JSON.parse(localStorage.getItem('tuesday:prefs') ?? '{}');
      localStorage.setItem(
        'tuesday:prefs',
        JSON.stringify({ ...current, theme: 'light', density: 'comfortable' }),
      );
    } catch {}
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.density = 'comfortable';
  });
  await page.waitForTimeout(350);
}

export async function expectStyle(
  locator: Locator,
  prop: string,
  expected: string | RegExp,
): Promise<void> {
  const value = await locator.evaluate(
    (element, property) => getComputedStyle(element).getPropertyValue(property),
    prop,
  );
  if (typeof expected === 'string') expect(value.trim()).toBe(expected);
  else expect(value.trim()).toMatch(expected);
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const result = await page.evaluate(() => ({
    scroll: document.scrollingElement?.scrollWidth ?? 0,
    width: window.innerWidth,
  }));
  expect(result.scroll).toBeLessThanOrEqual(result.width + 1);
}
