/**
 * Stub identity adapter. TESTS AND LOCAL DEVELOPMENT ONLY.
 *
 * Behaves like a hosted vendor with everything switched on, so every
 * sign-in path (SSO, emailed code, MFA) can be exercised end to end before
 * a vendor account exists. services/identity/index.js refuses to load it
 * when NODE_ENV=production.
 *
 * Fixed values, all obviously fake:
 *   emailed code   424242
 *   MFA code       000000   (accounts whose email starts with "mfa." need it)
 *   SSO            the authorize URL is a local page that asks which email
 *                  to come back as
 */
const local = require('./local');
const userModel = require('../../models/user.model');

const EMAIL_CODE = '424242';
const MFA_CODE = '000000';
// A second factor is asked for once the account has enrolled one, as a real
// provider would, and always for the fixed "mfa." test accounts.
const needsMfa = async (email) => {
  if (/^mfa\./i.test(email || '')) return true;
  const user = await userModel.findByEmailCI(email);
  return !!(user && user.mfa_enrolled_at);
};

// Passwordless paths can sign in someone the stub has never seen (an
// invitee arriving through SSO), so build the identity from the email.
async function identityFor(email, extra) {
  const user = await userModel.findByEmailCI(email);
  if (user) return local.toIdentity(user);
  return { email, firstName: (extra && extra.firstName) || '', lastName: (extra && extra.lastName) || '', externalId: `stub_${email}`, emailVerified: true };
}

module.exports = {
  name: 'stub',
  capabilities: { password: true, passwordReset: true, emailCode: true, sso: ['microsoft', 'google'], mfa: true, passkey: false },
  EMAIL_CODE,
  MFA_CODE,

  async verifyPassword({ email, password }) {
    const result = await local.verifyPassword({ email, password });
    if (!result.ok) return result;
    if (await needsMfa(email)) return { ok: true, mfa: { pendingToken: `pending:${email}`, challengeId: 'stub-challenge' } };
    return result;
  },

  createPasswordUser: local.createPasswordUser,

  async sendEmailCode({ email }) {
    console.log(`[stub identity] sign-in code for ${email}: ${EMAIL_CODE}`);
  },

  async verifyEmailCode({ email, code }) {
    if (code !== EMAIL_CODE) return { ok: false };
    return { ok: true, identity: await identityFor(email) };
  },

  ssoAuthorizeUrl({ provider, state, redirectUri, loginHint }) {
    const q = new URLSearchParams({ provider, state, redirect_uri: redirectUri, login_hint: loginHint || '' });
    return `/api/v1/auth/sso/stub-idp?${q}`;
  },

  // The stub IdP page hands back "<provider>:<email>" as the code.
  async exchangeSsoCode({ code }) {
    const [provider, email] = String(code || '').split(/:(.+)/);
    if (!['microsoft', 'google'].includes(provider) || !/^[^\s@]+@[^\s@]+$/.test(email || '')) return { ok: false };
    return { ok: true, provider, identity: await identityFor(email.toLowerCase()) };
  },

  async verifyMfa({ pendingToken, code }) {
    const email = String(pendingToken || '').replace(/^pending:/, '');
    if (code !== MFA_CODE || !email) return { ok: false };
    return { ok: true, identity: await identityFor(email) };
  },

  async enrollTotp({ email }) {
    return { factorId: `stub-factor:${email}`, secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: `otpauth://totp/MonkFlow:${encodeURIComponent(email)}?secret=JBSWY3DPEHPK3PXP&issuer=MonkFlow` };
  },

  async confirmTotp({ code }) {
    return { ok: code === MFA_CODE };
  },
};
