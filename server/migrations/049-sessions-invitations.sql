-- Portal v2, step 2: server-side sessions and invitations.
--
-- Sessions replace the access/refresh token pair kept in localStorage. The
-- browser holds an opaque random value in an HttpOnly cookie; only its
-- SHA-256 hash is stored here, so a database leak does not leak sessions.
--
-- Invitations are the only way an account is created. The emailed token is
-- stored hashed for the same reason.

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- NULL while someone with several workspaces has not picked one yet, and
  -- for MonkFlow staff working in the admin console.
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  auth_method VARCHAR(30) NOT NULL DEFAULT 'password',
  mfa_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ip VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Absolute limit. The idle limit is last_seen_at + the workspace setting.
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'reviewer', 'auditor')),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  opened_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  -- Last time the invitee asked for a fresh link, to rate-limit that button.
  renewal_requested_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(org_id);
-- One open invitation per address per workspace.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invitations_open
  ON invitations (org_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
