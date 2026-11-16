-- Portal v2, step 1: organizations (workspaces) and memberships.
--
-- Until now a tenant was a single user row. A workspace is now an
-- organization, people belong to it through a membership, and the
-- membership carries the role. Nothing existing is dropped or renamed:
-- the legacy admin app keeps reading user_id columns.
--
-- Idempotent on purpose. src/index.js runs pending migrations at boot and
-- carries on if one fails, so every statement must be safe to re-run.

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  vertical VARCHAR(20) NOT NULL DEFAULT 'CRE'
    CHECK (vertical IN ('CRE', 'BANK', 'INVESTMENT_FIRM')),
  -- Funds, entities or bank subsidiaries of one firm point at the parent.
  parent_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  -- Lower-case email domains that belong to this firm, e.g. {harborridge.com}.
  allowed_email_domains TEXT[] NOT NULL DEFAULT '{}',
  -- When sso_required is true, people on those domains must use sso_provider.
  sso_provider VARCHAR(20) CHECK (sso_provider IN ('microsoft', 'google')),
  sso_required BOOLEAN NOT NULL DEFAULT FALSE,
  session_idle_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (session_idle_minutes BETWEEN 5 AND 480),
  -- Id of this organization at the identity vendor, when one is in use.
  external_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT sso_required OR sso_provider IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_organizations_parent ON organizations(parent_org_id);
CREATE INDEX IF NOT EXISTS idx_organizations_domains ON organizations USING GIN (allowed_email_domains);

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- admin    = Admin / Managing Partner
  -- reviewer = Operations / Analyst Reviewer
  -- auditor  = Read-Only Auditor
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'reviewer', 'auditor')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);

-- Users: MonkFlow staff become a platform flag instead of a role value, and
-- people who only ever sign in through their firm's identity provider have
-- no password here.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
-- The workspace that rows written by legacy, user-scoped code belong to.
ALTER TABLE users ADD COLUMN IF NOT EXISTS home_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
-- Set when a password account finishes adding its second factor.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

UPDATE users SET is_platform_admin = TRUE WHERE role = 'superadmin' AND is_platform_admin = FALSE;
