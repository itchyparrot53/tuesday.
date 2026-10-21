import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { createBoard, signIn } from './helpers';

test('inbound webhook: test item, signing secret and delivery log', async ({ page }) => {
  await signIn(page);
  const { boardId } = await createBoard(page, `Signed webhook ${Date.now()}`);
  await page.goto(`/boards/${boardId}`);
  await page.getByRole('button', { name: 'Board menu' }).click();
  await page.getByRole('menuitem', { name: /Inbound webhook/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Inbound webhook', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Create webhook' }).click();
  const url = await dialog.locator('#inbound-webhook-url').inputValue();

  await dialog.getByTestId('webhook-test').click();
  await expect(dialog.getByTestId('webhook-delivery-row').first()).toContainText('201');
  await expect(dialog.getByTestId('webhook-deliveries')).toContainText('Item #');

  const secret = 'e2e-webhook-secret-123456';
  await dialog.getByLabel('Signing secret').fill(secret);
  await dialog.getByRole('button', { name: 'Set secret', exact: true }).click();
  await expect(dialog.getByText('Signing secret · configured')).toBeVisible();

  const body = JSON.stringify({ name: 'Signed E2E item' });
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  const posted = await page.request.post(url, {
    headers: {
      'content-type': 'application/json',
      'x-tuesday-signature': `sha256=${signature}`,
    },
    data: body,
  });
  expect(posted.status()).toBe(201);

  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(
    page.getByTestId('item-name').filter({ hasText: 'Webhook test item' }),
  ).toBeVisible();
  await expect(page.getByTestId('item-name').filter({ hasText: 'Signed E2E item' })).toBeVisible();

  await page.getByRole('button', { name: 'Board menu' }).click();
  await page.getByRole('menuitem', { name: /Inbound webhook/ }).click();
  await expect(page.getByTestId('webhook-delivery-row')).toHaveCount(2);
  await page
    .getByTestId('webhook-delivery-row')
    .first()
    .getByRole('button', { name: 'View' })
    .click();
  await expect(page.getByTestId('webhook-delivery-detail')).toBeVisible();
  await axeCheck(page, 'webhook settings with deliveries');
});
