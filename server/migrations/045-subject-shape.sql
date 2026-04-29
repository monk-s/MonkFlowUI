-- 045-subject-shape.sql
--
-- Subject-line dedup currently runs a regex_replace aggregation across 30
-- days of outreach_emails.subject for every cold-send Claude call. With
-- ~30 sends/day × 30 days = ~900 rows scanned per dedup check × ~30
-- generation calls per cron tick = significant DB time (200-500ms each)
-- serialized inside the email-generation phase.
--
-- Materialize the normalized shape at insert time as a generated column.
-- The shape collapses proper-noun runs (`[A-Z][a-z]+( [A-Z][a-z]+)*`) to
-- `_X_` so "Quick question about Acme" and "Quick question about Beta
-- Industries" both reduce to "quick question about _X_" — the dedup
-- comparison becomes a single equality match against an indexed value.
--
-- The IMMUTABLE SQL function is the single source of truth for the
-- normalization rule. JS callers (leadgen.service.js subjectIsOverused)
-- compute the shape via the same function, so JS and column stay in
-- lockstep across future rule changes.
--
-- Backfill: PostgreSQL automatically populates generated columns on
-- ALTER TABLE ADD COLUMN ... GENERATED ALWAYS ... STORED. No manual
-- backfill script required.

-- 1. Define the normalization function (also called from JS via the same
--    expression in the dedup query — keep IMMUTABLE so it's index-safe).
CREATE OR REPLACE FUNCTION normalize_subject_shape(s TEXT) RETURNS TEXT
  LANGUAGE SQL
  IMMUTABLE
  PARALLEL SAFE
AS $$
  SELECT lower(regexp_replace(
    regexp_replace(COALESCE(s, ''), '[A-Z][a-z]+( [A-Z][a-z]+)*', '_X_', 'g'),
    '\s+', ' ', 'g'
  ));
$$;

-- 2. Add the generated column (Postgres backfills automatically).
ALTER TABLE outreach_emails
  ADD COLUMN IF NOT EXISTS subject_shape TEXT
  GENERATED ALWAYS AS (normalize_subject_shape(subject)) STORED;

-- 3. Index for the T1 dedup lookup (only T1 sends are deduped).
CREATE INDEX IF NOT EXISTS idx_oe_subject_shape_t1
  ON outreach_emails (subject_shape, sent_at)
  WHERE touch_number = 0;
