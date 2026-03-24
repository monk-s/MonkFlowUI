CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(200),
  role VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('admin','editor','viewer')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','active','paused')),
  invite_token VARCHAR(255),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  UNIQUE(team_owner_id, email)
);
