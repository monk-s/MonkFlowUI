-- Plans table
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  price_cents INTEGER NOT NULL,
  monthly_workflow_runs INTEGER NOT NULL,
  monthly_agent_tasks INTEGER NOT NULL,
  allowed_models TEXT[] NOT NULL DEFAULT '{}',
  overage_run_cents INTEGER DEFAULT 50,
  overage_task_cents INTEGER DEFAULT 30,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed tiers
INSERT INTO plans (slug, name, price_cents, monthly_workflow_runs, monthly_agent_tasks, allowed_models, sort_order) VALUES
  ('starter', 'Starter', 2900, 100, 50, ARRAY['claude-sonnet-4-20250514'], 1),
  ('pro', 'Pro', 7900, 500, 250, ARRAY['claude-sonnet-4-20250514','claude-opus-4-20250514'], 2),
  ('business', 'Business', 19900, 2000, 1000, ARRAY['claude-sonnet-4-20250514','claude-opus-4-20250514','gpt-4o'], 3);

-- Add plan + usage tracking to users
ALTER TABLE users ADD COLUMN plan_id UUID REFERENCES plans(id);
ALTER TABLE users ADD COLUMN monthly_workflow_runs INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN monthly_agent_tasks INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN usage_reset_at TIMESTAMPTZ DEFAULT DATE_TRUNC('month', NOW());

-- Default all existing users to pro plan
UPDATE users SET plan_id = (SELECT id FROM plans WHERE slug = 'pro') WHERE plan_id IS NULL;

-- Overage tracking table
CREATE TABLE usage_overages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  overage_workflow_runs INTEGER DEFAULT 0,
  overage_agent_tasks INTEGER DEFAULT 0,
  overage_cost_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_plan ON users(plan_id);
CREATE INDEX idx_usage_overages_user ON usage_overages(user_id);
CREATE INDEX idx_usage_overages_period ON usage_overages(period_start, period_end);
