import { expect, test } from '@playwright/test';
import { H, signIn } from './helpers';
import { seed } from './seed';

test('colour themes apply immediately, persist and are available in settings', async ({ page }) => {
  await signIn(page);
  await page.goto('/profile');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('color-theme-monday').click();
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'monday');
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  );
  expect(accent.toLowerCase()).toBe('#0073ea');
  const canvas = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
  );
  expect(canvas.toLowerCase()).toBe('#f6f7fb');
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  const darkCanvas = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
  );
  expect(darkCanvas.toLowerCase()).toBe('#181b34');
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'monday');

  await page.getByTestId('color-theme-saturday').click();
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'saturday');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const saturdayDark = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      canvas: style.getPropertyValue('--canvas').trim(),
      accent: style.getPropertyValue('--accent').trim(),
    };
  });
  expect(saturdayDark.canvas.toLowerCase()).toBe('#000');
  expect(saturdayDark.accent.toLowerCase()).toBe('#00e5ff');
  await page.getByTestId('user-menu').click();
  await page.getByTestId('theme-option-light').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const saturdayLight = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      canvas: style.getPropertyValue('--canvas').trim(),
      accent: style.getPropertyValue('--accent').trim(),
    };
  });
  expect(saturdayLight.canvas.toLowerCase()).toBe('#f5f5f5');
  expect(saturdayLight.accent.toLowerCase()).toBe('#007f91');

  await page.getByTestId('user-menu').click();
  await page.getByTestId('color-theme-option-wednesday').click();
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'wednesday');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const wednesdayCanvas = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
  );
  expect(wednesdayCanvas.toLowerCase()).toBe('#f3f7f2');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'wednesday');

  await page.getByTestId('user-menu').click();
  await page.getByTestId('color-theme-option-sunday').click();
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'sunday');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('Saturday renders labels as cyan shades', async ({ page }) => {
  await signIn(page);
  const data = await seed(page);
  const full = await (await page.request.get(`/api/boards/${data.boardId}`)).json();
  await page.request.patch(`/api/views/${full.views[0].id}`, {
    headers: H,
    data: {
      settings: {
        ...full.views[0].settings,
        search: '',
        filters: [],
        personUserId: null,
        hiddenColumnIds: [],
      },
    },
  });
  await page.request.patch('/api/me', {
    data: { preferences: { theme: 'dark', colorTheme: 'saturday' } },
  });
  await page.goto(`/boards/${data.boardId}`);
  await page.waitForLoadState('networkidle');
  const pill = page.locator('[data-column-title="Status"] .status-pill').first();
  await expect(pill).toBeVisible();
  const [red, green, blue] = await pill.evaluate((element) => {
    const match = getComputedStyle(element).backgroundColor.match(/\d+/g) ?? [];
    return match.slice(0, 3).map(Number);
  });
  expect(blue).toBeGreaterThan(red);
  expect(green).toBeGreaterThan(red);
  await page.request.patch('/api/me', {
    data: { preferences: { theme: 'light', colorTheme: 'tuesday' } },
  });
});
