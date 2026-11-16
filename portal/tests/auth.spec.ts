import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Sample logins and invitation tokens come from server/scripts/dev-portal.js
// (EXAMPLE_DATA on the reserved .test domain).
const PASSWORD = 'correct horse battery';
const MFA = '000000';
const EMAIL_CODE = '424242';
const TOKEN = { valid: 'a1'.repeat(32), expired: 'b2'.repeat(32), existingLogin: 'c3'.repeat(32), ssoFirm: 'd4'.repeat(32) };

const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

async function enterEmail(page: Page, email: string) {
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

/** Password + second step, stopping wherever the app sends the person next. */
async function signIn(page: Page, email: string, opts: { next?: string } = {}) {
  await page.goto(`/sign-in${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ''}`);
  await enterEmail(page, email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Authentication code').fill(MFA);
  await page.getByRole('button', { name: 'Verify' }).click();
}

test.describe('sign-in screen', () => {
  test('states only what is true and shows live status', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    const side = page.getByRole('complementary');
    await expect(side.getByText('Encrypted in transit and at rest')).toBeVisible();
    await expect(side.getByText('Isolated from every other client')).toBeVisible();
    await expect(side.getByText('All systems operational')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue with Microsoft' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
    // Claims MonkFlow may not make.
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const banned of ['soc 2', 'soc2', 'end-to-end', 'hipaa', 'iso 27001', 'insurance', 'fixed-fee', 'certified']) expect(text).not.toContain(banned);
    await shot(page, '01-sign-in');
  });

  test('says so when the platform is degraded', async ({ page }) => {
    await page.route('**/api/v1/health', (r) => r.fulfill({ json: { status: 'degraded', checks: { database: 'down' } } }));
    await page.goto('/sign-in');
    await expect(page.getByRole('complementary').getByText('Some services are degraded')).toBeVisible();
  });

  test('a wrong password gets a plain, generic error', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Enter the work email');
    await enterEmail(page, 'dana@harborridge.test');
    await page.getByLabel('Password', { exact: true }).fill('not the password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('do not match');
    await shot(page, '02-sign-in-error');
  });

  test('a login with no workspace is told what to do', async ({ page }) => {
    await page.goto('/sign-in');
    await enterEmail(page, 'nobody@example.test');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Authentication code').fill(MFA);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('alert')).toContainText('not attached to a workspace');
  });

  test('phone width: form first, status line under it, no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('complementary')).toBeHidden();
    await expect(page.locator('.auth-status-inline')).toHaveText('All systems operational');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, '03-sign-in-phone');
  });
});

test.describe('returning sign-in', () => {
  test('password, second step, workspace picker, dashboard', async ({ page }) => {
    await signIn(page, 'dana@harborridge.test');
    await expect(page).toHaveURL(/\/select-workspace/);
    await expect(page.getByRole('button', { name: /Harbor Ridge Capital/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Harbor Ridge Fund II/ })).toBeVisible();
    await shot(page, '04-select-workspace');
    await page.getByRole('button', { name: /Harbor Ridge Capital/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Welcome, Dana' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(['Overview', 'Review', 'Workflows', 'Integrations', 'Vault', 'Requests']);
    await shot(page, '05-overview');

    // Refresh keeps the session and the page.
    await page.goto('/dashboard/settings/security');
    await page.reload();
    await expect(page.getByText('30 minutes without activity')).toBeVisible();
    await shot(page, '06-security');

    // Switch workspace from the sidebar: role and navigation follow.
    await page.getByRole('button', { name: /Switch workspace/ }).click();
    await page.getByRole('menuitem', { name: /Harbor Ridge Fund II/ }).click();
    await expect(page.getByRole('button', { name: /Workspace: Harbor Ridge Fund II/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Requests' })).toHaveCount(0);

    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in\?reason=signed_out/);
    await expect(page.getByText('You have signed out.')).toBeVisible();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard/);
  });

  test('a deep link survives sign-in', async ({ page }) => {
    await page.goto('/dashboard/settings/team');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard%2Fsettings%2Fteam/);
    await enterEmail(page, 'marcus@harborridge.test');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Authentication code').fill(MFA);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/team$/);
    await expect(page.getByRole('heading', { name: /People/ })).toBeVisible();
  });

  test('emailed sign-in code', async ({ page }) => {
    await page.goto('/sign-in');
    await enterEmail(page, 'ines@harborridge.test');
    await page.getByRole('button', { name: 'Email me a sign-in code instead' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await page.getByLabel('Sign-in code').fill(EMAIL_CODE);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('first password sign-in must set up the second step', async ({ page }) => {
    await page.goto('/sign-in');
    await enterEmail(page, 'fresh@harborridge.test');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/mfa-setup/);
    await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
    await shot(page, '07-mfa-setup');
    // The dashboard is closed until it is done.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/mfa-setup/);
    await page.getByLabel(/Enter the 6-digit code/).fill('123456');
    await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
    await expect(page.getByRole('alert')).toContainText('not right');
    await page.getByLabel(/Enter the 6-digit code/).fill(MFA);
    await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe('single sign-on', () => {
  test('a firm that requires Microsoft sign-in is sent there, never to a password', async ({ page }) => {
    await page.goto('/sign-in');
    await enterEmail(page, 'coo@cedarpoint.test');
    await expect(page.getByRole('heading', { name: 'Sign in with Microsoft' })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
    await shot(page, '08-sso-required');
    await page.getByRole('link', { name: 'Continue with Microsoft' }).click();
    await expect(page.getByText('Development only.')).toBeVisible();   // stand-in identity provider
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('button', { name: /Workspace: Cedar Point Bank/ })).toBeVisible();
    await page.goto('/dashboard/settings/security');
    await expect(page.getByText('Microsoft single sign-on is required')).toBeVisible();
    await expect(page.getByText('15 minutes without activity')).toBeVisible();
  });

  test('SSO as someone with no login explains that access is by invitation', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await page.getByLabel('Come back as').fill('stranger@example.test');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/sign-in\?error=no_account/);
    await expect(page.getByText('Access is by invitation')).toBeVisible();
  });
});

test.describe('invitations', () => {
  test('expired, and not-valid links each explain themselves', async ({ page }) => {
    await page.goto(`/invite/${TOKEN.expired}`);
    await expect(page.getByRole('heading', { name: 'This invitation has expired' })).toBeVisible();
    await shot(page, '09-invite-expired');
    await page.getByRole('button', { name: 'Request a new invitation' }).click();
    await expect(page.getByText('We have let Dana Okafor know')).toBeVisible();

    await page.goto(`/invite/${'ee'.repeat(32)}`);
    await expect(page.getByRole('heading', { name: 'This invitation is not valid' })).toBeVisible();
  });

  test('a firm that requires SSO offers no password on its invitation', async ({ page }) => {
    await page.goto(`/invite/${TOKEN.ssoFirm}`);
    await expect(page.getByRole('heading', { name: 'Join Cedar Point Bank' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Accept with Microsoft' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Accept with Google' })).toHaveCount(0);
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);

    // Coming back from the provider as a different address is refused.
    await page.getByRole('link', { name: 'Accept with Microsoft' }).click();
    await page.getByLabel('Come back as').fill('someone.else@cedarpoint.test');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(new RegExp(`/invite/${TOKEN.ssoFirm}\\?error=email_mismatch`));
    await expect(page.getByText('This invitation was sent to analyst@cedarpoint.test')).toBeVisible();

    await page.getByRole('link', { name: 'Accept with Microsoft' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();   // pre-filled with the invited address
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('button', { name: /Workspace: Cedar Point Bank/ })).toBeVisible();
  });

  test('a new person accepts, sets a password and a second step, and lands in the workspace', async ({ page }) => {
    await page.goto(`/invite/${TOKEN.valid}`);
    await expect(page.getByRole('heading', { name: 'Join Harbor Ridge Capital' })).toBeVisible();
    await expect(page.getByText('Operations / Analyst Reviewer')).toBeVisible();
    await expect(page.getByText('Dana Okafor')).toBeVisible();
    await shot(page, '10-invite-valid');

    await page.getByLabel('First name').fill('Noor');
    await page.getByLabel('Last name').fill('Haddad');
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(page.getByRole('alert')).toContainText('at least 12 characters');
    await page.getByLabel('Password', { exact: true }).fill('a long enough passphrase');
    await page.getByRole('button', { name: 'Accept invitation' }).click();

    await expect(page).toHaveURL(/\/auth\/mfa-setup/);
    await page.getByLabel(/Enter the 6-digit code/).fill(MFA);
    await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Welcome, Noor' })).toBeVisible();

    // The link is spent.
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.goto(`/invite/${TOKEN.valid}`);
    await expect(page.getByRole('heading', { name: 'This invitation has been used' })).toBeVisible();
  });

  test('someone who already has a login signs in to accept', async ({ page }) => {
    await page.goto(`/invite/${TOKEN.existingLogin}`);
    await expect(page.getByText('You already have a MonkFlow login')).toBeVisible();
    await page.getByRole('link', { name: 'Sign in to accept' }).click();
    await expect(page.getByLabel('Work email')).toHaveValue('marcus@harborridge.test');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Authentication code').fill(MFA);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('button', { name: /Workspace: Harbor Ridge Fund II/ })).toBeVisible();
  });
});

test.describe('team and roles', () => {
  test('an admin invites someone; an auditor can look but not touch', async ({ page }) => {
    await signIn(page, 'dana@harborridge.test');
    await page.getByRole('button', { name: /Harbor Ridge Capital/ }).click();
    await page.goto('/dashboard/settings/team');
    await expect(page.getByRole('row', { name: /Dana Okafor/ })).toContainText('You');
    await shot(page, '11-team');

    await page.getByRole('button', { name: 'Invite' }).click();
    await page.getByLabel('Work email').fill('not-an-email');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByRole('alert')).toContainText('valid work email');
    await page.getByLabel('Work email').fill('controller@harborridge.test');
    await page.getByRole('radio', { name: /Read-Only Auditor/ }).check();
    await shot(page, '12-invite-dialog');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText('Invitation sent to controller@harborridge.test.')).toBeVisible();
    await expect(page.getByRole('row', { name: /controller@harborridge.test/ })).toContainText('Read-Only Auditor');

    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    await signIn(page, 'ines@harborridge.test');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Requests' })).toHaveCount(0);
    await page.goto('/dashboard/settings/team');
    await expect(page.getByRole('row', { name: /Dana Okafor/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Pending invitations' })).toHaveCount(0);
  });
});

test.describe('idle timeout', () => {
  test('warns two minutes before, and signs out at the limit keeping the page', async ({ page }) => {
    await page.clock.install();
    await signIn(page, 'ines@harborridge.test', { next: '/dashboard/vault' });
    await expect(page).toHaveURL(/\/dashboard\/vault$/);

    await page.clock.fastForward('28:30');
    const dialog = page.getByRole('dialog', { name: 'Still there?' });
    await expect(dialog).toBeVisible();
    await shot(page, '13-idle-warning');
    // Escape must not dismiss it.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Stay signed in' }).click();
    await expect(dialog).toBeHidden();

    await page.clock.fastForward('31:00');
    await expect(page).toHaveURL(/\/sign-in\?reason=timeout&next=%2Fdashboard%2Fvault/);
    await expect(page.getByText('signed out after a period without activity')).toBeVisible();
  });
});

test.describe('console', () => {
  test('phone width: navigation is a drawer and nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, 'ines@harborridge.test');   // one workspace, so no picker
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('navigation', { name: 'Main' })).not.toBeInViewport();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: 'Review' }).click();
    await expect(page.getByRole('heading', { name: 'Review', level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).not.toBeInViewport();   // drawer closed itself
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, '14-console-phone');
  });

  test('Cmd+K jumps between pages', async ({ page }) => {
    await signIn(page, 'ines@harborridge.test');   // one workspace, so no picker
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByPlaceholder('Jump to a page or workspace…').fill('integ');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/dashboard\/integrations$/);
    await shot(page, '15-not-yet');
  });
});
