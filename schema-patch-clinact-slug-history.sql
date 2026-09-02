-- ClinAct — renaming a case keeps its address working (Karina, 2026-09-02).
--
-- She renamed D30-01 from "Choque — a pressão não respondeu" to "A pressão não
-- respondeu" (the old title gave the diagnosis away before the student opened
-- the case). The public title changed, but the URL stayed
-- /clinact/caso/choque-decisao-hemodinamica, because the editor deliberately
-- froze the slug once a case was published.
--
-- Her requirement is structural, not a one-off fix: renaming from the admin must
-- update the address, old links must keep working, a rename must never touch the
-- student's history, and it must never take an address that belongs to another
-- case.
--
-- The internal id was ALREADY the identity — attempts, step events, review
-- schedule and Minha Evolução all key on clinact_cases.id, never on the slug —
-- so renaming cannot reach performance history. What was missing is the address
-- history, which this patch adds:
--
--   clinact_case_slugs — every slug a case has ever answered to, including the
--   current one. The player route resolves a miss through this table and
--   permanently redirects to the case's current address.
--
-- Ownership is enforced in the DB, not only in app code: the trigger REFUSES a
-- slug that is already an alias of a different case, so no rename can ever
-- silently point an old link at the wrong case. The app resolves collisions by
-- suffixing (-2, -3, …) before it ever gets here.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-clinact-slug-history.sql            # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-clinact-slug-history.sql          # local
--
-- Rollback:
--   DROP TRIGGER IF EXISTS clinact_cases_record_slug ON clinact_cases;
--   DROP FUNCTION IF EXISTS clinact_record_slug();
--   DROP TABLE IF EXISTS clinact_case_slugs;
--   (nothing else references them; the case's own slug column is untouched)

BEGIN;

-- ── The address history ──────────────────────────────────────────────────────
-- ON DELETE CASCADE is right HERE and only here: an alias is metadata about the
-- case's address, not student history. (Contrast clinact_step_events, where a
-- cascade destroyed real attempt data — see schema-patch-clinact-preserve-events.)

CREATE TABLE IF NOT EXISTS clinact_case_slugs (
  slug       text PRIMARY KEY,
  case_id    bigint NOT NULL REFERENCES clinact_cases(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinact_case_slugs_case_idx ON clinact_case_slugs(case_id);

COMMENT ON TABLE clinact_case_slugs IS
  'Every slug a ClinAct case has ever had, current one included. Old slugs stay so links never break; the PK guarantees one case can never take another case''s address.';

-- ── Record the current slug on every write, and refuse to steal one ──────────

CREATE OR REPLACE FUNCTION clinact_record_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clinact_case_slugs
     WHERE slug = NEW.slug AND case_id <> NEW.id
  ) THEN
    RAISE EXCEPTION
      'O endereço "%" já pertence a outro caso do ClinAct.', NEW.slug
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO clinact_case_slugs (slug, case_id)
  VALUES (NEW.slug, NEW.id)
  ON CONFLICT (slug) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinact_cases_record_slug ON clinact_cases;
CREATE TRIGGER clinact_cases_record_slug
  AFTER INSERT OR UPDATE OF slug ON clinact_cases
  FOR EACH ROW EXECUTE FUNCTION clinact_record_slug();

-- ── Backfill: every case answers to its current address ──────────────────────
-- Runs before any rename, so a case renamed after this patch keeps the address
-- it had at the moment the patch was applied.

INSERT INTO clinact_case_slugs (slug, case_id)
SELECT c.slug, c.id FROM clinact_cases c
ON CONFLICT (slug) DO NOTHING;

-- ── Access ───────────────────────────────────────────────────────────────────
-- Read path is the service-role client (same posture as every other clinact
-- read — gating lives in app code). RLS on as defense-in-depth: the table holds
-- no student data, and published cases' addresses are public information, but
-- nothing needs to reach it from the browser.

ALTER TABLE clinact_case_slugs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clinact_case_slugs FROM anon, authenticated;

COMMIT;
