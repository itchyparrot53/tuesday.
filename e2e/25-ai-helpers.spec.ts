import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, createBoard, signIn } from './helpers';

test('AI helpers: filter, formula, suggestions and risk widget', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const { boardId } = await createBoard(page, `Helpers board ${Date.now()}`);
  await page.request.post(`/api/boards/${boardId}/columns`, {
    headers: H,
    data: { title: 'Formula', type: 'formula', settings: { expression: '1 + 1' } },
  });
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const date = full.columns.find((column: { type: string }) => column.type === 'date');
  await page.request.post(`/api/boards/${boardId}/items`, {
    headers: H,
    data: {
      groupId: full.groups[0].id,
      name: 'Write brief',
      values: { [String(date.id)]: { date: '2000-01-01' } },
    },
  });
  await page.goto(`/boards/${boardId}`);
  await page.getByTestId('ai-filter-open').click();
  await page.getByTestId('ai-filter-input').fill('Write brief');
  await page.getByTestId('ai-filter-input').press('Enter');
  await expect(page.getByTestId('ai-filter-chip')).toBeVisible();
  await expect(page.getByText('Write brief').first()).toBeVisible();
  await page.getByLabel('Clear AI filter').click();
  await expect(page.getByTestId('ai-filter-chip')).toHaveCount(0);
  await axeCheck(page, 'ai filter');

  await page.getByLabel('Column menu for Formula').first().click();
  await page.getByRole('menuitem', { name: 'Edit settings' }).click();
  await page.getByTestId('ai-formula-open').click();
  await page.getByLabel('Describe the formula').fill('add one and one');
  await page.getByRole('button', { name: 'Write formula' }).click();
  await expect(page.getByLabel('Expression')).toHaveValue('1 + 1');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Expression')).toHaveCount(0);

  await page.getByTestId('add-column').click();
  await page.getByTestId('ai-suggest-columns').click();
  await expect(page.getByTestId('column-suggestion').first()).toBeVisible();
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: /Add 1 columns/ }).click();
  await expect(page.getByText('Priority').first()).toBeVisible();

  const createdDashboard = await page.request.post('/api/dashboards', {
    headers: H,
    data: {
      workspaceId: full.board.workspaceId,
      name: `Risk dashboard ${Date.now()}`,
      boardIds: [boardId],
    },
  });
  expect(createdDashboard.status()).toBe(201);
  const createdId = (await createdDashboard.json()).dashboard.id as number;
  await page.request.patch(`/api/dashboards/${createdId}`, {
    headers: H,
    data: {
      widgets: [
        {
          id: 'risk-1',
          type: 'risk',
          title: 'Risks',
          w: 6,
          h: 2,
          config: { boardIds: [boardId], limit: 5 },
        },
      ],
    },
  });
  await page.goto(`/dashboards/${createdId}`);
  await expect(page.getByTestId('risk-widget')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('risk-row').first()).toBeVisible();
  await page.getByTestId('risk-explain').click();
  await expect(page.getByText('FAKE AI: 2 risks need attention.')).toBeVisible();
});
