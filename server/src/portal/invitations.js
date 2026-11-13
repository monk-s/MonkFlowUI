/**
 * Creating invitations. Shared by workspace admins (routes/portal) and by
 * MonkFlow staff setting up a new client (routes/admin).
 *
 * The emailed token is returned to the caller once, to put in the email,
 * and only its hash is stored. Send the email AFTER the transaction commits.
 */
const env = require('../config/env');
const { generateToken, hashToken } = require('../utils/crypto');
const { coded } = require('../middleware/session');
const { ROLES } = require('./permissions');

const normEmail = (v) => String(v || '').trim().toLowerCase();

/**
 * @param db      a client from withOrg() for the workspace being invited to
 * @param org     { id, allowed_email_domains }
 */
async function createInvitation(db, { org, email, role, invitedBy }) {
  const address = normEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw coded(400, 'invalid_email', 'Enter a valid email address.');
  if (!ROLES.includes(role)) throw coded(400, 'invalid_role', 'Choose a role.');

  const domains = org.allowed_email_domains || [];
  const domain = address.split('@')[1];
  if (domains.length && !domains.includes(domain)) {
    throw coded(400, 'domain_not_allowed', `Only ${domains.join(', ')} addresses can be invited to this workspace. Add the domain under Security first.`, { domains });
  }

  const member = await db.query(
    "SELECT 1 FROM org_members WHERE lower(email) = $1 AND status = 'active'",
    [address]
  );
  if (member.rows.length) throw coded(409, 'already_member', 'That person already has access to this workspace.');

  const open = await db.query(
    'SELECT id FROM invitations WHERE org_id = $1 AND lower(email) = $2 AND accepted_at IS NULL AND revoked_at IS NULL',
    [org.id, address]
  );
  if (open.rows.length) throw coded(409, 'already_invited', 'That person already has an open invitation. Resend it instead.', { invitationId: open.rows[0].id });

  const rawToken = generateToken(32);
  const expiresAt = new Date(Date.now() + env.inviteExpiresDays * 24 * 60 * 60 * 1000);
  const { rows } = await db.query(
    `INSERT INTO invitations (org_id, email, role, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, org_id, email, role, created_at, expires_at`,
    [org.id, address, role, hashToken(rawToken), invitedBy || null, expiresAt]
  );
  return { invitation: rows[0], rawToken };
}

module.exports = { createInvitation, normEmail };
