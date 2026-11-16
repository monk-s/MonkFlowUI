-- Portal v2, phase 2: engagement tracker, action items, and the read-only
-- window the portal gets onto workflows and their runs.
--
-- * engagements / milestones / action_items are new tables with row-level
--   security from the start, like the tables in 051.
-- * workflows, workflow_executions and execution_logs are legacy tables the
--   schedulers and the staff console write to. The portal role gets NO grant
--   on them. It reads three views that run with the owner's rights and filter
--   by app.org_id themselves (same pattern as org_members in 051), and that
--   leave out everything a client has no business seeing: definitions,
--   webhook secrets, trigger payloads, results, debug logs, drafts.
-- * "Hours saved" needs a baseline agreed with the client. It lives on the
--   workflow with the sentence that states its basis; without one the portal
--   shows no hours figure at all.
--
-- Idempotent: src/index.js re-runs a migration that failed part-way.

CREATE TABLE IF NOT EXISTS engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  summary TEXT,
  -- discovery    = Discovery and audit
  -- architecture = Architecture and sandbox
  -- integration  = Integration and QA
  -- production   = Production and scale
  stage VARCHAR(20) NOT NULL DEFAULT 'discovery'
    CHECK (stage IN ('discovery', 'architecture', 'integration', 'production')),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_hold', 'complete')),
  next_deliverable VARCHAR(300),
  next_deliverable_due DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engagements_org ON engagements(org_id);

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  stage VARCHAR(20) NOT NULL
    CHECK (stage IN ('discovery', 'architecture', 'integration', 'production')),
  title VARCHAR(200) NOT NULL,
  detail TEXT,
  due_on DATE,
  -- awaiting_signoff: MonkFlow says it is ready; a workspace admin signs off.
  status VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'awaiting_signoff', 'complete')),
  position INTEGER NOT NULL DEFAULT 0,
  -- Not foreign keys: the record of who signed must outlive the login.
  signed_off_by UUID,
  signed_off_by_name VARCHAR(255),
  signed_off_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_milestones_engagement ON milestones(engagement_id, position);
CREATE INDEX IF NOT EXISTS idx_milestones_org ON milestones(org_id);

-- Things MonkFlow is waiting on the client for that are not a milestone
-- sign-off: run a UAT pass, send credentials, send sample documents.
CREATE TABLE IF NOT EXISTS action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'other'
    CHECK (kind IN ('uat', 'credentials', 'documents', 'other')),
  title VARCHAR(200) NOT NULL,
  detail TEXT,
  due_on DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'done', 'withdrawn')),
  completed_by UUID,
  completed_by_name VARCHAR(255),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_items_org ON action_items(org_id, status);

-- ── Baseline for "hours saved" ───────────────────────────────
-- Minutes of a person's time one completed run replaces, as agreed with the
-- client; the sentence saying where the number came from; and the first day
-- it applies to.
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS baseline_minutes_per_run NUMERIC(8, 2)
  CHECK (baseline_minutes_per_run IS NULL OR (baseline_minutes_per_run > 0 AND baseline_minutes_per_run <= 6000));
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS baseline_basis VARCHAR(300);
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS baseline_from DATE;

-- Telemetry reads runs by workflow and time.
CREATE INDEX IF NOT EXISTS idx_wf_exec_workflow_started ON workflow_executions(workflow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_logs_wf_exec ON execution_logs(workflow_execution_id);

-- ── What the portal may read of workflows ────────────────────
CREATE OR REPLACE VIEW org_workflows AS
  SELECT w.id,
         w.org_id,
         w.name,
         w.description,
         w.status,
         w.trigger_type,
         w.last_run_at,
         w.created_at,
         w.baseline_minutes_per_run,
         w.baseline_basis,
         w.baseline_from
    FROM workflows w
   WHERE w.org_id = app_org_id()
     AND w.status <> 'draft';

CREATE OR REPLACE VIEW org_workflow_runs AS
  SELECT e.id,
         e.workflow_id,
         e.status,
         e.trigger_type,
         left(e.error_message, 500) AS error_message,
         e.started_at,
         e.completed_at,
         e.duration_ms
    FROM workflow_executions e
    JOIN workflows w ON w.id = e.workflow_id
   WHERE w.org_id = app_org_id()
     AND w.status <> 'draft';

CREATE OR REPLACE VIEW org_run_logs AS
  SELECT l.id,
         l.workflow_execution_id AS run_id,
         l.level,
         left(l.message, 1000) AS message,
         l.created_at
    FROM execution_logs l
    JOIN workflow_executions e ON e.id = l.workflow_execution_id
    JOIN workflows w ON w.id = e.workflow_id
   WHERE w.org_id = app_org_id()
     AND w.status <> 'draft'
     AND l.level <> 'debug';

-- ── Grants and policies for the portal role ──────────────────
-- Clients read the tracker and change exactly two things: a milestone's
-- sign-off and an action item's completion. Creating, editing and deleting
-- are MonkFlow's, through the staff console, so the portal role can update
-- only the columns those two actions touch.
GRANT SELECT ON engagements TO monkflow_portal;
GRANT SELECT ON milestones TO monkflow_portal;
GRANT UPDATE (status, signed_off_by, signed_off_by_name, signed_off_at, updated_at) ON milestones TO monkflow_portal;
GRANT SELECT ON action_items TO monkflow_portal;
GRANT UPDATE (status, completed_by, completed_by_name, completed_at, updated_at) ON action_items TO monkflow_portal;
GRANT SELECT ON org_workflows, org_workflow_runs, org_run_logs TO monkflow_portal;

ALTER TABLE engagements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_org ON engagements;
CREATE POLICY portal_org ON engagements FOR ALL TO monkflow_portal
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());

DROP POLICY IF EXISTS portal_org ON milestones;
CREATE POLICY portal_org ON milestones FOR ALL TO monkflow_portal
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());

DROP POLICY IF EXISTS portal_org ON action_items;
CREATE POLICY portal_org ON action_items FOR ALL TO monkflow_portal
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
