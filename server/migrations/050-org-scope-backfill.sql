-- Portal v2, step 3: give every existing client a workspace and stamp the
-- tables the portal reads with org_id.
--
-- * Each existing non-staff user gets one organization and is its admin.
--   The vertical is set to INVESTMENT_FIRM because the accounts that exist
--   today date from the wealth-management period; change it per firm in the
--   admin console.
-- * team_members rows are NOT migrated: no invite was ever accepted (there
--   was no endpoint to accept one), so every row is a dead link. The table
--   is left in place.
-- * Legacy code keeps inserting rows with only user_id. A trigger fills
--   org_id from the user's home workspace so the two never drift apart.

-- 1. One workspace per existing client account.
INSERT INTO organizations (id, name, slug, vertical)
SELECT gen_random_uuid(),
       COALESCE(NULLIF(btrim(u.company), ''), btrim(u.first_name || ' ' || u.last_name), u.email),
       'ws-' || replace(u.id::text, '-', ''),
       'INVESTMENT_FIRM'
FROM users u
WHERE u.is_platform_admin = FALSE
  AND u.home_org_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)
ON CONFLICT (slug) DO NOTHING;

UPDATE users u
SET home_org_id = o.id
FROM organizations o
WHERE o.slug = 'ws-' || replace(u.id::text, '-', '')
  AND u.home_org_id IS NULL;

INSERT INTO memberships (org_id, user_id, role)
SELECT u.home_org_id, u.id, 'admin'
FROM users u
WHERE u.home_org_id IS NOT NULL
ON CONFLICT (org_id, user_id) DO NOTHING;

-- 2. org_id on the tables the portal will read.
ALTER TABLE workflows         ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE agents            ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE projects          ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE api_keys          ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE workflows t         SET org_id = u.home_org_id FROM users u WHERE t.user_id = u.id AND t.org_id IS NULL AND u.home_org_id IS NOT NULL;
UPDATE agents t            SET org_id = u.home_org_id FROM users u WHERE t.user_id = u.id AND t.org_id IS NULL AND u.home_org_id IS NOT NULL;
UPDATE projects t          SET org_id = u.home_org_id FROM users u WHERE t.user_id = u.id AND t.org_id IS NULL AND u.home_org_id IS NOT NULL;
UPDATE user_integrations t SET org_id = u.home_org_id FROM users u WHERE t.user_id = u.id AND t.org_id IS NULL AND u.home_org_id IS NOT NULL;
UPDATE api_keys t          SET org_id = u.home_org_id FROM users u WHERE t.user_id = u.id AND t.org_id IS NULL AND u.home_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflows_org         ON workflows(org_id);
CREATE INDEX IF NOT EXISTS idx_agents_org            ON agents(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_org          ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_org ON user_integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org          ON api_keys(org_id);

-- 3. Keep org_id filled for rows written by code that only knows user_id.
CREATE OR REPLACE FUNCTION set_org_id_from_user() RETURNS trigger AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT home_org_id INTO NEW.org_id FROM users WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workflows_org ON workflows;
CREATE TRIGGER trg_workflows_org BEFORE INSERT ON workflows
  FOR EACH ROW EXECUTE FUNCTION set_org_id_from_user();

DROP TRIGGER IF EXISTS trg_agents_org ON agents;
CREATE TRIGGER trg_agents_org BEFORE INSERT ON agents
  FOR EACH ROW EXECUTE FUNCTION set_org_id_from_user();

DROP TRIGGER IF EXISTS trg_projects_org ON projects;
CREATE TRIGGER trg_projects_org BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION set_org_id_from_user();

DROP TRIGGER IF EXISTS trg_user_integrations_org ON user_integrations;
CREATE TRIGGER trg_user_integrations_org BEFORE INSERT ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION set_org_id_from_user();

DROP TRIGGER IF EXISTS trg_api_keys_org ON api_keys;
CREATE TRIGGER trg_api_keys_org BEFORE INSERT ON api_keys
  FOR EACH ROW EXECUTE FUNCTION set_org_id_from_user();
