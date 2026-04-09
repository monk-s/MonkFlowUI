-- LinkedIn outreach pipeline (Phase 3 of MonkFlow lead-gen).
-- Mirrors the cold-email leads schema but tracks Unipile-driven LinkedIn
-- connection requests + first DMs. Replies + accepts come in via webhook.
CREATE TABLE IF NOT EXISTS linkedin_leads (
  id BIGSERIAL PRIMARY KEY,
  source_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  business_name TEXT NOT NULL,
  business_website TEXT,
  business_city TEXT,
  business_state TEXT,
  business_type TEXT,
  contact_name TEXT,
  contact_first_name TEXT,
  contact_title TEXT,
  linkedin_url TEXT NOT NULL UNIQUE,
  linkedin_provider_id TEXT,
  about_snippet TEXT,
  last_activity_at TIMESTAMPTZ,
  diagnosis_json JSONB,
  score INT DEFAULT 0,
  status TEXT DEFAULT 'discovered',
  -- discovered → enriched → personalized → connect_sent → connected → dm_sent → replied → closed
  connect_note TEXT,
  first_dm TEXT,
  connect_sent_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  dm_sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  reply_body TEXT,
  reply_sentiment TEXT,
  last_touch_at TIMESTAMPTZ,
  touch_count INT DEFAULT 0,
  unipile_chat_id TEXT,
  unipile_invite_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_li_status ON linkedin_leads (status);
CREATE INDEX IF NOT EXISTS idx_li_created ON linkedin_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_li_chat ON linkedin_leads (unipile_chat_id);
CREATE INDEX IF NOT EXISTS idx_li_provider ON linkedin_leads (linkedin_provider_id);

CREATE TABLE IF NOT EXISTS linkedin_daily_limits (
  date DATE PRIMARY KEY,
  connects_sent INT DEFAULT 0,
  dms_sent INT DEFAULT 0,
  replies_received INT DEFAULT 0,
  accepts_received INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
