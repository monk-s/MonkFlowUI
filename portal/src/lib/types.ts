// Shapes shared by the screens. Mirrors what the API returns
// (server/src/services/session.service.js, routes/portal).

export type Vertical = 'CRE' | 'BANK' | 'INVESTMENT_FIRM';
export type Role = 'admin' | 'reviewer' | 'auditor' | 'monkflow_staff';
export type SsoProvider = 'microsoft' | 'google';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  vertical: Vertical;
  parentOrgId?: string | null;
  role?: Role;
}

export interface Session {
  user: { id: string; email: string; firstName: string; lastName: string; isPlatformAdmin: boolean };
  org: Workspace | null;
  role: Role | null;
  permissions: string[];
  workspaces: Workspace[];
  authMethod: string;
  mfaVerified: boolean;
  mfaSetupRequired: boolean;
  idleMinutes: number;
  idleExpiresAt: string;
  expiresAt: string;
  lastOrgId?: string | null;
}

/** Where the API says to go once a sign-in step succeeds. */
export type NextStep = 'dashboard' | 'select-workspace' | 'mfa' | 'mfa-setup' | 'admin';
export interface SignInResult { next: NextStep; session?: Session }

export interface AuthMethods {
  password: boolean;
  passwordReset: boolean;
  emailCode: boolean;
  sso: SsoProvider[];
  mfa: boolean;
  passkey: boolean;
}

export interface Invitation {
  state: 'valid' | 'expired' | 'accepted' | 'invalid';
  email?: string;
  role?: Role;
  roleLabel?: string;
  org?: { name: string; vertical: Vertical };
  inviterName?: string;
  expiresAt?: string;
  accountExists?: boolean;
  ssoRequired?: SsoProvider | null;
  methods?: AuthMethods;
  minPasswordLength?: number;
}

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Exclude<Role, 'monkflow_staff'>;
  roleLabel: string;
  status: 'active' | 'suspended';
  joinedAt: string;
  signInMethod: 'password' | 'sso';
  lastActiveAt: string | null;
  isYou: boolean;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: Exclude<Role, 'monkflow_staff'>;
  roleLabel: string;
  createdAt: string;
  expiresAt: string;
  openedAt: string | null;
  expired: boolean;
}

export interface Team {
  members: TeamMember[];
  invitations: PendingInvitation[];
  roles: { value: Exclude<Role, 'monkflow_staff'>; label: string }[];
}
