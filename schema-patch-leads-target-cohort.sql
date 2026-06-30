-- Add target_cohort to leads so the drip can be SEGMENTED by which exam the lead
-- is studying for (FREE-FUNNEL-BUILD-SPEC §7). A 2027.1 lead must never receive a
-- 2026.2 reta-final discount email — they have ample time and 2027.1 is full price.
--
-- Asked on the magnet results step ("Para qual prova você vai?"). Default to the
-- near-term cohort so leads who bail before answering still get the 2026.2 track.
--
-- Run with: node scripts/run-sql.js schema-patch-leads-target-cohort.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS target_cohort TEXT NOT NULL DEFAULT 'revalida-2026-2';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_target_cohort_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_target_cohort_check
      CHECK (target_cohort IN ('revalida-2026-2', 'revalida-2027-1'));
  END IF;
END $$;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_target_cohort_check;
-- ALTER TABLE leads DROP COLUMN IF EXISTS target_cohort;
