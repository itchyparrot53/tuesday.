import { expect, test } from '@playwright/test';
import { H, createBoard, shot, signIn } from './helpers';

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function addDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return ymd(date);
}

test('views: kanban drag, calendar drag, timeline and My Work', async ({ page }) => {
  const owner = await signIn(page);
  const { boardId } = await createBoard(page, `Views ${Date.now()}`);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const status = full.columns.find((column: { type: string }) => column.type === 'status');
  const due = full.columns.find((column: { type: string }) => column.type === 'date');
  const ownerCol = full.columns.find((column: { type: string }) => column.type === 'people');
  const groupId = full.groups[0].id;
  const createItem = async (name: string, values: Record<string, unknown>) => {
    const res = await page.request.post(`/api/boards/${boardId}/items`, {
      headers: H,
      data: { groupId, name, values },
    });
    return (await res.json()).item.id as number;
  };
  const kanbanItem = await createItem('Kanban task', {
    [ownerCol.id]: { userIds: [owner.id] },
    [status.id]: { labelId: 'todo' },
    [due.id]: { date: addDays(2) },
  });
  await createItem('Calendar task', {
    [ownerCol.id]: { userIds: [owner.id] },
    [status.id]: { labelId: 'progress' },
    [due.id]: { date: addDays(2) },
  });
  await createItem('Overdue task', {
    [ownerCol.id]: { userIds: [owner.id] },
    [status.id]: { labelId: 'todo' },
    [due.id]: { date: addDays(-1) },
  });

  await page.goto(`/boards/${boardId}`);
  await page.getByTestId('view-picker').click();
  await page.getByRole('menuitem', { name: 'Kanban' }).click();
  await expect(page.locator('[data-testid="kanban-lane"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'View settings' }).click();
  await page.getByLabel('Group kanban by').click();
  await page.getByRole('menuitemradio', { name: 'Status' }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  const card = page.locator(`[data-testid="kanban-card"][data-item-id="${kanbanItem}"]`);
  const doneLane = page.locator('[data-testid="kanban-lane"][data-lane-label="Done"]');
  const from = await card.boundingBox();
  const to = await doneLane.boundingBox();
  if (!from || !to) throw new Error('Kanban card or lane missing');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(
    page
      .locator('[data-testid="kanban-lane"][data-lane-label="Done"]')
      .locator(`[data-testid="kanban-card"][data-item-id="${kanbanItem}"]`),
  ).toBeVisible();
  await page.locator('[data-testid="kanban-lane"]').last().scrollIntoViewIfNeeded();
  await shot(page, 'p2-kanban');

  await page.getByTestId('view-picker').click();
  await page.getByRole('menuitem', { name: 'Calendar' }).click();
  await expect(page.getByTestId('calendar-day').first()).toBeVisible();
  const chipDay = addDays(2);
  const targetDay = addDays(3);
  const chip = page.locator(`[data-testid="calendar-chip"][data-item-id="${kanbanItem}"]`);
  await expect(chip).toBeVisible();
  const chipBox = await chip.boundingBox();
  const target = page.locator(`[data-testid="calendar-day"][data-date="${targetDay}"]`);
  const targetBox = await target.boundingBox();
  if (!chipBox || !targetBox) throw new Error('Calendar chip or day missing');
  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(
    page
      .locator(`[data-testid="calendar-day"][data-date="${targetDay}"]`)
      .locator(`[data-testid="calendar-chip"][data-item-id="${kanbanItem}"]`),
  ).toBeVisible();
  await shot(page, 'p2-calendar');

  await page.getByTestId('view-picker').click();
  await page.getByRole('menuitem', { name: 'Timeline' }).click();
  await expect(page.getByTestId('timeline-bar').first()).toBeVisible();
  await shot(page, 'p2-timeline');

  await page.goto('/my-work');
  const overdue = page.locator('[data-testid="mywork-bucket"][data-bucket="overdue"]');
  await expect(overdue).toContainText('Overdue task');
  await shot(page, 'p2-mywork');
  expect(chipDay).toBeTruthy();
});
