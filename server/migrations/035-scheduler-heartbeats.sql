-- Scheduler heartbeat table — tracks last successful cron fire per scheduler
CREATE TABLE IF NOT EXISTS scheduler_heartbeats (
  name           TEXT PRIMARY KEY,
  last_run_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_status    TEXT,
  last_detail    JSONB,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
