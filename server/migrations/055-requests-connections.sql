-- Portal phase 4: client requests and integration status.

-- ── Requests from the client to MonkFlow ─────────────────────
-- action_items already holds what MonkFlow asks of the client. A row with
-- origin = 'client' is the other direction: the client asks, MonkFlow closes
-- it with a reply.
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS origin VARCHAR(10) NOT NULL DEFAULT 'monkflow'
  CHECK (origin IN ('monkflow', 'client'));
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS requested_by UUID;              -- not a foreign key: outlives the login
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS requested_by_name VARCHAR(255);
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS reply TEXT;                     -- MonkFlow's answer when it closes the request

-- The portal role may add a row; row-level security pins it to its own workspace.
GRANT INSERT (org_id, kind, title, detail, origin, requested_by, requested_by_name) ON action_items TO monkflow_portal;

-- ── Integration status ───────────────────────────────────────
-- The systems MonkFlow connects for a workspace. Status only: credentials are
-- never stored here and clients cannot write to this table.
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  system VARCHAR(100) NOT NULL,
  -- planned = agreed, not connected yet; attention = working, needs a look
  status VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'healthy', 'attention', 'down')),
  note VARCHAR(500),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_connections_org ON connections(org_id);

GRANT SELECT ON connections TO monkflow_portal;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portal_org ON connections;
CREATE POLICY portal_org ON connections FOR ALL TO monkflow_portal
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());

-- ...and only as a request of its own: it cannot forge one "from MonkFlow".
DROP POLICY IF EXISTS portal_insert_client ON action_items;
CREATE POLICY portal_insert_client ON action_items AS RESTRICTIVE FOR INSERT TO monkflow_portal
  WITH CHECK (origin = 'client');
