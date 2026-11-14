import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Overview (action queue, engagement tracker, telemetry) and Workflows.
// The rows these tests count on are seeded by seedExampleEngagement() in
// server/scripts/dev-portal.js (EXAMPLE_DATA). Tests run in order and the
// later ones depend on what the earlier ones did.
const PASSWORD = 'correct horse battery';
const MFA = '000000';

const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

// auth.spec.ts runs first and gives some sample people a second workspace, so
// the picker may or may not appear; either way end up in `workspace`.
async function signIn(page: Page, email: string, workspace = 'Harbor Ridge Capital') {
  await page.goto('/sign-in');
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Authentication code').fill(MFA);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/(dashboard|select-workspace)$/);
  if (page.url().endsWith('/select-workspace')) await page.getByRole('button', { name: new RegExp(`^${workspace}`) }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('button', { name: `Workspace: ${workspace}. Switch workspace` })).toBeVisible();
}

const tile = (page: Page, label: string) => page.locator('.tile').filter({ has: page.getByText(label, { exact: true }) });
const waiting = (page: Page) => page.getByRole('region', { name: /Waiting on you/ });

test.describe.configure({ mode: 'serial' });

test('an admin sees what is waiting, where the build stands and measured numbers', async ({ page }) => {
  await signIn(page, 'dana@harborridge.test', 'Harbor Ridge Capital');

  // 1. Waiting on you: the sign-off (due sooner) before the request.
  await expect(waiting(page).getByRole('heading', { name: /Waiting on you/ })).toContainText('2');
  const cards = waiting(page).getByRole('article');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Sign-off');
  await expect(cards.nth(0)).toContainText('UAT on 20 sample rent rolls');
  await expect(cards.nth(0)).toContainText('Due in 3 days');
  await expect(cards.nth(1)).toContainText('Credentials');

  // 2. Tracker opens on the current stage.
  const tracker = page.getByRole('region', { name: 'Rent roll and T-12 intake' });
  await expect(tracker.getByRole('button', { name: /Discovery and audit/ })).toContainText('Complete');
  await expect(tracker.getByRole('button', { name: /Integration and QA/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(tracker.getByRole('button', { name: /Integration and QA/ })).toContainText('In progress · 1 to sign off');
  await expect(tracker.getByRole('button', { name: /Production and scale/ })).toContainText('Upcoming');
  await expect(tracker.getByRole('listitem').filter({ hasText: 'Accounting export connection' })).toContainText('In progress');
  await expect(tracker).toContainText('Next deliverable: UAT results on 20 sample rent rolls');
  await tracker.getByRole('button', { name: /Discovery and audit/ }).click();
  await expect(tracker.getByRole('listitem').filter({ hasText: 'Process audit report' })).toContainText('Signed off by Dana Okafor');
  await tracker.getByRole('button', { name: /Integration and QA/ }).click();

  // 3. Telemetry: 45 + 2 completed and 2 + 1 failed in 30 days; 32 runs x 25 min since the baseline.
  await expect(tile(page, 'Completed runs').locator('.tile-value')).toHaveText('47');
  await expect(tile(page, 'Success rate').locator('.tile-value')).toHaveText('94%');
  await expect(tile(page, 'Success rate')).toContainText('3 of 50 runs failed');
  await expect(tile(page, 'Hours saved').locator('.tile-value')).toHaveText('13.3hours');
  await tile(page, 'Hours saved').getByRole('button', { name: /How hours saved is calculated/ }).click();
  await expect(tile(page, 'Hours saved')).toContainText('32 runs × 25 minutes = 13.3 hours');
  await expect(tile(page, 'Hours saved')).toContainText('Agreed with Dana Okafor at kickoff');
  await shot(page, '20-overview-admin');

  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: '7 days' }).click();
  await expect(tile(page, 'Completed runs').locator('.tile-value')).toHaveText('14');
  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: '30 days' }).click();

  // 4. Activity and health.
  await expect(page.getByRole('region', { name: 'Recent activity' }).getByRole('listitem').first()).toContainText('Requested from your team');
  const health = page.getByRole('region', { name: 'Workflow health' });
  await expect(health.getByRole('row')).toHaveCount(3);
  await expect(health).not.toContainText('draft');

  // Nothing MonkFlow may not claim.
  const text = (await page.locator('body').innerText()).toLowerCase();
  for (const banned of ['soc 2', 'end-to-end', 'fixed-fee', 'certified', 'roi']) expect(text).not.toContain(banned);
});

test('a reviewer can finish a request but not sign off', async ({ page }) => {
  await signIn(page, 'marcus@harborridge.test');
  const cards = waiting(page).getByRole('article');
  await expect(cards.nth(0)).toContainText('An admin signs this off');
  await expect(page.getByRole('button', { name: 'Sign off', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review and sign off' })).toHaveCount(0);

  await cards.nth(1).getByRole('button', { name: 'Mark as done' }).click();
  await expect(page.getByRole('dialog')).toContainText('Send a read-only login for the accounting export');
  await page.getByRole('dialog').getByRole('button', { name: 'Mark as done' }).click();
  await expect(page.getByText('Marked as done: Send a read-only login for the accounting export.')).toBeVisible();
  await expect(cards).toHaveCount(1);
});

test('an admin signs off a milestone; it is recorded and the queue clears', async ({ page }) => {
  await signIn(page, 'dana@harborridge.test', 'Harbor Ridge Capital');
  const tracker = page.getByRole('region', { name: 'Rent roll and T-12 intake' });
  const row = tracker.getByRole('listitem').filter({ hasText: 'UAT on 20 sample rent rolls' });
  await row.getByRole('button', { name: 'Sign off' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Your name and the time are recorded in the audit log');
  await shot(page, '21-sign-off-dialog');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(row).toContainText('Ready for sign-off');

  await waiting(page).getByRole('button', { name: 'Review and sign off' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign off' }).click();
  await expect(page.getByText('Signed off: UAT on 20 sample rent rolls.')).toBeVisible();
  await expect(row).toContainText('Signed off by Dana Okafor');
  await expect(row).toContainText('Complete');
  await expect(row.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Waiting on you/ })).toHaveCount(0);
  const activity = page.getByRole('region', { name: 'Recent activity' }).getByRole('listitem');
  await expect(activity.nth(0)).toContainText('Signed off: UAT on 20 sample rent rolls');
  await expect(activity.nth(0)).toContainText('Dana Okafor');
  await expect(activity.nth(1)).toContainText('Marked done');
  await shot(page, '22-overview-signed-off');
});

test('workflows: list, detail and a failed run with its log', async ({ page }) => {
  await signIn(page, 'ines@harborridge.test');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workflows' }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', level: 1 })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(3);
  await expect(page.locator('body')).not.toContainText('Offering memorandum');
  const rentRoll = page.getByRole('row', { name: /Rent roll intake/ });
  await expect(rentRoll).toContainText('Active');
  await expect(rentRoll).toContainText('96%');
  // Read-only: nothing here runs, pauses, edits or deletes.
  await expect(page.getByRole('main').getByRole('button', { name: /run|pause|delete|edit/i })).toHaveCount(0);
  await shot(page, '23-workflows');

  await page.getByRole('link', { name: 'T-12 normalization' }).click();
  await expect(page.getByRole('heading', { name: 'T-12 normalization' })).toBeVisible();
  await expect(tile(page, 'Completed runs').locator('.tile-value')).toHaveText('2');
  await expect(tile(page, 'Hours saved')).toContainText('No baseline agreed yet');
  await expect(page.getByRole('region', { name: 'Recent runs' }).getByRole('row')).toHaveCount(4);
  await shot(page, '24-workflow-detail');

  await page.getByRole('row', { name: /Failed/ }).getByRole('link').click();
  await expect(page.getByRole('status').filter({ hasText: 'This run failed.' })).toContainText('Two months were missing from the statement.');
  const log = page.getByRole('region', { name: 'Log' }).getByRole('listitem');
  await expect(log).toHaveCount(4);
  await expect(log.nth(2)).toContainText('Only 10 monthly columns found');
  await expect(page.locator('body')).not.toContainText('debug line');
  await shot(page, '25-run-detail');

  await page.getByRole('link', { name: 'T-12 normalization' }).click();
  await expect(page).toHaveURL(/\/dashboard\/workflows\/[0-9a-f-]{36}$/);
  await page.goto('/dashboard/workflows/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('a workspace with no engagement and no runs says so, with no zeros', async ({ page }) => {
  await signIn(page, 'dana@harborridge.test', 'Harbor Ridge Fund II');
  await expect(page.getByText('Your engagement tracker opens here')).toBeVisible();
  await expect(page.getByText('Telemetry starts when your first workflow is in production')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Waiting on you/ })).toHaveCount(0);
  await expect(page.locator('.tile')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Period' })).toHaveCount(0);
  await shot(page, '26-overview-empty');
  await page.goto('/dashboard/workflows');
  await expect(page.getByText('No workflows yet')).toBeVisible();
});

test('phone width: tracker stacks and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'marcus@harborridge.test');
  await expect(tile(page, 'Completed runs')).toBeVisible();
  for (const url of ['/dashboard', '/dashboard/workflows']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
  await page.goto('/dashboard');
  await shot(page, '27-overview-phone');
});
