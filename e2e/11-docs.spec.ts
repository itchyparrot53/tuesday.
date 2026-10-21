import { expect, test } from '@playwright/test';
import { createBoard, shot, signIn } from './helpers';

test('docs: edit, preview, conflict and meeting notes to items', async ({ page, context }) => {
  await signIn(page);
  const { boardId, workspaceId } = await createBoard(page, `Docs board ${Date.now()}`);

  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Doc', exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/\d+/);
  await page.getByLabel('Doc title').fill('Team handbook');
  await page.getByTestId('doc-editor').fill('# Handbook\n\n- [x] First task\n- [ ] Second task');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 5000 });
  const docUrl = page.url();

  await page.reload();
  await expect(page.getByLabel('Doc title')).toHaveValue('Team handbook');
  await expect(page.getByTestId('doc-editor')).toHaveValue(/First task/);
  const preview = page.getByTestId('doc-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('☑');
  await shot(page, 'p2-doc');

  const second = await context.newPage();
  await second.goto(docUrl);
  await expect(second.getByTestId('doc-editor')).toBeVisible();
  await page.getByTestId('doc-editor').fill('# Handbook\n\nPage one edit');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 5000 });
  await second.getByTestId('doc-editor').fill('# Handbook\n\nPage two edit');
  await expect(second.getByTestId('doc-conflict')).toBeVisible({ timeout: 5000 });
  await second.close();

  await page.goto(`/boards/${boardId}`);
  await page.getByLabel('Board menu', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Meeting notes → items' }).click();
  await page
    .getByTestId('meeting-notes-input')
    .fill('We agreed to send a recap and book a follow-up session next week.');
  await page.getByRole('button', { name: 'Find action items' }).click();
  await expect(page.getByTestId('meeting-action-row')).toHaveCount(2, { timeout: 10_000 });
  await shot(page, 'p2-meeting-notes');
  await page.getByRole('button', { name: 'Create 2 items' }).click();
  await expect(
    page.locator('[data-testid="item-row"][data-item-name="Send meeting recap"]'),
  ).toBeVisible({ timeout: 5000 });
});
