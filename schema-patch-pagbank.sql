-- PagBank payment integration: orders table
-- Run with: node scripts/run-sql.js schema-patch-pagbank.sql

CREATE TABLE IF NOT EXISTS orders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id),
  cohort_id       INTEGER     NOT NULL REFERENCES cohorts(id),
  pagbank_charge_id TEXT      UNIQUE,
  amount_cents    INTEGER     NOT NULL,
  currency        TEXT        NOT NULL DEFAULT 'BRL',
  payment_method  TEXT        NOT NULL CHECK (payment_method IN ('pix', 'credit_card')),
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'paid', 'cancelled', 'declined', 'refunded')),

  -- Pix fields
  pix_qr_text     TEXT,
  pix_qr_image_url TEXT,
  pix_expires_at  TIMESTAMPTZ,

  -- Credit card fields
  cc_installments INTEGER,
  cc_brand        TEXT,

  -- Raw PagBank charge response for debugging / refunds
  pagbank_response JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_orders_updated_at();

-- RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
CREATE POLICY "users_select_own_orders" ON orders
  FOR SELECT USING (user_id = auth.uid());

-- super_admin and billing_admin can view all orders
CREATE POLICY "admins_select_all_orders" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'billing_admin')
    )
  );

-- billing_admin can update orders (refunds, manual status fixes)
CREATE POLICY "billing_admin_update_orders" ON orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'billing_admin')
    )
  );

-- No client-side inserts; API routes use service role key
-- Index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_orders_pagbank_charge_id ON orders(pagbank_charge_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
