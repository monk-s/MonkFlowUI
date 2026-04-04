-- Performance indexes for common query patterns

-- Workflow executions: frequently queried by user and status
CREATE INDEX IF NOT EXISTS idx_workflow_executions_user_id ON workflow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at ON workflow_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);

-- Agent executions
CREATE INDEX IF NOT EXISTS idx_agent_executions_user_id ON agent_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_id ON agent_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_created_at ON agent_executions(created_at DESC);

-- Notifications: queried by user, filtered by read status
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);

-- Outreach leads: queried by user and status
CREATE INDEX IF NOT EXISTS idx_outreach_leads_user_id ON outreach_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_status ON outreach_leads(status);

-- Team members: queried by owner
CREATE INDEX IF NOT EXISTS idx_team_members_owner ON team_members(team_owner_id);

-- Invoices: queried by user
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- Workflows: queried by user
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);

-- Agents: queried by user
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
