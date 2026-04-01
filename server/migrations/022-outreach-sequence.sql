-- Outreach leads and automated follow-up sequence tracking
CREATE TABLE IF NOT EXISTS outreach_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name VARCHAR(200) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  company VARCHAR(200),
  notes TEXT,
  status VARCHAR(30) DEFAULT 'active'
    CHECK (status IN ('active','replied','closed','unsubscribed')),
  touch_count INT DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  reply_is_ooo BOOLEAN DEFAULT FALSE,
  gmail_thread_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outreach_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES outreach_leads(id) ON DELETE CASCADE,
  touch_number INT NOT NULL,
  subject VARCHAR(500),
  body TEXT,
  gmail_message_id VARCHAR(100),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outreach_leads_status ON outreach_leads(status);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_next_followup ON outreach_leads(next_followup_at);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_lead ON outreach_emails(lead_id);
