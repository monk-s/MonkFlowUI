/**
 * Identity seam.
 *
 * Everything that answers "is this person who they say they are" goes
 * through the adapter chosen here, so the vendor can be swapped without
 * touching routes, sessions or the portal. MonkFlow always issues its own
 * session afterwards (services/session.service.js); the adapter never does.
 *
 * An adapter exports:
 *
 *   name            string
 *   capabilities    { password, passwordReset, emailCode, sso: [providers], mfa, passkey }
 *
 *   verifyPassword({ email, password })
 *       -> { ok: true, identity }
 *        | { ok: true, mfa: { pendingToken, challengeId } }   second factor needed
 *        | { ok: false }
 *   createPasswordUser({ email, password, firstName, lastName }) -> identity
 *
 *   sendEmailCode({ email })                 -> void   (must not reveal whether the account exists)
 *   verifyEmailCode({ email, code })         -> { ok, identity }
 *
 *   ssoAuthorizeUrl({ provider, state, redirectUri, loginHint }) -> url
 *   exchangeSsoCode({ code })                -> { ok, identity, provider }
 *
 *   verifyMfa({ pendingToken, challengeId, code }) -> { ok, identity }
 *   enrollTotp({ email })                    -> { factorId, secret, otpauthUrl }
 *   confirmTotp({ factorId, code })          -> { ok }
 *
 * `identity` is { email, firstName, lastName, externalId, emailVerified }.
 * Methods outside an adapter's capabilities throw IdentityNotEnabled.
 */
const env = require('../../config/env');

const { IdentityNotEnabled } = require('./errors');

function load() {
  const name = env.identityProvider;
  if (name === 'local') return require('./local');
  if (name === 'stub') {
    if (env.isProd) throw new Error('IDENTITY_PROVIDER=stub is refused in production');
    return require('./stub');
  }
  throw new Error(`Unknown IDENTITY_PROVIDER "${name}". Supported: local, stub.`);
}

let adapter = null;
function identity() {
  if (!adapter) adapter = load();
  return adapter;
}

// What the sign-in screen is allowed to offer. The front end shows a button
// only when its method is listed here, so nothing on screen is a dead end.
function publicConfig() {
  const c = identity().capabilities;
  return {
    password: !!c.password,
    passwordReset: !!c.passwordReset,
    emailCode: !!c.emailCode,
    sso: c.sso || [],
    mfa: !!c.mfa,
    passkey: !!c.passkey,
  };
}

module.exports = { identity, publicConfig, IdentityNotEnabled };
