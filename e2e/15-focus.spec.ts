import { expect, test } from '@playwright/test';
import { H, signIn } from './helpers';
import { seed } from './seed';

async function resetSeededView(page: import('@playwright/test').Page, boardId: number) {
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const view = full.views[0];
  await page.request.patch(`/api/views/${view.id}`, {
    headers: H,
    data: {
      settings: {
        ...view.settings,
        search: '',
        filters: [],
        personUserId: null,
        hiddenColumnIds: [],
      },
    },
  });
}

test('keyboard: Skip to content is the first focus stop', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
});

test('keyboard: a done status cell shows the check icon', async ({ page }) => {
  await signIn(page);
  const data = await seed(page);
  await resetSeededView(page, data.boardId);
  await page.goto(`/boards/${data.boardId}`);
  await page.waitForLoadState('networkidle');
  const done = page
    .locator('[data-column-title="Status"] .status-cell')
    .filter({ hasText: 'Done' })
    .first();
  await expect(done.locator('svg')).toBeVisible();
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a drawer opens without motion', async ({ page }) => {
    await signIn(page);
    const data = await seed(page);
    await page.goto(`/boards/${data.boardId}`);
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="item-row"]').first().getByTestId('item-open').click();
    const panel = page.locator('.drawer-panel');
    await expect(panel).toBeVisible();
    const seconds = await panel.evaluate((element) =>
      parseFloat(getComputedStyle(element).animationDuration),
    );
    expect(seconds).toBeLessThanOrEqual(0.001);
  });
});
