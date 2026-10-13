-- ClinAct taxonomy of its own — PHASE 2 of 2: PUBLICATION (Karina, 2026-10-13).
--
-- Apply ONLY when Karina authorises publishing the review build, right before
-- (or together with) merging branch clinact-taxonomia to main. Needs phase 1
-- (schema-patch-clinact-taxonomia.sql) already applied.
--
-- During review, production kept running the OLD admin, which writes Revalida
-- specialty/topic ids. Phase 1 dropped the two FKs so both builds could share
-- one database. This patch:
--   1. copies into ClinAct's lists any specialty / topic a case points at that
--      they do not have yet (an id the old admin wrote during review) — same
--      id, so no case moves;
--   2. refuses to continue if any case would still point outside them;
--   3. re-adds both FKs, now to clinact_specialties / clinact_topics, with
--      ON DELETE RESTRICT: ClinAct owns these rows, and deleting one a case
--      uses must fail (the admin already refuses; this is the floor under it).
--
-- Re-run safe. Rollback: drop the two constraints (the data stays valid).

BEGIN;

-- ── 1. Reconcile ───────────────────────────────────────────────────────────
INSERT INTO clinact_specialties (id, slug, name, display_order)
SELECT s.id, s.slug, s.name, s.display_order * 10
  FROM specialties s
 WHERE s.id IN (SELECT DISTINCT specialty_id FROM clinact_cases WHERE specialty_id IS NOT NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO clinact_topics (id, specialty_id, name, slug)
SELECT DISTINCT ON (t.id) t.id, c.specialty_id, t.name, COALESCE(NULLIF(t.slug, ''), 'tema-' || t.id)
  FROM clinact_cases c
  JOIN topics t ON t.id = c.topic_id
 WHERE c.specialty_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM clinact_topics ct WHERE ct.id = c.topic_id)
 ORDER BY t.id
ON CONFLICT (id) DO NOTHING;

-- ── 2. Nothing may point outside ClinAct's lists ───────────────────────────
DO $$
DECLARE
  bad_sp int;
  bad_tp int;
BEGIN
  SELECT count(*) INTO bad_sp FROM clinact_cases c
   WHERE c.specialty_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM clinact_specialties s WHERE s.id = c.specialty_id);
  SELECT count(*) INTO bad_tp FROM clinact_cases c
   WHERE c.topic_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM clinact_topics t WHERE t.id = c.topic_id);
  IF bad_sp > 0 OR bad_tp > 0 THEN
    RAISE EXCEPTION 'ClinAct taxonomy not reconciled: % case(s) with an unknown specialty, % with an unknown topic', bad_sp, bad_tp;
  END IF;
END $$;

-- ── 3. FKs to ClinAct's own tables ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinact_cases_clinact_specialty_fkey') THEN
    ALTER TABLE clinact_cases ADD CONSTRAINT clinact_cases_clinact_specialty_fkey
      FOREIGN KEY (specialty_id) REFERENCES clinact_specialties(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinact_cases_clinact_topic_fkey') THEN
    ALTER TABLE clinact_cases ADD CONSTRAINT clinact_cases_clinact_topic_fkey
      FOREIGN KEY (topic_id) REFERENCES clinact_topics(id) ON DELETE RESTRICT;
  END IF;
END $$;

COMMIT;
