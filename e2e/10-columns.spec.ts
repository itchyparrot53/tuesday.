import { expect, test } from '@playwright/test';
import { H, createBoard, shot, signIn } from './helpers';

async function addColumn(page: import('@playwright/test').Page, label: string) {
  await page.getByTestId('add-column').click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

test('advanced columns: formula, dependency, timeline arrows, connect, mirror and time', async ({
  page,
}) => {
  await signIn(page);
  const { boardId } = await createBoard(page, `Advanced ${Date.now()}`);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const groupId = full.groups[0].id;
  const addItem = async (name: string) => {
    const res = await page.request.post(`/api/boards/${boardId}/items`, {
      headers: H,
      data: { groupId, name },
    });
    return (await res.json()).item.id as number;
  };
  const alphaId = await addItem('Alpha');
  const betaId = await addItem('Beta');

  const secondName = `Target ${Date.now()}`;
  const second = await createBoard(page, secondName);
  const targetFull = await (await page.request.get(`/api/boards/${second.boardId}`)).json();
  const targetStatus = targetFull.columns.find(
    (column: { type: string }) => column.type === 'status',
  );
  const targetItemRes = await page.request.post(`/api/boards/${second.boardId}/items`, {
    headers: H,
    data: {
      groupId: targetFull.groups[0].id,
      name: 'Target item',
      values: { [targetStatus.id]: { labelId: 'done' } },
    },
  });
  const targetItem = (await targetItemRes.json()).item.id as number;

  await page.goto(`/boards/${boardId}`);

  await addColumn(page, 'Numbers');
  const hoursHeader = page
    .locator('[data-testid="column-header"][data-column-title="Numbers"]')
    .first();
  await expect(hoursHeader).toBeVisible();
  const alphaRow = page.locator('[data-testid="item-row"][data-item-name="Alpha"]');
  await alphaRow.locator('[data-testid="cell"][data-column-title="Numbers"]').click();
  await alphaRow.locator('[data-testid="cell"][data-column-title="Numbers"] input').fill('3');
  await alphaRow.locator('[data-testid="cell"][data-column-title="Numbers"] input').press('Enter');
  await page.waitForTimeout(300);

  await addColumn(page, 'Formula');
  const formulaDialog = page.getByRole('dialog');
  await formulaDialog.locator('input').first().fill('Double');
  await formulaDialog.locator('textarea').fill('{Numbers} * 2');
  await formulaDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(
    page.locator('[data-testid="column-header"][data-column-title="Double"]').first(),
  ).toBeVisible();
  await expect(
    page.locator(
      '[data-testid="item-row"][data-item-name="Alpha"] [data-testid="cell"][data-column-title="Double"]',
    ),
  ).toContainText('6');

  await addColumn(page, 'Dependency');
  await page.getByRole('dialog').locator('input').first().fill('Blocked by');
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  const betaRow = page.locator('[data-testid="item-row"][data-item-name="Beta"]');
  await betaRow.locator('[data-testid="cell"][data-column-title="Blocked by"]').click();
  await page
    .locator('[data-radix-popper-content-wrapper] label')
    .filter({ hasText: 'Alpha' })
    .click();
  await page.keyboard.press('Escape');
  await expect(
    betaRow.locator('[data-testid="cell"][data-column-title="Blocked by"]'),
  ).toContainText('Alpha');

  await addColumn(page, 'Timeline');
  const setWindow = async (row: ReturnType<typeof page.locator>, from: string, to: string) => {
    await row.locator('[data-testid="cell"][data-column-title="Timeline"]').click();
    const inputs = page.locator('[data-radix-popper-content-wrapper] input[type="date"]');
    await inputs.nth(0).fill(from);
    await inputs.nth(1).fill(to);
    await page.getByRole('button', { name: 'Save', exact: true }).last().click();
    await page.waitForTimeout(250);
  };
  await setWindow(alphaRow, '2026-09-01', '2026-09-10');
  await setWindow(betaRow, '2026-09-05', '2026-09-15');

  await page.getByTestId('view-picker').click();
  await page.getByRole('menuitem', { name: 'Timeline' }).click();
  await page.getByRole('button', { name: 'View settings' }).click();
  await page.getByLabel('Timeline column').click();
  await page.getByRole('menuitemradio', { name: 'Timeline' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('timeline-bar').first()).toBeVisible();
  await expect(page.locator('svg path').first()).toBeVisible();
  await page.getByTestId('timeline-bar').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, 'p2-gantt-deps');
  const alphaBar = page.locator(`[data-testid="timeline-bar"][data-item-id="${alphaId}"]`);
  const barBox = await alphaBar.boundingBox();
  if (!barBox) throw new Error('Timeline bar missing');
  await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(barBox.x + barBox.width / 2 + 28, barBox.y + barBox.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const closePanel = page.getByLabel('Close item panel');
  if (await closePanel.isVisible().catch(() => false)) await closePanel.click();
  let moved = await (await page.request.get(`/api/boards/${boardId}/items`)).json();
  let alphaMoved = moved.items.find((entry: { id: number }) => entry.id === alphaId);
  const timelineColumn = (
    await (await page.request.get(`/api/boards/${boardId}`)).json()
  ).columns.find((column: { title: string }) => column.title === 'Timeline');
  expect(alphaMoved.values[String(timelineColumn.id)].from).not.toBe('2026-09-01');
  await page.reload();
  const closePanelAgain = page.getByLabel('Close item panel');
  if (await closePanelAgain.isVisible().catch(() => false)) await closePanelAgain.click();
  moved = await (await page.request.get(`/api/boards/${boardId}/items`)).json();
  alphaMoved = moved.items.find((entry: { id: number }) => entry.id === alphaId);
  expect(alphaMoved.values[String(timelineColumn.id)].from).not.toBe('2026-09-01');
  void betaId;

  await page.getByRole('tab', { name: 'Main table' }).click();
  await addColumn(page, 'Connect boards');
  await page.getByRole('dialog').locator('input').first().fill('Connected');
  await page.getByRole('dialog').locator('select').selectOption({ label: secondName });
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForTimeout(400);
  await page
    .locator('[data-testid="item-row"][data-item-name="Alpha"]')
    .locator('[data-testid="cell"][data-column-title="Connected"]')
    .click();
  await page
    .locator('[data-radix-popper-content-wrapper] label')
    .filter({ hasText: 'Target item' })
    .click();
  await page.keyboard.press('Escape');
  await expect(
    page
      .locator('[data-testid="item-row"][data-item-name="Alpha"]')
      .locator('[data-testid="cell"][data-column-title="Connected"]'),
  ).toContainText('Target item');

  await addColumn(page, 'Mirror');
  await page.getByRole('dialog').locator('input').first().fill('Mirror status');
  const mirrorSelects = page.getByRole('dialog').locator('select');
  await mirrorSelects.nth(0).selectOption({ label: 'Connected' });
  await page.waitForTimeout(300);
  await mirrorSelects.nth(1).selectOption({ label: 'Status' });
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  await expect(
    page
      .locator('[data-testid="item-row"][data-item-name="Alpha"]')
      .locator('[data-testid="cell"][data-column-title="Mirror status"]'),
  ).toContainText('Done');

  await addColumn(page, 'Time tracking');
  await page.getByRole('dialog').locator('input').first().fill('Time');
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForTimeout(300);
  await page
    .locator('[data-testid="item-row"][data-item-name="Alpha"]')
    .locator('[data-testid="cell"][data-column-title="Time"]')
    .getByLabel('Start timer')
    .click();
  await page.waitForTimeout(2200);
  await page
    .locator('[data-testid="item-row"][data-item-name="Alpha"]')
    .locator('[data-testid="cell"][data-column-title="Time"]')
    .getByLabel('Stop timer')
    .click();
  await page.waitForTimeout(500);
  const items = await (await page.request.get(`/api/boards/${boardId}/items`)).json();
  const alpha = items.items.find((entry: { name: string }) => entry.name === 'Alpha');
  const timeColumn = (await (await page.request.get(`/api/boards/${boardId}`)).json()).columns.find(
    (column: { title: string }) => column.title === 'Time',
  );
  expect(alpha.values[String(timeColumn.id)].totalSeconds).toBeGreaterThanOrEqual(1);
  await shot(page, 'p2-columns');
  void targetItem;
});
