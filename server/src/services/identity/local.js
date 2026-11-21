/**
 * Local identity adapter: bcrypt password hashes in the users table.
 *
 * This is what MonkFlow has always used and it is the default, so existing
 * accounts keep working with no vendor configured. It offers password
 * sign-in, password reset and a second factor from an authenticator app
 * (TOTP, RFC 6238). SSO, emailed codes and passkeys arrive with the
 * hosted-vendor adapter.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const userModel = require('../../models/user.model');
const { query } = require('../../config/database');
const secretBox = require('../../utils/secretBox');
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

// ── TOTP: 6 digits, 30-second steps, HMAC-SHA1 (what authenticator apps expect) ──
const STEP_MS = 30000;
const stepAt = (ms) => Math.floor(ms / STEP_MS);

function totp(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac('sha1', secret).update(counter).digest();
  const at = mac[19] & 0xf;
  return String((mac.readUInt32BE(at) & 0x7fffffff) % 1e6).padStart(6, '0');
}

function base32(buf) {
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  return bits.match(/.{1,5}/g).map((b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(b.padEnd(5, '0'), 2)]).join('');
}

/** The step a code belongs to (this one, or one either side for clock drift), or null. */
function matchStep(secret, code, now = Date.now()) {
  const given = Buffer.from(String(code || ''));
  for (const step of [stepAt(now), stepAt(now) - 1, stepAt(now) + 1]) {
    const want = Buffer.from(totp(secret, step));
    if (given.length === want.length && crypto.timingSafeEqual(given, want)) return step;
  }
  return null;
}

const notEnabled = (what) => async () => { throw new IdentityNotEnabled(what); };

module.exports = {
  name: 'local',
  capabilities: { password: true, passwordReset: true, emailCode: false, sso: [], mfa: true, passkey: false },
  totp,

  async verifyPassword({ email, password }) {
    const user = await userModel.findByEmailCI(email);
    const ok = await bcrypt.compare(password || '', (user && user.password_hash) || getDummyHash());
    if (!user || !user.password_hash || !ok) return { ok: false };
    // The caller keeps pendingToken in a signed, 5-minute cookie.
    if (user.mfa_secret) return { ok: true, mfa: { pendingToken: user.email, challengeId: 'totp' } };
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

  async verifyMfa({ pendingToken, code }, now = Date.now()) {
    const user = await userModel.findByEmailCI(pendingToken || '');
    if (!user || !user.mfa_secret) return { ok: false };
    const step = matchStep(secretBox.open(user.mfa_secret, user.id), code, now);
    if (step === null) return { ok: false };
    // Each code works once: the step must be newer than the last one used.
    const used = await query('UPDATE users SET mfa_last_step = $2 WHERE id = $1 AND COALESCE(mfa_last_step, 0) < $2', [user.id, step]);
    if (!used.rowCount) return { ok: false };
    return { ok: true, identity: toIdentity(user) };
  },

  // Setup step 1: make a secret and hold it as pending until a code proves
  // the app has it. The live secret is untouched until then.
  async enrollTotp({ email }) {
    if (!secretBox.configured()) throw new Error('DOCUMENT_KEY is not set; two-step sign-in cannot store its secret.');
    const user = await userModel.findByEmailCI(email);
    const secret = crypto.randomBytes(20);
    await query('UPDATE users SET mfa_pending_secret = $2 WHERE id = $1', [user.id, secretBox.seal(secret, user.id)]);
    const key = base32(secret);
    return { factorId: 'totp', secret: key, otpauthUrl: `otpauth://totp/MonkFlow:${encodeURIComponent(user.email)}?secret=${key}&issuer=MonkFlow` };
  },

  async confirmTotp({ email, code }, now = Date.now()) {
    const user = await userModel.findByEmailCI(email || '');
    if (!user || !user.mfa_pending_secret) return { ok: false };
    const step = matchStep(secretBox.open(user.mfa_pending_secret, user.id), code, now);
    if (step === null) return { ok: false };
    await query('UPDATE users SET mfa_secret = mfa_pending_secret, mfa_pending_secret = NULL, mfa_last_step = $2 WHERE id = $1', [user.id, step]);
    return { ok: true };
  },

  toIdentity,
};
