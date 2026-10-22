import { expect, test } from '@playwright/test';
import { addDays } from '../server/lib/timezone';
import { H, createBoard, signIn } from './helpers';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

test('Home bulk actions: complete three, undo, then snooze two', async ({ page }) => {
  const owner = await signIn(page);
  const boardName = `Bulk board ${Date.now()}`;
  const { boardId } = await createBoard(page, boardName);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const people = full.columns.find((column: { type: string }) => column.type === 'people');
  const date = full.columns.find((column: { type: string }) => column.type === 'date');

  for (let index = 0; index < 5; index++) {
    const response = await page.request.post(`/api/boards/${boardId}/items`, {
      headers: H,
      data: {
        groupId: full.groups[0].id,
        name: `Bulk item ${index + 1}`,
        values: {
          [String(people.id)]: { userIds: [owner.id] },
          [String(date.id)]: { date: today() },
        },
      },
    });
    expect(response.status()).toBe(201);
  }

  await page.request.patch('/api/me', {
    headers: H,
    data: {
      preferences: {
        homeBoardFilter: boardId,
        homeDateFilter: 'all',
        homeFavoritesOnly: false,
      },
    },
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('home-focus')).toContainText('Bulk item');
  await expect(page.getByLabel('Filter by board')).toContainText(boardName);

  const rows = page.getByTestId('home-queue').getByTestId('home-myday-row');
  await expect(rows).toHaveCount(4, { timeout: 15_000 });
  await expect(rows.first().getByRole('button', { name: /Change status/ })).toBeVisible();

  for (let index = 0; index < 3; index++) {
    await rows.nth(index).getByRole('checkbox').click();
  }
  await expect(page.getByTestId('home-bulk-bar')).toContainText('3 selected');
  await page.getByTestId('home-bulk-complete').click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('undo-toast')).toBeVisible();
  await page.getByTestId('undo-toast').getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(4);

  const names: string[] = [];
  for (let index = 0; index < 2; index++) {
    names.push(await rows.nth(index).locator('p').first().innerText());
    await rows.nth(index).getByRole('checkbox').click();
  }
  await page.getByTestId('home-bulk-snooze').click();
  await expect(page.getByTestId('undo-toast')).toBeVisible();
  const items = (await (await page.request.get(`/api/boards/${boardId}/items`)).json()).items as {
    name: string;
    values: Record<string, { date?: string }>;
  }[];
  for (const name of names) {
    const item = items.find((entry) => entry.name === name);
    expect(item?.values[String(date.id)]?.date).toBe(addDays(today(), 1));
  }

  await page.request.patch('/api/me', {
    headers: H,
    data: {
      preferences: {
        homeBoardFilter: null,
        homeDateFilter: 'all',
        homeFavoritesOnly: false,
      },
    },
  });
});
