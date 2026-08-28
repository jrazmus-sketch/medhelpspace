-- Programa de Embaixadores — alignment pass against the contract.
--
-- Clause numbers refer to Contrato_Programa_Embaixadores_MedHelpSpace
-- (VERSÃO FINAL 15/08/2026), the same document schema-patch-ambassadors.sql
-- was built against.
--
-- Three gaps this closes, all raised by Karina on 2026-08-28:
--
--   1. cl. 12.6 was carried by a single `terminated_for_cause` boolean. The
--      clause is not a boolean: whether an embaixador-aluno keeps course access
--      depends on HOW the contract ended and WHEN, and immediate termination is
--      limited to four enumerated grounds tied to use of the course. A blunt
--      flag can revoke access the contract says must be kept.
--
--   2. The 90-days-or-first-sale test in 12.6 needs the date of the first valid
--      attributed sale, which was never recorded.
--
--   3. cl. 4.4 vigência ends 30 days after the linked cohort's official exam
--      date. That was hand-typed per ambassador and could silently disagree with
--      the cohort.
--
-- Rules live in the DB rather than in route code, so no screen can disagree with
-- the contract. Safe to run more than once.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-ambassador-contract-alignment.sql
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-ambassador-contract-alignment.sql
--   (then NOTIFY pgrst, 'reload schema'; on local)

-- ── How the contract ended ──────────────────────────────────────────────────

ALTER TABLE ambassadors
  ADD COLUMN IF NOT EXISTS termination_kind   TEXT,
  ADD COLUMN IF NOT EXISTS termination_ground TEXT,
  -- cl. 12.6: "após a primeira venda válida a ele atribuída". Stamped by the
  -- commission trigger, so it can never disagree with the ledger.
  ADD COLUMN IF NOT EXISTS first_valid_sale_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ambassadors_termination_kind_check') THEN
    ALTER TABLE ambassadors ADD CONSTRAINT ambassadors_termination_kind_check
      CHECK (termination_kind IS NULL
             OR termination_kind IN ('voluntaria', 'nao_renovacao', 'justa_causa'));
  END IF;

  -- The four grounds are the contract's own list, verbatim (cl. 12.6, final
  -- sentence). Anything outside it is not grounds for immediate termination.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ambassadors_termination_ground_check') THEN
    ALTER TABLE ambassadors ADD CONSTRAINT ambassadors_termination_ground_check
      CHECK (termination_ground IS NULL
             OR termination_ground IN ('fraude', 'compartilhamento_conteudo',
                                       'violacao_credenciais', 'falta_uso_curso'));
  END IF;

  -- A ground is meaningful only for justa causa, and justa causa without one is
  -- exactly the "marcação indiscriminada" the clause guards against.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ambassadors_termination_ground_requires_cause') THEN
    ALTER TABLE ambassadors ADD CONSTRAINT ambassadors_termination_ground_requires_cause
      CHECK (
        (termination_kind = 'justa_causa' AND termination_ground IS NOT NULL)
        OR (termination_kind IS DISTINCT FROM 'justa_causa' AND termination_ground IS NULL)
      ) NOT VALID;
  END IF;
END $$;

-- Backfill the existing boolean into the new shape. There are no ambassadors on
-- production yet, so this is a no-op there and only matters for any local rows.
UPDATE ambassadors
   SET termination_kind = CASE WHEN terminated_for_cause THEN 'justa_causa' ELSE 'voluntaria' END,
       termination_ground = CASE WHEN terminated_for_cause THEN 'falta_uso_curso' END
 WHERE status = 'terminated' AND termination_kind IS NULL;

-- ── cl. 4.4 — vigência derived from the cohort, not typed by hand ───────────
-- 30 days after the linked cohort's official exam date. While the cohort's date
-- is unconfirmed the result is an estimate for planning only, which is why
-- `date_confirmed` is returned alongside rather than folded in.

CREATE OR REPLACE FUNCTION ambassador_contract_ends_on(p_ambassador_id BIGINT)
RETURNS TABLE (ends_on DATE, date_confirmed BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (c.test_date + 30)::date, COALESCE(c.date_confirmed, false)
    FROM ambassadors a
    JOIN cohorts c ON c.id = a.access_cohort_id
   WHERE a.id = p_ambassador_id;
$$;

-- ── cl. 12.6 — when course access actually ends ─────────────────────────────
--
-- Returns NULL when the ambassador holds no course benefit at all (every profile
-- except embaixador-aluno, cl. 2.2 — "NÃO SE APLICA").
--
-- While the contract is live, access runs to the end of the linked cohort. What
-- termination does to that depends on the clause:
--
--   justa causa  → the date of termination, but ONLY on one of the four
--                  enumerated grounds. Marked as justa causa without a ground,
--                  the ambassador keeps the cohort — refusing to revoke on an
--                  unsupported marking is the safe direction to fail.
--   voluntária / não renovação
--                → end of cohort IF 90 days of contract had elapsed OR a valid
--                  sale had been attributed, whichever came first; otherwise the
--                  date of termination.

CREATE OR REPLACE FUNCTION ambassador_access_ends_on(p_ambassador_id BIGINT)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a           ambassadors%ROWTYPE;
  v_cohort_end DATE;
  v_start     DATE;
  v_end_date  DATE;
  v_qualified BOOLEAN;
BEGIN
  SELECT * INTO a FROM ambassadors WHERE id = p_ambassador_id;
  IF NOT FOUND OR a.profile_type <> 'embaixador_aluno' OR a.access_cohort_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT (membership_ends_at AT TIME ZONE 'America/Sao_Paulo')::date
    INTO v_cohort_end
    FROM cohorts WHERE id = a.access_cohort_id;

  IF a.status <> 'terminated' OR a.terminated_at IS NULL THEN
    RETURN v_cohort_end;
  END IF;

  v_end_date := (a.terminated_at AT TIME ZONE 'America/Sao_Paulo')::date;

  IF a.termination_kind = 'justa_causa' THEN
    -- No enumerated ground means the clause does not authorise an immediate cut.
    IF a.termination_ground IS NULL THEN
      RETURN v_cohort_end;
    END IF;
    RETURN v_end_date;
  END IF;

  v_start := COALESCE(a.contract_starts_on, (a.activated_at AT TIME ZONE 'America/Sao_Paulo')::date);

  v_qualified :=
       (a.first_valid_sale_at IS NOT NULL AND a.first_valid_sale_at <= a.terminated_at)
    OR (v_start IS NOT NULL AND v_end_date >= v_start + 90);

  RETURN CASE WHEN v_qualified THEN v_cohort_end ELSE v_end_date END;
END;
$$;

REVOKE EXECUTE ON FUNCTION ambassador_access_ends_on(BIGINT) FROM anon;
REVOKE EXECUTE ON FUNCTION ambassador_contract_ends_on(BIGINT) FROM anon;

-- ── Stamp the first valid sale (cl. 12.6) ───────────────────────────────────
-- Same body as schema-patch-ambassadors.sql with one addition, marked below.
-- Kept whole rather than patched in place so the trigger has one readable
-- definition; the exception handler around it is load-bearing and must survive
-- (a commission bug must never roll back a payment that already granted access).

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

  v_old_status := CASE WHEN TG_OP = 'INSERT' THEN '' ELSE COALESCE(OLD.status, '') END;

  SELECT * INTO v_amb FROM ambassadors WHERE id = NEW.ambassador_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' AND v_old_status <> 'paid' THEN

    IF NEW.user_id = v_amb.user_id THEN
      RETURN NEW;
    END IF;

    v_sale_date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    IF v_amb.status <> 'active'
       OR (v_amb.contract_starts_on IS NOT NULL AND v_sale_date < v_amb.contract_starts_on)
       OR (v_amb.contract_ends_on   IS NOT NULL AND v_sale_date > v_amb.contract_ends_on) THEN
      RETURN NEW;
    END IF;

    v_base_cents := GREATEST(
      COALESCE(NEW.base_amount_cents, NEW.amount_cents) - COALESCE(NEW.discount_cents, 0),
      0
    );

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

    -- ADDED (cl. 12.6): first valid attributed sale. COALESCE keeps the earliest
    -- one, so a later sale never moves the marker forward.
    UPDATE ambassadors
       SET first_valid_sale_at = COALESCE(first_valid_sale_at, now())
     WHERE id = v_amb.id;

    RETURN NEW;
  END IF;

  IF NEW.status IN ('refunded', 'cancelled') AND v_old_status NOT IN ('refunded', 'cancelled') THEN
    SELECT * INTO v_existing
    FROM commissions
    WHERE order_id = NEW.id AND kind = 'sale';

    IF FOUND THEN
      IF v_existing.status = 'paga' THEN
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

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS ambassador_access_ends_on(BIGINT);
-- DROP FUNCTION IF EXISTS ambassador_contract_ends_on(BIGINT);
-- ALTER TABLE ambassadors
--   DROP CONSTRAINT IF EXISTS ambassadors_termination_ground_requires_cause,
--   DROP CONSTRAINT IF EXISTS ambassadors_termination_ground_check,
--   DROP CONSTRAINT IF EXISTS ambassadors_termination_kind_check,
--   DROP COLUMN IF EXISTS first_valid_sale_at,
--   DROP COLUMN IF EXISTS termination_ground,
--   DROP COLUMN IF EXISTS termination_kind;
-- (handle_order_commission reverts by re-running schema-patch-ambassadors.sql)
