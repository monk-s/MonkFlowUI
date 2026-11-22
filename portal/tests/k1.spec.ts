import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// The family-office demo: K-1 tracker, per-field review with checks, and the
// accountant export. All of it runs in the browser on EXAMPLE_DATA.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => { throw new Error(`Demo Mode called the API: ${route.request().url()}`); });
});

const row = (page: import('@playwright/test').Page, name: string) => page.getByRole('row').filter({ hasText: name });
const flags = (page: import('@playwright/test').Page) => page.locator('.flags > .checks > li');

test('the tracker lists the eight K-1s with status counts, lateness and open flags', async ({ page }) => {
  await page.goto('/demo/family-office/k1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('K-1 tracker');
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await expect(page.locator('.k1-late')).toContainText('1');
  await expect(row(page, 'Red River Infrastructure Partners')).toContainText('5');
  await expect(row(page, 'Mesquite Multifamily Fund IV').locator('.pill-bad')).toHaveText('3');
  await expect(row(page, 'Bluebonnet Growth Equity Fund III').locator('.pill-bad')).toHaveCount(0);
  await expect(row(page, 'Permian Royalty Partners II')).toContainText('Approved');

  await page.getByLabel('Has open flags').check();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('Has open flags').uncheck();
  await page.getByLabel('Entity').selectOption('Hartley Family Trust');
  await expect(page.locator('tbody tr')).toHaveCount(3);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export outstanding list' }).click();
  const csv = readFileSync(await (await download).path(), 'utf8');
  expect(csv.trim().split('\r\n')).toHaveLength(4); // header, Lone Star, Red River, Caprock
});

test('Mesquite shows exactly its three flags and Bluebonnet passes every check', async ({ page }) => {
  await page.goto('/demo/family-office/k1');
  await row(page, 'Mesquite').getByRole('link', { name: /Review/ }).click();
  await expect(flags(page)).toHaveCount(3);
  for (const id of ['roll_forward', 'opening', 'dist_ledger']) await expect(page.locator(`.flags li[data-check="${id}"]`)).toBeVisible();
  await expect(page.locator('.flags li[data-check="roll_forward"]')).toContainText('434,600');
  await expect(page.getByRole('button', { name: 'Approve K-1' })).toBeDisabled();

  await page.goto('/demo/family-office/k1');
  await row(page, 'Bluebonnet').getByRole('link', { name: /Review/ }).click();
  await expect(page.locator('.flags-head')).toContainText('Every check passes');
  await page.getByLabel('Compare with last year').check();
  await expect(page.locator('.frow[data-key="part3.9a"]')).toContainText('Last year: 64,100');
});

test('Brazos: fix the misread box, note the K-3, approve every field, approve, export', async ({ page }) => {
  await page.goto('/demo/family-office/k1');
  await row(page, 'Brazos').getByRole('link', { name: /Review/ }).click();
  await expect(flags(page)).toHaveCount(3); // 6b over 6a, K-3 attached, low confidence
  const box = page.locator('.frow[data-key="part3.6b"]');
  await box.locator('.fval').click();
  await expect(page.locator('.sheet-img .hl')).toBeVisible();
  await box.locator('.fval').click();
  await page.locator('.fval-input').fill('12,100');
  await page.locator('.fval-input').press('Enter');
  await expect(flags(page)).toHaveCount(1);
  await expect(box).toContainText('Approved');

  const approve = page.getByRole('button', { name: 'Approve K-1' });
  for (const b of await page.getByRole('button', { name: 'Approve section' }).all()) { void b; await page.getByRole('button', { name: 'Approve section' }).first().click(); }
  await expect(page.getByRole('button', { name: 'Approve section' })).toHaveCount(0);
  await expect(approve).toBeDisabled(); // the K-3 flag is still open
  await page.getByLabel(/^Note for: Routing: no Schedule K-3/).fill('K-3 forwarded to the accountant with this K-1');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(approve).toBeEnabled();
  await approve.click();

  await page.goto('/demo/family-office/k1');
  await expect(row(page, 'Brazos')).toContainText('Approved');
  await page.getByRole('link', { name: 'Accountant export' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download approved figures' }).click();
  const csv = readFileSync(await (await download).path(), 'utf8');
  expect(csv).toContain('Hartley Family Trust,Brazos Hedge Strategies,2026,6b,,"12,100",Alex Morgan,2027-03-20');
  expect(csv).not.toContain('Mesquite');
  await page.getByRole('button', { name: 'Mark as sent to accountant' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Brazos' })).toContainText('Sent to accountant');
});
