-- QuickBooks OAuth connections
CREATE TABLE qbo_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  realm_id VARCHAR(100) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  company_name VARCHAR(255),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_qbo_conn_user ON qbo_connections(user_id);

-- Customer mapping: MonkFlow user -> QBO customer
CREATE TABLE qbo_customer_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qbo_customer_id VARCHAR(100) NOT NULL,
  qbo_customer_name VARCHAR(255),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_qbo_cust_user ON qbo_customer_map(user_id);

-- Invoice records
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qbo_invoice_id VARCHAR(100),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  plan_slug VARCHAR(30),
  plan_amount_cents INTEGER DEFAULT 0,
  overage_amount_cents INTEGER DEFAULT 0,
  total_amount_cents INTEGER DEFAULT 0,
  line_items JSONB DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','void')),
  qbo_synced BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_invoices_user ON invoices(user_id);
CREATE INDEX idx_invoices_status ON invoices(status);
