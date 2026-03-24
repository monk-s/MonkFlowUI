CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  icon VARCHAR(10),
  agent_type VARCHAR(30) NOT NULL CHECK (agent_type IN ('text_generation','classification','analysis','custom')),
  model VARCHAR(50) DEFAULT 'claude-sonnet-4-20250514',
  system_prompt TEXT,
  temperature DECIMAL(3,2) DEFAULT 0.3,
  max_tokens INTEGER DEFAULT 4096,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','paused','error')),
  total_tasks INTEGER DEFAULT 0,
  accuracy_score DECIMAL(5,2) DEFAULT 0,
  total_tokens_used BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agents_user ON agents(user_id);

CREATE TABLE agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  input_data JSONB NOT NULL,
  output_data JSONB,
  status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

CREATE INDEX idx_agent_exec_agent ON agent_executions(agent_id);
