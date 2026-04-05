-- Sender health tracking for deliverability monitoring
CREATE TABLE IF NOT EXISTS sender_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_count INT DEFAULT 0,
  bounce_count INT DEFAULT 0,
  complaint_count INT DEFAULT 0,
  UNIQUE(sender_email, date)
);

CREATE INDEX IF NOT EXISTS idx_sender_health_email_date ON sender_health(sender_email, date DESC);
