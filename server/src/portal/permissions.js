/**
 * The role matrix. This file is the single source of truth: the server
 * enforces it (middleware/session.js requirePermission) and sends the
 * resulting list to the portal, which only hides what would be refused.
 *
 *   admin           Admin / Managing Partner
 *   reviewer        Operations / Analyst Reviewer
 *   auditor         Read-Only Auditor
 *   monkflow_staff  MonkFlow working inside a client workspace. Not a
 *                   membership role; every action is written to that
 *                   client's audit log under this label.
 */
const ROLES = ['admin', 'reviewer', 'auditor'];
const ROLE_LABELS = {
  admin: 'Admin / Managing Partner',
  reviewer: 'Operations / Analyst Reviewer',
  auditor: 'Read-Only Auditor',
  monkflow_staff: 'MonkFlow',
};

const ALL = ['admin', 'reviewer', 'auditor'];

const PERMISSIONS = {
  'overview.view': ALL,
  'workflows.view': ALL,
  'review.view': ALL,
  'review.decide': ['admin', 'reviewer'],          // edit fields, approve, reject, sync
  'engagement.signoff': ['admin'],                 // milestone sign-off
  'proposals.approve': ['admin'],
  'connectors.view': ALL,
  'connectors.manage': ['admin'],                  // credentials, webhooks, API keys
  'vault.view': ALL,
  'vault.view_agreements': ['admin', 'reviewer'],  // SOWs are hidden from auditors unless granted
  'requests.create': ['admin', 'reviewer'],
  'messages.send': ['admin', 'reviewer'],
  'team.view': ALL,
  'team.manage': ['admin'],                        // invite, remove, change roles
  'security.manage': ['admin'],                    // sign-in policy, idle timeout
  'audit.view': ['admin', 'auditor'],
  'data.export': ALL,                              // every export is itself logged
};

function permissionsFor(role) {
  if (role === 'monkflow_staff') return Object.keys(PERMISSIONS);
  return Object.keys(PERMISSIONS).filter((p) => PERMISSIONS[p].includes(role));
}

function can(role, permission) {
  if (!PERMISSIONS[permission]) return false;
  if (role === 'monkflow_staff') return true;
  return PERMISSIONS[permission].includes(role);
}

module.exports = { ROLES, ROLE_LABELS, PERMISSIONS, permissionsFor, can };
