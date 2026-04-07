CREATE TABLE IF NOT EXISTS client_errors (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  message     TEXT NOT NULL,
  stack       TEXT,
  url         TEXT,
  user_agent  TEXT,
  ip          INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_errors_created_at ON client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_user_id    ON client_errors (user_id);
