CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('active','paused','error','draft')),
  trigger_type VARCHAR(30) NOT NULL CHECK (trigger_type IN ('webhook','schedule','event','manual')),
  trigger_config JSONB DEFAULT '{}',
  definition JSONB NOT NULL DEFAULT '{"nodes":[],"connections":[]}',
  webhook_id UUID UNIQUE DEFAULT gen_random_uuid(),
  webhook_secret VARCHAR(64),
  cron_expression VARCHAR(100),
  total_runs INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflows_user ON workflows(user_id);
CREATE INDEX idx_workflows_webhook ON workflows(webhook_id);

CREATE TABLE workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running','completed','failed','retrying')),
  trigger_type VARCHAR(30) NOT NULL,
  trigger_payload JSONB,
  result JSONB,
  error_message TEXT,
  node_results JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

CREATE INDEX idx_wf_exec_workflow ON workflow_executions(workflow_id);
