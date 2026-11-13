/**
 * Local identity adapter: bcrypt password hashes in the users table.
 *
 * This is what MonkFlow has always used and it is the default, so existing
 * accounts keep working with no vendor configured. It offers password
 * sign-in and password reset only. SSO, emailed codes, MFA and passkeys
 * arrive with the hosted-vendor adapter.
 */
const bcrypt = require('bcryptjs');
const userModel = require('../../models/user.model');
const { IdentityNotEnabled } = require('./errors');

// A real hash to compare against when the account does not exist, so the
// response takes about the same time either way. Built once, on first use.
let dummyHash = null;
const getDummyHash = () => dummyHash || (dummyHash = bcrypt.hashSync('no-such-account', 12));

const toIdentity = (user) => ({
  email: user.email,
  firstName: user.first_name,
  lastName: user.last_name,
  externalId: user.external_id || null,
  emailVerified: !!user.email_verified,
});

const notEnabled = (what) => async () => { throw new IdentityNotEnabled(what); };

module.exports = {
  name: 'local',
  capabilities: { password: true, passwordReset: true, emailCode: false, sso: [], mfa: false, passkey: false },

  async verifyPassword({ email, password }) {
    const user = await userModel.findByEmailCI(email);
    const ok = await bcrypt.compare(password || '', (user && user.password_hash) || getDummyHash());
    if (!user || !user.password_hash || !ok) return { ok: false };
    return { ok: true, identity: toIdentity(user) };
  },

  // The users row itself is written by the caller (it also needs the name
  // and the membership); the adapter only produces what it owns: the hash.
  async createPasswordUser({ email, password, firstName, lastName }) {
    const passwordHash = await bcrypt.hash(password, 12);
    return { email, firstName, lastName, externalId: null, emailVerified: true, passwordHash };
  },

  sendEmailCode: notEnabled('Emailed sign-in codes'),
  verifyEmailCode: notEnabled('Emailed sign-in codes'),
  ssoAuthorizeUrl() { throw new IdentityNotEnabled('Single sign-on'); },
  exchangeSsoCode: notEnabled('Single sign-on'),
  verifyMfa: notEnabled('Multi-factor authentication'),
  enrollTotp: notEnabled('Multi-factor authentication'),
  confirmTotp: notEnabled('Multi-factor authentication'),

  toIdentity,
};
