-- Lead generation tracking table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name VARCHAR(300) NOT NULL,
  business_type VARCHAR(50),
  city VARCHAR(100),
  state VARCHAR(10),
  website_url TEXT,
  facebook_url TEXT,
  email VARCHAR(255),
  phone VARCHAR(50),
  has_ssl BOOLEAN,
  has_booking_software BOOLEAN,
  booking_software_name VARCHAR(100),
  has_client_portal BOOLEAN,
  has_intake_forms BOOLEAN,
  design_age_estimate VARCHAR(50),
  diagnosis_json JSONB DEFAULT '{}',
  outreach_subject VARCHAR(500),
  outreach_body TEXT,
  sent_at TIMESTAMPTZ,
  resend_email_id VARCHAR(100),
  status VARCHAR(30) DEFAULT 'discovered'
    CHECK (status IN ('discovered','diagnosed','email_generated','sent','replied','converted','bounced','unsubscribed')),
  priority VARCHAR(20) DEFAULT 'MEDIUM',
  batch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  search_query TEXT,
  unsubscribe_token UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE leads ADD CONSTRAINT leads_email_unique UNIQUE (email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_batch_date ON leads(batch_date);
CREATE INDEX IF NOT EXISTS idx_leads_unsubscribe ON leads(unsubscribe_token);
