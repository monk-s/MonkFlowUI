-- Phase B enrichment columns for LinkedIn outreach.
-- recent_post_snippet: first ~400 chars of the prospect's most recent public post (used as the connect-note hook).
-- profile_picture_url: used as a blank-account quality filter in pickBestOwner and for the admin LinkedIn card.
ALTER TABLE linkedin_leads ADD COLUMN IF NOT EXISTS recent_post_snippet TEXT;
ALTER TABLE linkedin_leads ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
