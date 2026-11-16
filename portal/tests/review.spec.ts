import { expect, test, type Page } from '@playwright/test';

// Review queue and review studio, against the two rent rolls seeded by
// seedExampleReview() in server/scripts/dev-portal.js (EXAMPLE_DATA). Tests
// run in order and the later ones depend on what the earlier ones did.
const PASSWORD = 'correct horse battery';

async function signIn(page: Page, email: string, workspace = 'Harbor Ridge Capital') {
  await page.goto('/sign-in');
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Authentication code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/(dashboard|select-workspace)$/);
  if (page.url().endsWith('/select-workspace')) await page.getByRole('button', { name: new RegExp(`^${workspace}`) }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe.configure({ mode: 'serial' });

test('an auditor can read a document but not change or decide it', async ({ page }) => {
  await signIn(page, 'ines@harborridge.test');
  await page.getByRole('link', { name: /^Review/ }).click();
  await page.getByRole('link', { name: 'Rent roll, Maple Court, Oct 2026' }).click();
  await expect(page.getByRole('button', { name: /Rent, row 2/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reject…' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
});

test('a reviewer fixes a misread figure, the check passes, and approval moves to the next document', async ({ page }) => {
  await signIn(page, 'marcus@harborridge.test');
  await expect(page.getByRole('link', { name: /^Review/ }).getByLabel('2 waiting for review')).toBeVisible();
  await page.getByRole('link', { name: /^Review/ }).click();

  const rows = page.getByRole('row');
  await expect(page.getByRole('tab', { name: /Needs review/ })).toContainText('2');
  await expect(rows.nth(1)).toContainText('Rent roll, Maple Court, Oct 2026');
  await expect(rows.nth(1)).toContainText('Check failing');
  await expect(rows.nth(1)).toContainText('1 of 2 pass');
  await expect(rows.nth(2)).toContainText('Needs review');
  await page.getByRole('link', { name: 'Rent roll, Maple Court, Oct 2026' }).click();

  await expect(page.getByText('1 of 2 to review')).toBeVisible();
  const frame = page.locator('iframe[title^="Source document"]');
  await expect(frame).toHaveAttribute('src', /\/api\/v1\/portal\/review\/[0-9a-f-]+\/document#page=1&navpanes=0$/);

  // The failing check is explained, and approval is stopped by it.
  await page.getByRole('tab', { name: /Checks/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Unit rents add up' })).toContainText('"Rent" in row 2 cannot be read as a number.');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('dialog')).toContainText('Approve with a failing check?');
  await expect(page.getByRole('button', { name: 'Approve anyway' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Select the field (the document jumps to its page), then edit it.
  await page.getByRole('tab', { name: /Fields/ }).click();
  const rent = page.getByRole('button', { name: /^Rent, row 2/ });
  await expect(rent).toContainText('$1,5O0.00');
  await rent.click();
  await expect(frame).toHaveAttribute('src', /#page=2&navpanes=0$/);
  await rent.click();
  await page.getByRole('textbox', { name: 'Rent, row 2' }).fill('$1,500.00');
  await page.getByRole('textbox', { name: 'Rent, row 2' }).press('Enter');
  await expect(page.getByRole('button', { name: /^Rent, row 2/ })).toContainText('$1,500.00$1,5O0.00');   // new value, original struck through
  await expect(page.getByRole('tab', { name: /Checks/ })).toContainText('2/2');

  await page.getByRole('tab', { name: 'Audit' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Corrected Rent, row 2' })).toContainText('Marcus');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toBe('Rent roll_ Maple Court_ Oct 2026.csv');

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rent roll, Cedar Landing, Oct 2026');
  await expect(page.getByText('1 of 1 to review')).toBeVisible();
  await expect(page.getByText('No source file')).toBeVisible();
});

test('a rejection needs a reason; then the queue is clear', async ({ page }) => {
  await signIn(page, 'marcus@harborridge.test');
  await page.getByRole('link', { name: /^Review/ }).click();
  await page.getByRole('link', { name: 'Rent roll, Cedar Landing, Oct 2026' }).click();
  await page.getByRole('button', { name: 'Reject…' }).click();
  await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeDisabled();
  await page.getByLabel('Reason').fill('Wrong reporting period');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Rejected by Marcus' })).toContainText('Reason given: Wrong reporting period');
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Review queue' }).click();
  await expect(page.getByRole('heading', { name: 'Queue clear' })).toBeVisible();
  await page.getByRole('tab', { name: /Approved/ }).click();
  await expect(page.getByRole('row').nth(1)).toContainText('Rent roll, Maple Court, Oct 2026');
  await expect(page.getByRole('link', { name: /^Review/ }).locator('.count')).toHaveCount(0);
});
