-- Append-only scheduler run log — scheduler_heartbeats (035) overwrites per
-- scheduler name, so the most recent hourly outreach tick (sent=0) clobbers
-- the earlier tick that actually sent 99 follow-ups.  This table keeps every
-- run so monitoring and the admin analytics page can show a full picture.
CREATE TABLE IF NOT EXISTS scheduler_runs (
  id             SERIAL PRIMARY KEY,
  scheduler_name TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'started',   -- started | success | failed
  detail         JSONB,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_name_date
  ON scheduler_runs (scheduler_name, created_at DESC);
