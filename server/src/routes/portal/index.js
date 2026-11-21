/**
 * /api/v1/portal — the client-facing API.
 *
 * Rules for every route in this tree:
 *   - authenticate with requireOrg / requirePermission (middleware/session.js)
 *   - read and write through withOrg(req.session.orgId, ...) so the database
 *     enforces workspace isolation (portal/withOrg.js)
 *   - write an audit() row for anything that changes state
 *   - a row that is missing and a row the caller may not see both answer 404
 */
const router = require('express').Router();
const { z } = require('zod');
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const { requireOrg, requirePermission, sameOrigin, coded } = require('../../middleware/session');
const { withOrg, UUID } = require('../../portal/withOrg');
const { audit } = require('../../portal/audit');
const { can, ROLES, ROLE_LABELS } = require('../../portal/permissions');
const { createInvitation } = require('../../portal/invitations');
const sessions = require('../../services/session.service');
const logger = require('../../utils/logger');

router.use(sameOrigin);

const idParam = (req) => {
  if (!UUID.test(req.params.id)) throw ApiError.notFound('Not found');
  return req.params.id;
};

const sendInvite = async (req, org, invitation, rawToken) => {
  try {
    const emailService = require('../../services/email.service');
    const inviterName = `${req.session.firstName || ''} ${req.session.lastName || ''}`.trim() || 'MonkFlow';
    await emailService.sendPortalInvitation({
      to: invitation.email, orgName: org.name, roleLabel: ROLE_LABELS[invitation.role],
      inviterName, token: rawToken, expiresAt: invitation.expires_at,
    });
    return true;
  } catch (err) {
    logger.error('invitation email failed: %s', err.message);
    return false;
  }
};

// ── Workspace ─────────────────────────────────────────────────
router.get('/workspace', requireOrg, catchAsync(async (req, res) => {
  const org = await withOrg(req.session.orgId, async (db) => {
    const { rows } = await db.query(
      `SELECT id, name, slug, vertical, parent_org_id, allowed_email_domains, sso_provider, sso_required, session_idle_minutes
         FROM organizations`
    );
    return rows[0];
  });
  if (!org) throw ApiError.notFound('Not found');
  res.json({
    workspace: {
      id: org.id, name: org.name, slug: org.slug, vertical: org.vertical, parentOrgId: org.parent_org_id,
      allowedEmailDomains: org.allowed_email_domains, ssoProvider: org.sso_provider, ssoRequired: org.sso_required,
      sessionIdleMinutes: org.session_idle_minutes,
    },
  });
}));

// ── Team ──────────────────────────────────────────────────────
router.get('/team', requirePermission('team.view'), catchAsync(async (req, res) => {
  const manage = can(req.session.role, 'team.manage');
  const data = await withOrg(req.session.orgId, async (db) => {
    const members = await db.query(
      `SELECT membership_id, user_id, email, first_name, last_name, role, status, joined_at, has_password, last_active_at
         FROM org_members ORDER BY lower(last_name), lower(first_name)`
    );
    // Pending invitations are an admin's business only.
    const invitations = manage
      ? await db.query(
        `SELECT id, email, role, created_at, expires_at, opened_at, (expires_at < NOW()) AS expired
           FROM invitations WHERE accepted_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC`
      )
      : { rows: [] };
    return { members: members.rows, invitations: invitations.rows };
  });
  res.json({
    members: data.members.map((m) => ({
      id: m.membership_id, userId: m.user_id, email: m.email, firstName: m.first_name, lastName: m.last_name,
      role: m.role, roleLabel: ROLE_LABELS[m.role], status: m.status, joinedAt: m.joined_at,
      signInMethod: m.has_password ? 'password' : 'sso', lastActiveAt: m.last_active_at,
      isYou: m.user_id === req.session.userId,
    })),
    invitations: data.invitations.map((i) => ({
      id: i.id, email: i.email, role: i.role, roleLabel: ROLE_LABELS[i.role],
      createdAt: i.created_at, expiresAt: i.expires_at, openedAt: i.opened_at, expired: i.expired,
    })),
    roles: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
  });
}));

const inviteSchema = z.object({ email: z.string().trim().email('Enter a valid email address'), role: z.enum(ROLES) });

router.post('/invitations', requirePermission('team.manage'), catchAsync(async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) throw coded(400, 'invalid_input', parsed.error.errors[0].message);

  const out = await withOrg(req.session.orgId, async (db) => {
    const org = (await db.query('SELECT id, name, allowed_email_domains FROM organizations')).rows[0];
    const created = await createInvitation(db, { org, email: parsed.data.email, role: parsed.data.role, invitedBy: req.session.userId });
    await audit(db, req, {
      action: 'invitation.sent', targetType: 'invitation', targetId: created.invitation.id,
      metadata: { email: created.invitation.email, role: created.invitation.role },
    });
    return { org, ...created };
  });
  const emailSent = await sendInvite(req, out.org, out.invitation, out.rawToken);
  res.status(201).json({
    invitation: { id: out.invitation.id, email: out.invitation.email, role: out.invitation.role, expiresAt: out.invitation.expires_at },
    emailSent,
  });
}));

// Resend = revoke the old link and issue a new one, so only one link works.
router.post('/invitations/:id/resend', requirePermission('team.manage'), catchAsync(async (req, res) => {
  const id = idParam(req);
  const out = await withOrg(req.session.orgId, async (db) => {
    const old = (await db.query(
      'UPDATE invitations SET revoked_at = NOW() WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING email, role',
      [id]
    )).rows[0];
    if (!old) throw ApiError.notFound('Not found');
    const org = (await db.query('SELECT id, name, allowed_email_domains FROM organizations')).rows[0];
    const created = await createInvitation(db, { org, email: old.email, role: old.role, invitedBy: req.session.userId });
    await audit(db, req, {
      action: 'invitation.resent', targetType: 'invitation', targetId: created.invitation.id,
      metadata: { email: old.email, role: old.role, replaces: id },
    });
    return { org, ...created };
  });
  const emailSent = await sendInvite(req, out.org, out.invitation, out.rawToken);
  res.status(201).json({
    invitation: { id: out.invitation.id, email: out.invitation.email, role: out.invitation.role, expiresAt: out.invitation.expires_at },
    emailSent,
  });
}));

router.delete('/invitations/:id', requirePermission('team.manage'), catchAsync(async (req, res) => {
  const id = idParam(req);
  await withOrg(req.session.orgId, async (db) => {
    const row = (await db.query(
      'UPDATE invitations SET revoked_at = NOW() WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING email',
      [id]
    )).rows[0];
    if (!row) throw ApiError.notFound('Not found');
    await audit(db, req, { action: 'invitation.revoked', targetType: 'invitation', targetId: id, metadata: { email: row.email } });
  });
  res.json({ ok: true });
}));

// A workspace must always keep at least one active admin.
async function assertNotLastAdmin(db, membership) {
  if (membership.role !== 'admin' || membership.status !== 'active') return;
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM memberships WHERE role = 'admin' AND status = 'active' AND id <> $1",
    [membership.id]
  );
  if (rows[0].n === 0) throw coded(409, 'last_admin', 'A workspace needs at least one admin. Make someone else an admin first.');
}

const memberPatch = z.object({ role: z.enum(ROLES).optional(), status: z.enum(['active', 'suspended']).optional() })
  .refine((v) => v.role || v.status, 'Nothing to change');

router.patch('/team/:id', requirePermission('team.manage'), catchAsync(async (req, res) => {
  const id = idParam(req);
  const parsed = memberPatch.safeParse(req.body);
  if (!parsed.success) throw coded(400, 'invalid_input', parsed.error.errors[0].message);

  const changed = await withOrg(req.session.orgId, async (db) => {
    const current = (await db.query('SELECT id, user_id, role, status FROM memberships WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!current) throw ApiError.notFound('Not found');
    const next = { role: parsed.data.role || current.role, status: parsed.data.status || current.status };
    if (next.role !== 'admin' || next.status !== 'active') await assertNotLastAdmin(db, current);
    await db.query('UPDATE memberships SET role = $2, status = $3, updated_at = NOW() WHERE id = $1', [id, next.role, next.status]);
    if (next.role !== current.role) {
      await audit(db, req, { action: 'team.role_changed', targetType: 'membership', targetId: id, metadata: { userId: current.user_id, from: current.role, to: next.role } });
    }
    if (next.status !== current.status) {
      await audit(db, req, { action: next.status === 'suspended' ? 'team.member_suspended' : 'team.member_restored', targetType: 'membership', targetId: id, metadata: { userId: current.user_id } });
    }
    return { userId: current.user_id, suspended: next.status === 'suspended' && current.status !== 'suspended' };
  });
  // Losing access ends that person's open sessions in this workspace now.
  if (changed.suspended) await sessions.revokeAllForUser(changed.userId, { orgId: req.session.orgId });
  res.json({ ok: true });
}));

router.delete('/team/:id', requirePermission('team.manage'), catchAsync(async (req, res) => {
  const id = idParam(req);
  const removed = await withOrg(req.session.orgId, async (db) => {
    const current = (await db.query('SELECT id, user_id, role, status FROM memberships WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!current) throw ApiError.notFound('Not found');
    await assertNotLastAdmin(db, current);
    const who = (await db.query('SELECT email FROM org_members WHERE membership_id = $1', [id])).rows[0];
    await db.query('DELETE FROM memberships WHERE id = $1', [id]);
    await audit(db, req, { action: 'team.member_removed', targetType: 'membership', targetId: id, metadata: { userId: current.user_id, email: who && who.email, role: current.role } });
    return current;
  });
  await sessions.revokeAllForUser(removed.user_id, { orgId: req.session.orgId });
  res.json({ ok: true });
}));

// ── Engagement tracker, actions, workflows, telemetry ────────
router.use(require('./engagement.routes'));
router.use(require('./workflow.routes'));
router.use(require('./review.routes'));
router.use(require('./audit.routes'));

module.exports = router;
