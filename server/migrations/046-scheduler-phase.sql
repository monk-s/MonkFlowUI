-- 046-scheduler-phase.sql
--
-- Adds last_phase + last_phase_started_at to scheduler_heartbeats so a
-- failed cron run shows WHICH phase died, not just "timeout after 55min."
--
-- The leadgen pipeline already tracks `currentPhase` in-process (see
-- runDailyLeadGeneration in leadgen.service.js), but if the run hard-crashes
-- or hits the global watchdog, that in-memory state is lost. Persisting
-- the last phase enter via UPDATE on each `startPhase()` call gives us
-- post-mortem visibility.
--
-- NULL is fine for non-leadgen heartbeats (billing, biblestudy, outreach,
-- etc.) — they don't have phases.

ALTER TABLE scheduler_heartbeats
  ADD COLUMN IF NOT EXISTS last_phase TEXT,
  ADD COLUMN IF NOT EXISTS last_phase_started_at TIMESTAMPTZ;
