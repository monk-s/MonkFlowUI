-- Reply detection & auto-classification columns
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS reply_sentiment TEXT; -- 'positive', 'negative', 'neutral', 'ooo'
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS reply_summary TEXT;

ALTER TABLE outreach_emails ADD COLUMN IF NOT EXISTS reply_body TEXT;
ALTER TABLE outreach_emails ADD COLUMN IF NOT EXISTS reply_received_at TIMESTAMPTZ;
ALTER TABLE outreach_emails ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
