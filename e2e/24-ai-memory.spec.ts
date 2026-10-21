import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, createBoard, signIn } from './helpers';

test('organisation memory: indexing, search page and admin status', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const { boardId } = await createBoard(page, `Memory board ${Date.now()}`);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const item = await page.request.post(`/api/boards/${boardId}/items`, {
    headers: H,
    data: { groupId: full.groups[0].id, name: 'Launch decision' },
  });
  const itemId = (await item.json()).item.id as number;
  await page.request.post(`/api/items/${itemId}/updates`, {
    headers: H,
    data: { body: 'We decided to move the launch to March' },
  });

  await expect
    .poll(
      async () => {
        const result = await page.request.get('/api/knowledge/search?q=launch%20March');
        const hits = (await result.json()).hits as { title: string }[];
        return hits.some((hit) => hit.title.includes('Launch decision'));
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  await page.goto('/search?q=launch');
  await expect(page.getByTestId('search-page')).toBeVisible();
  await expect(
    page.getByTestId('search-hit').filter({ hasText: 'Launch decision' }).first(),
  ).toBeVisible();
  await axeCheck(page, 'search page');

  await page.request.put('/api/ai/settings', {
    headers: H,
    data: {
      ...(await (await page.request.get('/api/ai/settings')).json()),
      memoryEnabled: true,
    },
  });
  await page.request.post('/api/knowledge/rebuild', { headers: H });
  await page.goto('/admin?tab=ai');
  await expect(page.getByTestId('ai-memory')).toBeVisible();
  await expect
    .poll(
      async () => {
        const status = await (await page.request.get('/api/knowledge/status')).json();
        return status.embedded as number;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await page.getByTestId('ai-memory-rebuild').click();
  await axeCheck(page, 'admin memory');

  await page.goto('/ai');
  await page.getByTestId('ask-ai').click();
  await page
    .getByTestId('ai-composer')
    .fill('/fake-tool {"name":"search_knowledge","args":{"query":"launch"}}');
  await page.getByTestId('ai-composer').press('Enter');
  await expect(page.getByTestId('ai-message-assistant').last()).toBeVisible({ timeout: 10_000 });
});
