import { expect, test } from '@playwright/test';
import { H, createBoard, shot, signIn } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0r8AAAAASUVORK5CYII=',
  'base64',
);

test('data: files, forms, CSV import and templates', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const owner = await signIn(page);
  const { boardId, workspaceId } = await createBoard(page, `Data ${Date.now()}`);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const groupId = full.groups[0].id;
  await page.request.post(`/api/boards/${boardId}/items`, {
    headers: H,
    data: { groupId, name: 'File item' },
  });
  await page.goto(`/boards/${boardId}`);

  await page
    .locator('[data-testid="item-row"][data-item-name="File item"]')
    .getByTestId('item-open')
    .click();
  await page.getByRole('tab', { name: 'Files' }).click();
  await page
    .locator('[data-testid="files-dropzone"] input[type="file"]')
    .setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId('file-row').first()).toContainText('pixel.png');
  await shot(page, 'p2-files');
  await page.getByLabel('Close item panel').click();

  await page.getByRole('button', { name: 'Form', exact: true }).click();
  await page.getByRole('button', { name: 'New form', exact: true }).click();
  await page.getByRole('dialog').locator('input').first().fill('Signup form');
  await page.getByRole('button', { name: 'Create form' }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await page.locator('button', { hasText: '←' }).click();
  const formUrl = await page.getByRole('link', { name: 'Open form' }).first().getAttribute('href');
  expect(formUrl).toBeTruthy();

  const context = await browser.newContext({ baseURL: 'http://localhost:3200' });
  const publicPage = await context.newPage();
  await publicPage.goto(formUrl!);
  await expect(publicPage.getByTestId('form-public-submit')).toBeVisible();
  await publicPage.locator('input[type="text"], input:not([type])').first().fill('Form person');
  await shot(publicPage, 'p2-form');
  await publicPage.getByTestId('form-public-submit').click();
  await expect(publicPage.getByText('Thanks, your response was recorded.')).toBeVisible();
  await context.close();

  await page.getByLabel('Close forms').click();
  await page.reload();
  await expect(
    page.locator('[data-testid="item-row"][data-item-name="Form person"]'),
  ).toBeVisible();

  await page.getByLabel('Board menu', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import from CSV' }).click();
  await page
    .getByTestId('import-dialog')
    .locator('textarea')
    .fill(
      `Item,Status,Owner\nImport one,To do,${owner.name}\nImport two,In progress,${owner.name}\nImport three,To do,${owner.name}`,
    );
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByTestId('import-confirm').click();
  await expect(page.getByText(/Imported 3 items/)).toBeVisible();
  await shot(page, 'p2-import');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  for (const name of ['Import one', 'Import two', 'Import three']) {
    await expect(page.locator(`[data-testid="item-row"][data-item-name="${name}"]`)).toBeVisible();
  }

  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Board…', exact: true }).click();
  await page.getByTestId('create-board-tab').filter({ hasText: 'From a template' }).click();
  await page
    .locator('[data-testid="template-card"][data-template-id="builtin:bug-tracker"]')
    .click();
  await page.getByTestId('create-board-submit').click();
  await expect(page.getByRole('heading', { name: 'Bug tracker' })).toBeVisible();
  await expect(
    page.locator('[data-testid="column-header"][data-column-title="Severity"]').first(),
  ).toBeVisible();
  await shot(page, 'p2-templates');
});
