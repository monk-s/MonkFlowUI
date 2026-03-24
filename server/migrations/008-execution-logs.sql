CREATE TABLE execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workflow_execution_id UUID REFERENCES workflow_executions(id) ON DELETE SET NULL,
  agent_execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL,
  level VARCHAR(10) NOT NULL CHECK (level IN ('debug','info','warn','error')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exec_logs_user ON execution_logs(user_id);
CREATE INDEX idx_exec_logs_created ON execution_logs(created_at DESC);
CREATE INDEX idx_exec_logs_level ON execution_logs(user_id, level);
