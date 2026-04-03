-- Store original message ID for proper email threading (In-Reply-To / References headers)
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS original_message_id VARCHAR(200);
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS original_subject VARCHAR(500);
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS unsubscribe_token UUID DEFAULT gen_random_uuid();
