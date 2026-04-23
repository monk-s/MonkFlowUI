-- 044-daily-bible-study.sql
-- Table for the daily Bible study email digest feature.
--
-- One row per day. `study_date UNIQUE` is the idempotency guard — if the
-- scheduler fires twice on the same day (Railway restart mid-cron), the
-- second insert throws 23505 (unique_violation) which the service catches
-- and swallows. No duplicate emails.
--
-- `analysis` stores Claude's structured JSON output (title, summary, context,
-- words, cross_references, commentary, application, prayer) so we can
-- re-render or inspect later without re-prompting.
--
-- `email_sent_at` + `email_id` let the service distinguish "study generated
-- but email failed to send" from "fully delivered" — we can replay the
-- email step without regenerating the study.

CREATE TABLE IF NOT EXISTS daily_studies (
  id                SERIAL PRIMARY KEY,
  study_date        DATE NOT NULL UNIQUE,
  verse_reference   TEXT NOT NULL,
  verse_text        TEXT NOT NULL,
  analysis          JSONB NOT NULL,
  email_sent_at     TIMESTAMPTZ,
  email_id          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_studies_date ON daily_studies (study_date DESC);
