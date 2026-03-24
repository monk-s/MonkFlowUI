CREATE TABLE contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(300) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
