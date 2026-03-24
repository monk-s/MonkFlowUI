CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('workflow','agent','system','integration','team','appointment')),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  icon VARCHAR(30),
  read BOOLEAN DEFAULT FALSE,
  link_page VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
