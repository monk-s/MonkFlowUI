import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Sample logins come from server/scripts/dev-portal.js (EXAMPLE_DATA on the
// reserved .test domain).
const PASSWORD = 'correct horse battery';
const MFA = '000000';
const INVITE = 'a1'.repeat(32);

const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
};

/** Fill in the portal's sign-in form from wherever the browser already is. */
async function completeSignIn(page: Page, email: string) {
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Authentication code').fill(MFA);
  await page.getByRole('button', { name: 'Verify' }).click();
}

const adminNav = (page: Page) => page.locator('#sidebar .nav-item', { hasText: 'Client Workspaces' });

test.describe('routing, as vercel.json defines it', () => {
  test('the public site links to the portal sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#landing-container')).toBeVisible();
    await page.locator('.mk-nav-signin').click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('every portal address opens directly and survives a refresh', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.goto(`/invite/${INVITE}`);
    await expect(page.getByRole('heading', { name: /Join Harbor Ridge Capital/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: /Join Harbor Ridge Capital/ })).toBeVisible();

    await page.goto('/auth/reset?token=not-a-real-token');
    await expect(page.locator('#landing-container')).toHaveCount(0);   // the portal, not the public shell
    await expect(page.getByRole('heading').first()).toBeVisible();

    // Signed out, a deep link goes to sign-in and remembers where to return.
    await page.goto('/dashboard/settings/team');
    await expect(page).toHaveURL(/\/sign-in\?.*next=%2Fdashboard%2Fsettings%2Fteam/);
    await completeSignIn(page, 'marcus@harborridge.test');   // one workspace, so no picker in between
    await expect(page).toHaveURL(/\/dashboard\/settings\/team$/);
    await expect(page.getByRole('heading', { name: /^People/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: /^People/ })).toBeVisible();
  });

  test('old addresses and old emailed links still land somewhere useful', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto('/join');
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto('/?invite=anything');
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto('/?reset=abc123');
    await expect(page).toHaveURL(/\/auth\/reset\?token=abc123$/);
  });

  test('unknown addresses get the public not-found page, and public pages still work', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.locator('#landing-container')).toBeVisible();
    await expect(page.locator('#landing-container')).toContainText(/not found|could not find|doesn.t exist/i);
    await page.goto('/security');
    await expect(page.locator('#landing-container h1')).toBeVisible();
  });

  test('sign-in, portal and admin pages refuse to be framed and send no referrer', async ({ request }) => {
    for (const url of ['/sign-in', `/invite/${INVITE}`, '/dashboard', '/admin']) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
      expect(res.headers()['x-frame-options'], url).toBe('DENY');
      expect(res.headers()['referrer-policy'], url).toBe('no-referrer');
    }
    expect((await request.get('/')).headers()['x-frame-options']).toBeUndefined();
  });

  test('nothing private is published', async ({ request }) => {
    for (const url of ['/CLAUDE.md', '/server/src/app.js', '/portal/src/main.tsx', '/scripts/build-site.mjs', '/package.json', '/vercel.json']) {
      const res = await request.get(url);
      // Unknown paths fall through to the public shell, never the file.
      expect(await res.text(), url).toContain('id="landing-container"');
    }
  });
});

test.describe('staff console at /admin', () => {
  test('signed out, /admin goes to sign-in and comes back after it', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin$/);
    await completeSignIn(page, 'staff@monkflow.test');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(adminNav(page)).toBeVisible();
    await expect(page.locator('#landing-container')).toBeHidden();
    // The browser holds no token a script could read.
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, cookie: document.cookie }));
    expect(stored).not.toMatch(/accessToken|refreshToken|mf_session=/);
    // A refresh stays in the console.
    await page.reload();
    await expect(adminNav(page)).toBeVisible();
    await shot(page, 'admin-01-console');
  });

  test('staff create a workspace, invite its first admin, and re-invite', async ({ page }) => {
    await page.goto('/admin');
    await completeSignIn(page, 'staff@monkflow.test');
    await adminNav(page).click();
    await expect(page.getByRole('heading', { name: 'Client Workspaces' })).toBeVisible();
    await expect(page.locator('#main-content table')).toContainText('Harbor Ridge Capital');
    await shot(page, 'admin-02-workspaces');

    await page.getByRole('button', { name: 'New workspace' }).click();
    // Requirements are checked before anything is sent.
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await expect(page.locator('#ws-error')).toContainText('Enter the firm name');
    await page.getByLabel('Firm name').fill('Northgate <Trust> & Co');
    await expect(page.locator('#ws-error')).toBeHidden();              // the message clears once they start typing
    await page.getByLabel('Type of firm').selectOption('BANK');
    await page.getByLabel(/First admin/).fill('cfo@northgate.test');
    await page.getByLabel(/Email domains/).fill('northgate.test, @northgate-trust.test');
    await page.getByLabel(/Sign out after/).selectOption('15');
    await shot(page, 'admin-03-new-workspace');
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await expect(page.locator('#toast-container')).toContainText('Invitation sent to cfo@northgate.test');

    const row = page.locator('#main-content tr', { hasText: 'Northgate' });
    await expect(row).toContainText('Northgate <Trust> & Co');     // shown as text, not parsed as markup
    await expect(row).toContainText('Bank');
    await expect(row).toContainText('northgate.test, northgate-trust.test');
    await expect(row).toContainText('15 min');
    await expect(row.locator('td').nth(3)).toHaveText('1');          // one open invitation

    // An address outside the firm's domains is refused, with the reason shown.
    await row.getByRole('button', { name: 'Invite' }).click();
    await page.getByLabel('Work email').fill('someone@elsewhere.test');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.locator('#ws-error')).toContainText('northgate.test');

    // Inviting the same person again replaces the link rather than failing.
    await page.getByLabel('Work email').fill('cfo@northgate.test');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.locator('#toast-container')).toContainText('Invitation sent to cfo@northgate.test');
    await expect(row.locator('td').nth(3)).toHaveText('1');

    // Edit.
    await row.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Firm name').fill('Northgate Trust');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('#main-content table')).toContainText('Northgate Trust');
  });

  test('staff run a client engagement; the client sees it on their Overview', async ({ page }) => {
    await page.goto('/admin');
    await completeSignIn(page, 'staff@monkflow.test');
    await adminNav(page).click();
    await page.locator('#main-content tr', { hasText: 'Harbor Ridge Fund II' }).getByRole('button', { name: 'Engagement' }).click();
    await expect(page.getByRole('heading', { name: 'Harbor Ridge Fund II' })).toBeVisible();
    await expect(page.locator('#main-content')).toContainText('No engagement yet');

    await page.locator('.page-actions').getByRole('button', { name: 'New engagement' }).click();
    await page.getByRole('button', { name: 'Create engagement' }).click();
    await expect(page.locator('#ws-error')).toContainText('Enter a name');
    await page.getByLabel('Name', { exact: true }).fill('Capital call <notices>');
    await page.getByLabel(/Next deliverable \(optional\)/).fill('Audit report');
    await page.getByRole('button', { name: 'Create engagement' }).click();
    await expect(page.locator('#toast-container')).toContainText('Engagement created');
    await expect(page.locator('#main-content')).toContainText('Capital call <notices>');   // text, not markup

    await page.getByRole('button', { name: 'Milestone' }).click();
    await page.getByLabel('Milestone', { exact: true }).fill('Audit report delivered');
    await page.getByRole('button', { name: 'Add milestone' }).click();
    await expect(page.locator('#toast-container')).toContainText('Milestone added');
    await page.getByLabel('Status of Audit report delivered').selectOption('awaiting_signoff');
    await expect(page.locator('#toast-container')).toContainText('Marked ready');
    await page.getByLabel(/^Stage of/).selectOption('architecture');
    await expect(page.locator('#toast-container')).toContainText('Stage set to Architecture and sandbox');

    await page.locator('.page-actions').getByRole('button', { name: 'New request' }).click();
    await page.getByLabel('Kind').selectOption('documents');
    await page.getByLabel('What you need').fill('Send three sample capital call notices');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.locator('#toast-container')).toContainText('Request sent');
    await expect(page.locator('#main-content')).toContainText('Waiting on the client');
    await shot(page, 'admin-04-engagement');

    // Baselines: a number needs its basis, and the client reads the sentence.
    await page.locator('#sidebar .nav-item', { hasText: 'Client Workspaces' }).click();
    await page.locator('#main-content tr', { hasText: /Harbor Ridge Capital/ }).getByRole('button', { name: 'Engagement' }).click();
    const wf = page.locator('#main-content tr', { hasText: 'T-12 normalization' });
    await expect(wf).toContainText('The client sees no hours-saved figure');
    await expect(page.locator('#main-content')).toContainText('(hidden from the client)');
    await wf.getByRole('button', { name: 'Set baseline' }).click();
    await page.getByLabel(/Minutes one run/).fill('40');
    await page.getByRole('button', { name: 'Save baseline' }).click();
    await expect(page.locator('#ws-error')).toContainText('Say where the number comes from');
    await page.getByLabel('Where the number comes from').fill('Agreed with Dana Okafor: 40 minutes to re-key one T-12');
    await page.getByRole('button', { name: 'Save baseline' }).click();
    await expect(page.locator('#toast-container')).toContainText('Baseline saved');
    await expect(wf).toContainText('40 min per run');

    // The client's side.
    await page.locator('.sidebar-logout-btn').click();
    await expect(page).toHaveURL(/\/sign-in/);
    await completeSignIn(page, 'dana@harborridge.test');
    await page.getByRole('button', { name: /Harbor Ridge Fund II/ }).click();
    const waiting = page.getByRole('region', { name: /Waiting on you/ });
    await expect(waiting.getByRole('article')).toHaveCount(2);
    await expect(waiting).toContainText('Send three sample capital call notices');
    await expect(waiting).toContainText('An admin signs this off');   // Dana is an auditor in this workspace
    const tracker = page.getByRole('region', { name: 'Capital call <notices>' });
    await expect(tracker.getByRole('button', { name: /Architecture and sandbox/ })).toContainText('In progress');
    await expect(tracker).toContainText('Next deliverable: Audit report');
    await expect(page.getByRole('region', { name: 'Recent activity' })).toContainText('MonkFlow');
  });

  test('signing out ends the session on the server', async ({ page }) => {
    await page.goto('/admin');
    await completeSignIn(page, 'staff@monkflow.test');
    await expect(adminNav(page)).toBeVisible();
    await page.locator('.sidebar-logout-btn').click();
    await expect(page).toHaveURL(/\/sign-in\?reason=signed_out$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin$/);
  });

  test('a session that ends while the console is open sends staff back to sign in', async ({ page, context }) => {
    await page.goto('/admin');
    await completeSignIn(page, 'staff@monkflow.test');
    await expect(adminNav(page)).toBeVisible();
    await context.clearCookies();
    await adminNav(page).click();
    await expect(page).toHaveURL(/\/sign-in\?reason=expired&next=%2Fadmin$/);
    await expect(page.getByText('Your session has ended')).toBeVisible();
  });

  test('a client who opens /admin is sent to their dashboard and sees nothing of it', async ({ page }) => {
    await page.goto('/sign-in');
    await completeSignIn(page, 'marcus@harborridge.test');
    await expect(page).toHaveURL(/\/dashboard$/);
    const adminCalls: string[] = [];
    page.on('response', (r) => { if (r.url().includes('/api/v1/admin/') && r.status() < 400) adminCalls.push(r.url()); });
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(adminCalls).toEqual([]);
    // And the staff API refuses them directly.
    const res = await page.request.get('/api/v1/admin/organizations');
    expect(res.status()).toBe(403);
  });
});
