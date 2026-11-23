import { expect, test } from '@playwright/test';

// Demo Mode: the same screens over synthetic data (portal/src/demo). It must
// work with no API at all, so every request to /api fails the test.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => { throw new Error(`Demo Mode called the API: ${route.request().url()}`); });
});

test('a visitor tours the CRE demo: overview, fix a misread rent, approve, reset', async ({ page }) => {
  await page.goto('/demo/cre');
  const banner = page.getByRole('status').filter({ hasText: 'Demo workspace' });
  await expect(banner).toContainText('synthetic data · nothing is saved');
  await expect(page.getByRole('button', { name: /^Workspace: Demo Property Group/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /Waiting on you/ }).getByRole('article')).toHaveCount(2);
  await expect(page.locator('.tile').first().locator('.tile-value')).not.toHaveText('0');

  await page.getByRole('link', { name: /^Review/ }).click();
  await expect(page).toHaveURL(/\/demo\/cre\/review$/);
  await expect(page.getByRole('tab', { name: /Needs review/ })).toContainText('4');
  await page.getByRole('link', { name: 'Rent roll, Maple Court Apartments, Oct 2026' }).click();
  await expect(banner).toBeVisible();

  // The page shows the true figure; the extraction misread it.
  await page.getByRole('tab', { name: /Checks/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Unit rents add up' })).toContainText('cannot be read as a number');
  await page.getByRole('tab', { name: /Fields/ }).click();
  const misread = page.locator('.fval[data-flag="low"]');
  await expect(misread).toHaveCount(1);
  const wrong = (await misread.innerText()).trim();
  const right = wrong.replace('O0.00', '00.00');
  await misread.click();
  await expect(page.locator('.sheet td[data-on="true"]')).toHaveText(right);
  await page.locator('.fval[data-on="true"]').click();
  await page.locator('.fval-input').fill(right);
  await page.locator('.fval-input').press('Enter');
  await expect(page.getByRole('tab', { name: /Checks/ })).toContainText('2/2');

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Rent roll, Maple Court Apartments, Oct 2026');
  await page.getByRole('link', { name: 'Review queue' }).click();
  await expect(page.getByRole('tab', { name: /Needs review/ })).toContainText('3');

  // Changes survive a reload in this tab, and Reset throws them away.
  await page.reload();
  await expect(page.getByRole('tab', { name: /Needs review/ })).toContainText('3');
  await banner.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page).toHaveURL(/\/demo\/cre$/);
  await page.getByRole('link', { name: /^Review/ }).click();
  await expect(page.getByRole('tab', { name: /Needs review/ })).toContainText('4');

  // Nothing that would need a real account works.
  await page.getByRole('link', { name: 'Workflows' }).click();
  await page.getByRole('link', { name: 'Rent roll intake' }).click();
  await expect(page.getByRole('heading', { name: 'Recent runs' })).toBeVisible();
});

for (const [path, firm, doc] of [
  ['/demo/bank', 'Demo Community Bank', 'Personal financial statement, R. Fontaine'],
  ['/demo/investment', 'Demo Capital Partners', 'Subscription agreement, Lindqvist Family Trust'],
] as const) {
  test(`${path} has its own wording and a failing check to fix`, async ({ page }) => {
    await page.goto(`${path}/review`);
    await expect(page.getByRole('button', { name: new RegExp(`^Workspace: ${firm}`) })).toBeVisible();
    await page.getByRole('link', { name: doc }).click();
    await expect(page.getByRole('tab', { name: /Checks/ })).toContainText(/[0-2]\/[13]/);
    await expect(page.locator('.fval[data-flag="low"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('dialog')).toContainText('Approve with a failing check?');
  });
}

test('an unknown demo goes to the CRE one', async ({ page }) => {
  await page.goto('/demo/dental');
  await expect(page).toHaveURL(/\/demo\/cre$/);
});

test('the audit log lists what happened, filters, and reports the record intact', async ({ page }) => {
  await page.goto('/demo/investment/settings/audit');
  await expect(page.getByRole('status').filter({ hasText: 'Record intact' })).toBeVisible();
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows.nth(1)).toBeVisible();
  await page.getByLabel('Person or action').fill('no-such-action');
  await expect(page.getByText('No entries match')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toBe('audit-log.csv');
});

test('requests, vault and integrations are live: ask, withdraw, open a stored document', async ({ page }) => {
  await page.goto('/demo/bank/requests');
  await page.getByRole('button', { name: 'New request' }).click();
  await page.getByLabel('What do you need?').fill('Add the loan officer to the export');
  await page.getByRole('button', { name: 'Send request' }).click();
  const mine = page.getByRole('region', { name: 'Your requests to MonkFlow' });
  const row = mine.getByRole('row').filter({ hasText: 'Add the loan officer to the export' });
  await expect(row).toContainText('Open');
  await expect(mine.getByRole('row').filter({ hasText: 'Reply' })).toContainText('Closed');
  await expect(page.getByRole('region', { name: "MonkFlow's requests to you" }).getByRole('row').nth(1)).toContainText('Waiting on you');
  await row.getByRole('button', { name: 'Withdraw' }).click();
  await expect(row).toContainText('Withdrawn');

  await page.goto('/demo/bank/integrations');
  await expect(page.getByRole('row').filter({ hasText: 'nCino' })).toContainText('Healthy');
  await expect(page.getByText('none are stored or shown in this portal')).toBeVisible();

  await page.goto('/demo/bank/vault');
  await page.getByRole('table').getByRole('link').first().click();
  await expect(page).toHaveURL(/\/demo\/bank\/review\/doc-\d+$/);
});

test('Back from a deep demo page goes to that demo\'s home, not out of the demo', async ({ page }) => {
  await page.goto('/demo/bank/review');
  await expect(page.getByRole('tab', { name: /Needs review/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/demo\/bank$/);
  await expect(page.getByRole('status').filter({ hasText: 'Demo workspace' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/demo\/bank\/review$/);

  await page.goto('/demo/family-office/k1/export');
  await expect(page.getByRole('status').filter({ hasText: 'Demo workspace' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/demo\/family-office$/);

  // K-1 screens belong to the family-office demo only.
  await page.goto('/demo/bank');
  await expect(page.getByRole('link', { name: /K-1 tracker/ })).toHaveCount(0);
});
