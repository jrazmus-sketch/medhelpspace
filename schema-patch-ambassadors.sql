-- Programa de Embaixadores — pilot schema.
--
-- Clause numbers below refer to Contrato_Programa_Embaixadores_MedHelpSpace
-- (versão final 15/08/2026). Where the contract fixes a rule, the rule lives in
-- the DB rather than in app code, so no route can disagree with the contract.
--
-- Tables:
--   ambassadors        — one row per contracted ambassador
--   ambassador_clicks  — referral-link clicks (30-day attribution window, cl. 3.1)
--   commissions        — the ledger: one row per attributed sale, plus debit rows
--   payouts            — one monthly repasse per ambassador (cl. 7.5)
--
-- `orders` gains three attribution columns. A trigger on orders.status creates and
-- cancels commissions, so every path that settles a payment — webhook, Pix status
-- poll, reconcile-pix cron, and the 100%-off short-circuit — is covered by one
-- rule instead of four call sites that can drift apart.
--
-- Run with: node scripts/run-sql.js schema-patch-ambassadors.sql

-- ── Ambassadors ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ambassadors (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The ?ref= code. Separate from the coupon code: the link and the coupon are
  -- two distinct instruments under cl. 3.1 and can be revoked independently.
  code                TEXT NOT NULL,
  coupon_id           BIGINT REFERENCES coupons(id),

  -- Only the embaixador-aluno receives free course access (cl. 2.2). Every other
  -- profile is commercially identical, so one flag covers the contract's split.
  profile_type        TEXT NOT NULL DEFAULT 'embaixador'
                      CHECK (profile_type IN ('embaixador', 'embaixador_aluno')),

  -- "Turma de acesso" (cl. 1.4) — which cohort grants the free access. NULL for
  -- non-student ambassadors ("NÃO SE APLICA"). Selling scope is every pilot
  -- cohort regardless of this value; this column governs access only.
  access_cohort_id    INTEGER REFERENCES cohorts(id),

  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'active', 'terminated')),
  activated_at        TIMESTAMPTZ,
  terminated_at       TIMESTAMPTZ,
  -- Termination for cause forfeits nothing already earned (cl. 6, final bullet):
  -- only fraudulent or irregular SALES lose their commission. This flag drives
  -- immediate access revocation (cl. 12.6), never a commission clawback.
  terminated_for_cause BOOLEAN NOT NULL DEFAULT false,
  termination_reason  TEXT,

  -- Commissions are only generated while the contract is in force on the date of
  -- sale (cl. 4.4). NULL = open-ended until terminated.
  contract_starts_on  DATE,
  contract_ends_on    DATE,

  -- Stamped onto each commission at creation so a later rate change never moves
  -- historical rows (cl. 13.1). 1000 bps = 10%.
  commission_rate_bps INTEGER NOT NULL DEFAULT 1000
                      CHECK (commission_rate_bps BETWEEN 0 AND 10000),

  -- Fiscal identity for the repasse (cl. 7.1). The NFS-e must be issued by this
  -- same holder (cl. 7.5), so it is recorded here rather than free-text per payout.
  cnpj                TEXT,
  razao_social        TEXT,
  pix_key             TEXT,
  bank_details        TEXT,

  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ambassadors_code_upper_uniq
  ON ambassadors (UPPER(code));

CREATE INDEX IF NOT EXISTS ambassadors_status_idx ON ambassadors (status);

CREATE OR REPLACE FUNCTION update_ambassadors_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ambassadors_updated_at ON ambassadors;
CREATE TRIGGER ambassadors_updated_at
  BEFORE UPDATE ON ambassadors
  FOR EACH ROW EXECUTE FUNCTION update_ambassadors_updated_at();

-- ── Referral clicks ─────────────────────────────────────────────────────────
-- One row per ?ref= landing. The cookie is what actually carries attribution to
-- checkout; this table exists so the panel can show "cliques no link" (cl. 8.1)
-- and so a disputed attribution has a record to inspect (cl. 8.3).

CREATE TABLE IF NOT EXISTS ambassador_clicks (
  id            BIGSERIAL PRIMARY KEY,
  ambassador_id BIGINT NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  clicked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  landing_path  TEXT,
  referer       TEXT,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS ambassador_clicks_ambassador_idx
  ON ambassador_clicks (ambassador_id, clicked_at DESC);

-- ── Payouts ─────────────────────────────────────────────────────────────────
-- Created before commissions so commissions.payout_id can reference it.
--
-- The monthly cycle (cl. 7.5): closing covers commissions released through the
-- last day of the prior month; statement by the 2nd business day; NFS-e by the
-- 5th; payment by the 15th. In the first cycle the note arrives by e-mail and an
-- admin records it here (cl. 7.4) — nf_url and the status ladder are already in
-- place so self-service withdrawal later is a form, not a migration.

CREATE TABLE IF NOT EXISTS payouts (
  id               BIGSERIAL PRIMARY KEY,
  ambassador_id    BIGINT NOT NULL REFERENCES ambassadors(id) ON DELETE RESTRICT,

  -- Competência: first day of the month being settled.
  reference_month  DATE NOT NULL,
  total_cents      INTEGER NOT NULL DEFAULT 0,

  status           TEXT NOT NULL DEFAULT 'aberto'
                   CHECK (status IN ('aberto', 'em_analise', 'paga', 'rejeitada')),

  nf_url           TEXT,
  nf_number        TEXT,
  nf_received_at   TIMESTAMPTZ,
  rejection_reason TEXT,
  paid_at          TIMESTAMPTZ,

  -- Final settlement at contract close pays even below the R$200 minimum (cl. 7.3).
  is_final_settlement BOOLEAN NOT NULL DEFAULT false,

  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payouts_ambassador_month_uniq
  ON payouts (ambassador_id, reference_month);

CREATE OR REPLACE FUNCTION update_payouts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payouts_updated_at ON payouts;
CREATE TRIGGER payouts_updated_at
  BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION update_payouts_updated_at();

-- ── Commissions ledger ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commissions (
  id             BIGSERIAL PRIMARY KEY,
  ambassador_id  BIGINT NOT NULL REFERENCES ambassadors(id) ON DELETE RESTRICT,

  -- NULL only for manual adjustment rows (a chargeback landing after the payout,
  -- cl. 6, third bullet). Sale rows always carry their order.
  order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL DEFAULT 'sale'
                 CHECK (kind IN ('sale', 'adjustment')),

  -- The contract's five statuses, verbatim (cl. 5.3).
  status         TEXT NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente', 'liberada', 'em_analise', 'paga', 'cancelada')),

  -- Contractual base (cl. 4): amount actually paid after every discount, with
  -- installment interest excluded and payment fees NOT deducted. On an order that
  -- is base_amount_cents - discount_cents (identically amount_cents - interest_cents).
  base_amount_cents INTEGER NOT NULL,
  rate_bps       INTEGER NOT NULL,
  -- Negative on adjustment rows; the ledger sums to the balance.
  amount_cents   INTEGER NOT NULL,

  attribution_source TEXT CHECK (attribution_source IN ('coupon', 'link')),

  -- Payment confirmation starts the 30-day clock (cl. 5.1). release_on is the
  -- "data prevista de liberação" the panel must show (cl. 5.3, 8.1).
  confirmed_at   TIMESTAMPTZ,
  release_on     DATE,
  released_at    TIMESTAMPTZ,

  cancelled_at   TIMESTAMPTZ,
  cancel_reason  TEXT,

  payout_id      BIGINT REFERENCES payouts(id) ON DELETE SET NULL,

  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One sale commission per order. Adjustment rows are exempt so a chargeback can
-- reference the same order without colliding.
CREATE UNIQUE INDEX IF NOT EXISTS commissions_order_sale_uniq
  ON commissions (order_id) WHERE kind = 'sale' AND order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS commissions_ambassador_idx
  ON commissions (ambassador_id, status);
CREATE INDEX IF NOT EXISTS commissions_release_idx
  ON commissions (release_on) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS commissions_payout_idx
  ON commissions (payout_id) WHERE payout_id IS NOT NULL;

-- ── Order attribution ───────────────────────────────────────────────────────
-- Attribution is written at checkout and frozen there (cl. 3.1, final bullets):
-- recorded on the ORDER, not on the user, because guest checkout means the buyer
-- often has no account until after the purchase.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ambassador_id BIGINT REFERENCES ambassadors(id),
  ADD COLUMN IF NOT EXISTS ambassador_attribution_source TEXT,
  ADD COLUMN IF NOT EXISTS ambassador_attributed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_ambassador_source_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_ambassador_source_check
      CHECK (ambassador_attribution_source IS NULL
             OR ambassador_attribution_source IN ('coupon', 'link'))
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_ambassador_idx
  ON orders (ambassador_id) WHERE ambassador_id IS NOT NULL;

-- ── Commission generation trigger ───────────────────────────────────────────
-- Fires on every orders.status transition, so all four settlement paths are
-- covered by one rule.
--
-- The whole body is wrapped in an exception handler on purpose. This trigger runs
-- inside the same transaction as finalizePaidOrder's status flip; an error raised
-- here would roll that flip back and leave a buyer who has paid — and whose
-- membership was already granted — stuck on a 'pending' order. A commission bug
-- must never be able to break a payment, so failures degrade to a WARNING and the
-- row can be reconciled by hand.

CREATE OR REPLACE FUNCTION handle_order_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amb            ambassadors%ROWTYPE;
  v_base_cents     INTEGER;
  v_sale_date      DATE;
  v_existing       commissions%ROWTYPE;
  v_old_status     TEXT;
BEGIN
  IF NEW.ambassador_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Every settlement path today flips an existing 'pending' row, but referencing
  -- OLD in an INSERT context is a runtime error, so resolve it via TG_OP rather
  -- than trusting that to stay true.
  v_old_status := CASE WHEN TG_OP = 'INSERT' THEN '' ELSE COALESCE(OLD.status, '') END;

  SELECT * INTO v_amb FROM ambassadors WHERE id = NEW.ambassador_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- ── Sale settles → create the pending commission ──────────────────────────
  IF NEW.status = 'paid' AND v_old_status <> 'paid' THEN

    -- Self-purchase, direct or indirect, never generates commission (cl. 3.1).
    IF NEW.user_id = v_amb.user_id THEN
      RETURN NEW;
    END IF;

    -- The contract must be in force on the DATE OF SALE (cl. 4.4). Checking here
    -- rather than at payout means a later termination cannot retroactively void a
    -- commission that was valid when it was earned (cl. 5.4).
    v_sale_date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    IF v_amb.status <> 'active'
       OR (v_amb.contract_starts_on IS NOT NULL AND v_sale_date < v_amb.contract_starts_on)
       OR (v_amb.contract_ends_on   IS NOT NULL AND v_sale_date > v_amb.contract_ends_on) THEN
      RETURN NEW;
    END IF;

    -- Base excludes installment interest and is taken after every discount.
    v_base_cents := GREATEST(
      COALESCE(NEW.base_amount_cents, NEW.amount_cents) - COALESCE(NEW.discount_cents, 0),
      0
    );

    -- Dates are Brazil-local. Vercel runs UTC and after 21:00 BRT the server is
    -- already on tomorrow, which would shift every release date by a day.
    INSERT INTO commissions (
      ambassador_id, order_id, kind, status,
      base_amount_cents, rate_bps, amount_cents,
      attribution_source, confirmed_at, release_on
    )
    VALUES (
      v_amb.id, NEW.id, 'sale', 'pendente',
      v_base_cents,
      v_amb.commission_rate_bps,
      ROUND(v_base_cents * v_amb.commission_rate_bps / 10000.0),
      NEW.ambassador_attribution_source,
      now(),
      v_sale_date + 30
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
  END IF;

  -- ── Refund / cancellation (cl. 6) ─────────────────────────────────────────
  IF NEW.status IN ('refunded', 'cancelled') AND v_old_status NOT IN ('refunded', 'cancelled') THEN
    SELECT * INTO v_existing
    FROM commissions
    WHERE order_id = NEW.id AND kind = 'sale';

    IF FOUND THEN
      IF v_existing.status = 'paga' THEN
        -- Already paid out: post a debit instead of rewriting history. It offsets
        -- future commissions; if none ever arrive the loss is ours, since direct
        -- recovery is limited to fraud (cl. 6, fourth bullet).
        INSERT INTO commissions (
          ambassador_id, order_id, kind, status,
          base_amount_cents, rate_bps, amount_cents,
          confirmed_at, release_on, released_at, notes
        )
        VALUES (
          v_existing.ambassador_id, NEW.id, 'adjustment', 'liberada',
          0, v_existing.rate_bps, -v_existing.amount_cents,
          now(), (now() AT TIME ZONE 'America/Sao_Paulo')::date, now(),
          'Estorno posterior ao pagamento do repasse (cl. 6)'
        );
      ELSE
        UPDATE commissions
        SET status = 'cancelada',
            cancelled_at = now(),
            cancel_reason = 'Pedido ' || NEW.status
        WHERE id = v_existing.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_order_commission failed for order % : %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_commission_trigger ON orders;
CREATE TRIGGER orders_commission_trigger
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION handle_order_commission();

-- ── current_ambassador_id() ─────────────────────────────────────────────────
-- Mirrors current_user_role(): SECURITY DEFINER so RLS policies on ambassadors
-- can resolve the caller's own row without re-entering the policy they are
-- evaluating. Must stay executable by `authenticated` — it runs inside policies.

CREATE OR REPLACE FUNCTION current_ambassador_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM ambassadors WHERE user_id = auth.uid();
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- The panel is read-only in the first cycle (cl. 7.4, 8.1) and each ambassador
-- sees exclusively their own data. No ambassador-facing write policy exists.

ALTER TABLE ambassadors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ambassador_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ambassadors_select_own ON ambassadors;
CREATE POLICY ambassadors_select_own ON ambassadors
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS ambassadors_admin_all ON ambassadors;
CREATE POLICY ambassadors_admin_all ON ambassadors
  FOR ALL TO authenticated
  USING (current_user_role() IN ('super_admin', 'billing_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'billing_admin'));

DROP POLICY IF EXISTS ambassador_clicks_select_own ON ambassador_clicks;
CREATE POLICY ambassador_clicks_select_own ON ambassador_clicks
  FOR SELECT TO authenticated USING (ambassador_id = current_ambassador_id());

DROP POLICY IF EXISTS ambassador_clicks_admin_all ON ambassador_clicks;
CREATE POLICY ambassador_clicks_admin_all ON ambassador_clicks
  FOR ALL TO authenticated
  USING (current_user_role() IN ('super_admin', 'billing_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'billing_admin'));

DROP POLICY IF EXISTS commissions_select_own ON commissions;
CREATE POLICY commissions_select_own ON commissions
  FOR SELECT TO authenticated USING (ambassador_id = current_ambassador_id());

DROP POLICY IF EXISTS commissions_admin_all ON commissions;
CREATE POLICY commissions_admin_all ON commissions
  FOR ALL TO authenticated
  USING (current_user_role() IN ('super_admin', 'billing_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'billing_admin'));

DROP POLICY IF EXISTS payouts_select_own ON payouts;
CREATE POLICY payouts_select_own ON payouts
  FOR SELECT TO authenticated USING (ambassador_id = current_ambassador_id());

DROP POLICY IF EXISTS payouts_admin_all ON payouts;
CREATE POLICY payouts_admin_all ON payouts
  FOR ALL TO authenticated
  USING (current_user_role() IN ('super_admin', 'billing_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'billing_admin'));

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS orders_commission_trigger ON orders;
-- DROP FUNCTION IF EXISTS handle_order_commission();
-- DROP FUNCTION IF EXISTS current_ambassador_id();
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_ambassador_source_check;
-- ALTER TABLE orders DROP COLUMN IF EXISTS ambassador_attributed_at;
-- ALTER TABLE orders DROP COLUMN IF EXISTS ambassador_attribution_source;
-- ALTER TABLE orders DROP COLUMN IF EXISTS ambassador_id;
-- DROP TABLE IF EXISTS commissions;
-- DROP TABLE IF EXISTS payouts;
-- DROP TABLE IF EXISTS ambassador_clicks;
-- DROP TRIGGER IF EXISTS ambassadors_updated_at ON ambassadors;
-- DROP FUNCTION IF EXISTS update_ambassadors_updated_at();
-- DROP FUNCTION IF EXISTS update_payouts_updated_at();
-- DROP TABLE IF EXISTS ambassadors;
