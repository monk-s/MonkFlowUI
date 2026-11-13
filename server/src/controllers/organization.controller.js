/**
 * MonkFlow staff: create and configure client workspaces.
 * Mounted under /api/v1/admin (authenticate + requireSuperadmin).
 */
const { z } = require('zod');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { query } = require('../config/database');
const { coded } = require('../middleware/session');
const { withOrg, UUID } = require('../portal/withOrg');
const { audit } = require('../portal/audit');
const { createInvitation } = require('../portal/invitations');
const { ROLES, ROLE_LABELS } = require('../portal/permissions');
const { publicConfig } = require('../services/identity');
const { generateToken } = require('../utils/crypto');
const logger = require('../utils/logger');

const domain = z.string().trim().toLowerCase().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Enter a domain such as harborridge.com');

const settings = {
  name: z.string().trim().min(2).max(200),
  vertical: z.enum(['CRE', 'BANK', 'INVESTMENT_FIRM']),
  parentOrgId: z.string().uuid().nullable().optional(),
  allowedEmailDomains: z.array(domain).max(20).optional(),
  ssoProvider: z.enum(['microsoft', 'google']).nullable().optional(),
  ssoRequired: z.boolean().optional(),
  sessionIdleMinutes: z.number().int().min(5).max(480).optional(),
};
const createSchema = z.object({ ...settings, adminEmail: z.string().trim().email().optional() });
const updateSchema = z.object(settings).partial();

const parse = (schema, body) => {
  const out = schema.safeParse(body);
  if (!out.success) {
    const first = out.error.errors[0];
    throw coded(400, 'invalid_input', `${first.path.join('.') || 'input'}: ${first.message}`);
  }
  return out.data;
};

// A firm cannot be required to use a sign-in method that is not switched on,
// or nobody there could sign in.
function assertSsoUsable(data) {
  if (data.ssoRequired && !data.ssoProvider) throw coded(400, 'invalid_input', 'Choose which provider is required.');
  if (data.ssoRequired && !publicConfig().sso.includes(data.ssoProvider)) {
    throw coded(400, 'sso_not_available', `${data.ssoProvider} sign-in is not enabled on this deployment yet, so it cannot be required.`);
  }
  if (data.ssoRequired && !(data.allowedEmailDomains || []).length) {
    throw coded(400, 'invalid_input', 'List the firm\'s email domains before requiring single sign-on.');
  }
}

const slugify = (name) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'workspace'}-${generateToken(3)}`;

const view = (o) => ({
  id: o.id, name: o.name, slug: o.slug, vertical: o.vertical, parentOrgId: o.parent_org_id,
  allowedEmailDomains: o.allowed_email_domains, ssoProvider: o.sso_provider, ssoRequired: o.sso_required,
  sessionIdleMinutes: o.session_idle_minutes, createdAt: o.created_at,
  members: o.members, openInvitations: o.open_invitations,
});

async function sendInvite(req, org, invitation, rawToken) {
  try {
    const emailService = require('../services/email.service');
    await emailService.sendPortalInvitation({
      to: invitation.email, orgName: org.name, roleLabel: ROLE_LABELS[invitation.role],
      inviterName: 'MonkFlow', token: rawToken, expiresAt: invitation.expires_at,
    });
    return true;
  } catch (err) {
    logger.error('invitation email failed: %s', err.message);
    return false;
  }
}

async function inviteTo(req, org, email, role) {
  const actor = { actorUserId: req.user.userId, actorEmail: req.user.email, actorRole: 'monkflow_staff', orgId: org.id };
  const created = await withOrg(org.id, async (db) => {
    const out = await createInvitation(db, { org, email, role, invitedBy: req.user.userId });
    await audit(db, req, { ...actor, action: 'invitation.sent', targetType: 'invitation', targetId: out.invitation.id, metadata: { email: out.invitation.email, role } });
    return out;
  });
  const emailSent = await sendInvite(req, org, created.invitation, created.rawToken);
  return { id: created.invitation.id, email: created.invitation.email, role, expiresAt: created.invitation.expires_at, emailSent };
}

const list = catchAsync(async (req, res) => {
  const { rows } = await query(
    `SELECT o.*,
            (SELECT count(*)::int FROM memberships m WHERE m.org_id = o.id AND m.status = 'active') AS members,
            (SELECT count(*)::int FROM invitations i WHERE i.org_id = o.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > NOW()) AS open_invitations
       FROM organizations o ORDER BY o.created_at DESC`
  );
  res.json({ organizations: rows.map(view) });
});

const create = catchAsync(async (req, res) => {
  const data = parse(createSchema, req.body);
  assertSsoUsable(data);
  const { rows } = await query(
    `INSERT INTO organizations (name, slug, vertical, parent_org_id, allowed_email_domains, sso_provider, sso_required, session_idle_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [data.name, slugify(data.name), data.vertical, data.parentOrgId || null, data.allowedEmailDomains || [],
      data.ssoProvider || null, !!data.ssoRequired, data.sessionIdleMinutes || 30]
  );
  const org = rows[0];
  await audit(null, req, {
    orgId: org.id, actorUserId: req.user.userId, actorEmail: req.user.email, actorRole: 'monkflow_staff',
    action: 'workspace.created', targetType: 'organization', targetId: org.id, metadata: { name: org.name, vertical: org.vertical },
  });
  const invitation = data.adminEmail ? await inviteTo(req, org, data.adminEmail, 'admin') : null;
  res.status(201).json({ organization: view(org), invitation });
});

const update = catchAsync(async (req, res) => {
  if (!UUID.test(req.params.id)) throw ApiError.notFound('Not found');
  const data = parse(updateSchema, req.body);
  const current = (await query('SELECT * FROM organizations WHERE id = $1', [req.params.id])).rows[0];
  if (!current) throw ApiError.notFound('Not found');

  const next = {
    name: data.name ?? current.name,
    vertical: data.vertical ?? current.vertical,
    parentOrgId: data.parentOrgId !== undefined ? data.parentOrgId : current.parent_org_id,
    allowedEmailDomains: data.allowedEmailDomains ?? current.allowed_email_domains,
    ssoProvider: data.ssoProvider !== undefined ? data.ssoProvider : current.sso_provider,
    ssoRequired: data.ssoRequired ?? current.sso_required,
    sessionIdleMinutes: data.sessionIdleMinutes ?? current.session_idle_minutes,
  };
  if (next.parentOrgId === current.id) throw coded(400, 'invalid_input', 'A workspace cannot be its own parent.');
  assertSsoUsable(next);

  const { rows } = await query(
    `UPDATE organizations SET name = $2, vertical = $3, parent_org_id = $4, allowed_email_domains = $5,
            sso_provider = $6, sso_required = $7, session_idle_minutes = $8, updated_at = NOW()
      WHERE id = $1 RETURNING *`,
    [current.id, next.name, next.vertical, next.parentOrgId, next.allowedEmailDomains, next.ssoProvider, next.ssoRequired, next.sessionIdleMinutes]
  );
  await audit(null, req, {
    orgId: current.id, actorUserId: req.user.userId, actorEmail: req.user.email, actorRole: 'monkflow_staff',
    action: 'workspace.settings_changed', targetType: 'organization', targetId: current.id, metadata: { changed: Object.keys(data) },
  });
  res.json({ organization: view(rows[0]) });
});

const invite = catchAsync(async (req, res) => {
  if (!UUID.test(req.params.id)) throw ApiError.notFound('Not found');
  const data = parse(z.object({ email: z.string().trim().email(), role: z.enum(ROLES) }), req.body);
  const org = (await query('SELECT * FROM organizations WHERE id = $1', [req.params.id])).rows[0];
  if (!org) throw ApiError.notFound('Not found');
  res.status(201).json({ invitation: await inviteTo(req, org, data.email, data.role) });
});

module.exports = { list, create, update, invite };
