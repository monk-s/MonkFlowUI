-- Portal v2, step 4: append-only audit log and row-level isolation.
--
-- ISOLATION
-- Portal requests run inside a transaction that does
--     SET LOCAL ROLE monkflow_portal;
--     SELECT set_config('app.org_id', '<uuid>', true);
-- (see src/portal/withOrg.js). monkflow_portal owns nothing and is not a
-- superuser, so the policies below apply to it: it can only see rows of the
-- one workspace named in app.org_id, even when a query forgets its WHERE.
-- The API's own connection role (the table owner) is not subject to these
-- policies, so the legacy admin app, the schedulers and the sign-in code
-- that runs before a workspace is known all keep working unchanged.
--
-- AUDIT LOG
-- Rows can be inserted and read. UPDATE, DELETE and TRUNCATE are rejected
-- by trigger for every role, and each row stores a hash of the previous row
-- of the same workspace so a gap or an edit made by a superuser who disabled
-- the trigger is detectable.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monkflow_portal') THEN
    CREATE ROLE monkflow_portal NOLOGIN;
  END IF;
END $$;

-- The connection role must be able to switch into it.
DO $$
BEGIN
  EXECUTE format('GRANT monkflow_portal TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  -- A superuser can SET ROLE without the grant; ignore "already a member".
  NULL;
END $$;

CREATE OR REPLACE FUNCTION app_org_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- ── Audit log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  -- NULL for platform-level events that belong to no workspace.
  org_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
  -- Deliberately not a foreign key: removing a user must not rewrite history
  -- (ON DELETE SET NULL would be an UPDATE, which this table refuses). The
  -- email is kept on the row so the trail still reads after a user is gone.
  actor_user_id UUID,
  actor_email VARCHAR(255),
  -- admin | reviewer | auditor | monkflow_staff | system
  actor_role VARCHAR(30),
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(60),
  target_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}',
  ip VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  prev_hash VARCHAR(64),
  row_hash VARCHAR(64) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_log(org_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_user_id);

CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger AS $$
DECLARE
  chain_key TEXT := COALESCE(NEW.org_id::text, 'platform');
BEGIN
  -- One writer per workspace chain at a time, so prev_hash is never stale.
  PERFORM pg_advisory_xact_lock(hashtext('audit_log:' || chain_key));
  -- Take the id only now, under the lock. The column default draws it before
  -- this trigger runs, so two concurrent writers could otherwise get ids in
  -- the opposite order to their place in the chain.
  NEW.id := nextval('audit_log_id_seq');
  SELECT row_hash INTO NEW.prev_hash
    FROM audit_log
   WHERE org_id IS NOT DISTINCT FROM NEW.org_id
   ORDER BY id DESC
   LIMIT 1;
  NEW.created_at := clock_timestamp();
  NEW.row_hash := encode(digest(
    COALESCE(NEW.prev_hash, '') || '|' || chain_key || '|' ||
    COALESCE(NEW.actor_user_id::text, '') || '|' || COALESCE(NEW.actor_email, '') || '|' ||
    COALESCE(NEW.actor_role, '') || '|' || NEW.action || '|' ||
    COALESCE(NEW.target_type, '') || '|' || COALESCE(NEW.target_id, '') || '|' ||
    NEW.metadata::text || '|' || NEW.created_at::text,
    'sha256'), 'hex');
  RETURN NEW;
END;
-- SECURITY DEFINER: the chain lookup must see the previous row even when the
-- inserting role's own view of the table is filtered.
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_chain ON audit_log;
CREATE TRIGGER trg_audit_chain BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_chain();

DROP TRIGGER IF EXISTS trg_audit_no_update ON audit_log;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

DROP TRIGGER IF EXISTS trg_audit_no_truncate ON audit_log;
CREATE TRIGGER trg_audit_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- ── Member directory ─────────────────────────────────────────
-- The portal role gets no access to the users table at all (it holds
-- password hashes and every other firm's people). It reads names and emails
-- of its own workspace's members through this view, which runs with the
-- owner's rights and filters by app.org_id itself.
CREATE OR REPLACE VIEW org_members AS
  SELECT m.id AS membership_id,
         m.org_id,
         m.user_id,
         m.role,
         m.status,
         m.created_at AS joined_at,
         u.email,
         u.first_name,
         u.last_name,
         (u.password_hash IS NOT NULL) AS has_password,
         (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_active_at
    FROM memberships m
    JOIN users u ON u.id = m.user_id
   WHERE m.org_id = app_org_id();

-- ── Grants and policies for the portal role ──────────────────
GRANT USAGE ON SCHEMA public TO monkflow_portal;
GRANT SELECT, UPDATE ON organizations TO monkflow_portal;
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO monkflow_portal;
GRANT SELECT, INSERT, UPDATE ON invitations TO monkflow_portal;
GRANT SELECT, INSERT ON audit_log TO monkflow_portal;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO monkflow_portal;
GRANT SELECT ON org_members TO monkflow_portal;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_org ON organizations;
CREATE POLICY portal_org ON organizations FOR ALL TO monkflow_portal
  USING (id = app_org_id()) WITH CHECK (id = app_org_id());

DROP POLICY IF EXISTS portal_org ON memberships;
CREATE POLICY portal_org ON memberships FOR ALL TO monkflow_portal
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());

DROP POLICY IF EXISTS portal_org ON invitations;
CREATE POLICY portal_org ON invitations FOR ALL TO monkflow_portal
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());

DROP POLICY IF EXISTS portal_org ON audit_log;
CREATE POLICY portal_org ON audit_log FOR ALL TO monkflow_portal
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
