-- Programa de Embaixadores — controls around the MANUAL removal of the
-- embaixador-aluno's free course access (cl. 12.6).
--
-- Karina's decision (2026-08-28): removal stays manual through the pilot, because
-- an automated revocation that misfires takes course access away from someone who
-- is paying. What the panel owes her instead is: the computed date, a status she
-- can act on, a highlighted pending item when the date arrives, and a record of
-- who removed the access and when.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-ambassador-access-revocation.sql
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-ambassador-access-revocation.sql

ALTER TABLE ambassadors
  ADD COLUMN IF NOT EXISTS access_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_revoked_by UUID REFERENCES auth.users(id),
  -- Records the OUTCOME, not just the act: notably the case where nothing was
  -- removed because the same cohort had also been bought.
  ADD COLUMN IF NOT EXISTS access_revoked_note TEXT;

-- ── Status of the course benefit ────────────────────────────────────────────
--
-- Five states, four of them Karina's:
--
--   NULL              — profile carries no course benefit at all
--   'ativo'           — benefit running, nothing to do
--   'aguardando_data' — contract ended, access runs to a future computed date
--   'a_encerrar'      — the date has arrived (or justa causa made it immediate):
--                       this is the pending item the panel must highlight
--   'encerrado'       — an admin has confirmed the removal
--
-- Immediate on justa causa comes free: ambassador_access_ends_on() already
-- returns the termination date itself for an enumerated ground, so that date is
-- in the past the moment it is set, and the status lands on 'a_encerrar'.

CREATE OR REPLACE FUNCTION ambassador_access_status(p_ambassador_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a         ambassadors%ROWTYPE;
  v_ends_on DATE;
  v_today   DATE;
BEGIN
  SELECT * INTO a FROM ambassadors WHERE id = p_ambassador_id;
  IF NOT FOUND OR a.profile_type <> 'embaixador_aluno' OR a.access_cohort_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF a.access_revoked_at IS NOT NULL THEN
    RETURN 'encerrado';
  END IF;

  v_ends_on := ambassador_access_ends_on(p_ambassador_id);
  IF v_ends_on IS NULL THEN
    RETURN NULL;
  END IF;

  -- Brazilian day, never the server's. Vercel runs UTC and after 21:00 BRT it is
  -- already on tomorrow, which would raise the pending item a day early.
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  IF a.status <> 'terminated' THEN
    RETURN 'ativo';
  END IF;

  RETURN CASE WHEN v_ends_on <= v_today THEN 'a_encerrar' ELSE 'aguardando_data' END;
END;
$$;

REVOKE EXECUTE ON FUNCTION ambassador_access_status(BIGINT) FROM anon;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS ambassador_access_status(BIGINT);
-- ALTER TABLE ambassadors
--   DROP COLUMN IF EXISTS access_revoked_note,
--   DROP COLUMN IF EXISTS access_revoked_by,
--   DROP COLUMN IF EXISTS access_revoked_at;
