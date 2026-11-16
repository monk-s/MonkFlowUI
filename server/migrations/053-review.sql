-- Portal v2, phase 3: the review queue.
--
-- * ingest_keys: one key per client pipeline. MonkFlow's own pipelines post
--   extracted documents with it (routes/ingest.routes.js). The portal role
--   has no grant on this table.
-- * documents: the source file, encrypted by the application before it gets
--   here (utils/secretBox.js), with the date its bytes are deleted.
-- * review_items: one extracted document waiting for a person. The extracted
--   fields are one JSON array on the row; reconciliation checks are computed
--   from them on each read (portal/review.js), not stored.
--
-- Clients read all of it and change exactly: field values and the decision.
-- Idempotent: src/index.js re-runs a migration that failed part-way.

CREATE TABLE IF NOT EXISTS ingest_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(20) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ingest_keys_org ON ingest_keys(org_id);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 CHAR(64) NOT NULL,
  -- AES-256-GCM ciphertext. NULL once the retention date has passed.
  content BYTEA,
  purge_after TIMESTAMPTZ NOT NULL,
  purged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(org_id);
CREATE INDEX IF NOT EXISTS idx_documents_purge ON documents(purge_after) WHERE content IS NOT NULL;

CREATE TABLE IF NOT EXISTS review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  template VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  subject VARCHAR(200),
  period VARCHAR(40),
  -- The pipeline's own id for this document, so a retried post is not a duplicate.
  external_ref VARCHAR(200),
  -- [{ id, group, row, key, label, type, value, original, confidence, page, editedByName, editedAt }]
  fields JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'approved', 'rejected')),
  -- Not a foreign key: the record of who decided must outlive the login.
  decided_by UUID,
  decided_by_name VARCHAR(255),
  decided_at TIMESTAMPTZ,
  -- Why it was rejected, or why it was approved over a failing check.
  decision_reason TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_review_items_org ON review_items(org_id, status, received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_items_ref ON review_items(org_id, external_ref) WHERE external_ref IS NOT NULL;

GRANT SELECT ON documents TO monkflow_portal;
GRANT SELECT ON review_items TO monkflow_portal;
GRANT UPDATE (fields, status, decided_by, decided_by_name, decided_at, decision_reason, updated_at) ON review_items TO monkflow_portal;

ALTER TABLE ingest_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_org ON documents;
CREATE POLICY portal_org ON documents FOR ALL TO monkflow_portal
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());

DROP POLICY IF EXISTS portal_org ON review_items;
CREATE POLICY portal_org ON review_items FOR ALL TO monkflow_portal
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
