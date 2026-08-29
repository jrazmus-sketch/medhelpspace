-- ClinAct — idempotent attempt opening.
--
-- Found in browser testing (2026-08-28): the player page inserted an attempt
-- during render when no open one existed, and Next.js prefetch + duplicate
-- renders raced past that check — one navigation produced four open attempts.
--
-- Fix: at most ONE resumable attempt per (user, case, preview-flag) is enforced
-- by a partial unique index, and opening goes through one RPC that inserts
-- ON CONFLICT DO NOTHING and returns whichever row won. "Reiniciar" marks the
-- old attempt abandoned (state.abandoned = true) so it leaves the index without
-- ever gaining a finished_at — an abandoned attempt must never become the
-- canonical one (§2.3).
--
-- Run with:
--   node scripts/run-sql.js schema-patch-clinact-open-attempt.sql            # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-clinact-open-attempt.sql          # local
--
-- Rollback:
--   DROP FUNCTION IF EXISTS clinact_open_attempt(uuid, bigint, boolean, integer);
--   DROP INDEX IF EXISTS clinact_attempts_one_open_idx;

BEGIN;

-- Collapse any duplicates that already exist: keep the newest open attempt per
-- key, mark the rest abandoned. (Safe on prod: it has no attempts yet.)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, case_id, is_preview ORDER BY started_at DESC, id DESC) AS rn
  FROM clinact_attempts
  WHERE finished_at IS NULL AND NOT COALESCE((state->>'abandoned')::boolean, false)
)
UPDATE clinact_attempts a
   SET state = a.state || '{"abandoned": true}'::jsonb
  FROM ranked r
 WHERE a.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS clinact_attempts_one_open_idx
  ON clinact_attempts (user_id, case_id, is_preview)
  WHERE finished_at IS NULL AND NOT COALESCE((state->>'abandoned')::boolean, false);

CREATE OR REPLACE FUNCTION clinact_open_attempt(
  p_user uuid, p_case_id bigint, p_is_preview boolean, p_revision integer
)
RETURNS clinact_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row clinact_attempts;
BEGIN
  INSERT INTO clinact_attempts (user_id, case_id, case_revision, is_preview, state)
  VALUES (p_user, p_case_id, p_revision, p_is_preview,
          '{"cursor":0,"answered":{},"revealed":[],"estado":{},"relogio":0,"scene_key":null}'::jsonb)
  ON CONFLICT (user_id, case_id, is_preview)
    WHERE finished_at IS NULL AND NOT COALESCE((state->>'abandoned')::boolean, false)
  DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM clinact_attempts
     WHERE user_id = p_user AND case_id = p_case_id AND is_preview = p_is_preview
       AND finished_at IS NULL AND NOT COALESCE((state->>'abandoned')::boolean, false)
     ORDER BY started_at DESC LIMIT 1;
  END IF;
  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION clinact_open_attempt(uuid, bigint, boolean, integer) FROM anon, authenticated, public;

COMMIT;
