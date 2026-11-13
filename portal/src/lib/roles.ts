import type { Role } from './types';

// Display names for roles. The permissions themselves live on the server
// (server/src/portal/permissions.js) and arrive with the session.
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin / Managing Partner',
  reviewer: 'Operations / Analyst Reviewer',
  auditor: 'Read-Only Auditor',
  monkflow_staff: 'MonkFlow',
};

export const ROLE_SHORT: Record<Role, string> = {
  admin: 'Admin',
  reviewer: 'Reviewer',
  auditor: 'Auditor',
  monkflow_staff: 'MonkFlow',
};

export const ROLE_HELP: Record<Exclude<Role, 'monkflow_staff'>, string> = {
  admin: 'Everything, including sign-offs, credentials, people and sign-in policy.',
  reviewer: 'Reviews and approves extractions, raises requests. Cannot manage people or credentials.',
  auditor: 'Reads everything, including the audit log. Cannot change anything.',
};
