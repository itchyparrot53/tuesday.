import { expect, test } from '@playwright/test';
import { createBoard, signIn } from './helpers';

test('automation builder: overdue trigger, created subitem, copied CSM and tagged note', async ({
  page,
}) => {
  await signIn(page);
  const { boardId } = await createBoard(page, `Subitem automation ${Date.now()}`);
  await page.goto(`/boards/${boardId}`);
  await page.getByTestId('automate-button').click();
  await page.getByRole('button', { name: 'New automation' }).click();

  await page.getByLabel('When').click();
  await page.getByRole('menuitemradio', { name: 'a date passes' }).click();

  await page.getByLabel('Action', { exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Create a subitem' }).click();
  await page.getByLabel('Subitem name').fill('Chase {{name}}');

  await page.getByRole('button', { name: 'Add action' }).click();
  await page.getByLabel('Action', { exact: true }).nth(1).click();
  await page.getByRole('menuitemradio', { name: 'Assign someone' }).click();
  await page.getByLabel('Apply to').click();
  await page.getByRole('menuitemradio', { name: 'The created subitem' }).click();
  await page.getByLabel('Assign to').click();
  await page.getByRole('menuitemradio', { name: 'The person in a column' }).click();
  await expect(page.getByLabel('Copy person from column')).toBeVisible();

  await page.getByRole('button', { name: 'Add action' }).click();
  await page.getByLabel('Action', { exact: true }).nth(2).click();
  await page.getByRole('menuitemradio', { name: 'Post an update' }).click();
  await page.getByLabel('Apply to').nth(1).click();
  await page.getByRole('menuitemradio', { name: 'The created subitem' }).click();
  await page.getByLabel('Mention people from column').click();
  await page.getByRole('menuitemradio', { name: 'Tag the people in Owner' }).click();
  await page.getByLabel('Update body').fill('This work is overdue. Please chase it today.');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('automation-row')).toHaveCount(1);
  const sentence = page.getByTestId('automation-row').first();
  await expect(sentence).toContainText('assign the person in Owner');
  await expect(sentence).toContainText('on the created subitem');
  await expect(sentence).toContainText('mentioning the people in Owner');
});
