CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  company VARCHAR(200),
  timezone VARCHAR(50) DEFAULT 'America/Los_Angeles',
  avatar_url TEXT,
  role VARCHAR(20) DEFAULT 'owner' CHECK (role IN ('owner','admin','editor','viewer')),
  email_verified BOOLEAN DEFAULT FALSE,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMPTZ,
  notification_prefs JSONB DEFAULT '{"email_workflow_failures": true, "email_appointments": true, "email_team_updates": true, "push_enabled": true}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
