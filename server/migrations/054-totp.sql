-- Second factor (authenticator app) for the built-in sign-in.
-- Secrets are sealed with utils/secretBox.js (DOCUMENT_KEY), bound to the user id.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret BYTEA;          -- confirmed secret
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_pending_secret BYTEA;  -- shown in setup, not yet confirmed
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_step BIGINT;      -- last 30-second step used, so a code works once
