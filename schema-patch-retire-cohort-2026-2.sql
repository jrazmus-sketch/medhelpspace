-- schema-patch-retire-cohort-2026-2.sql
--
-- Retire the revalida-2026-2 turma from sale, 2026-07-11. Focus shifts to
-- selling revalida-2027-1 (frenzy starts within ~2 weeks) + revalida-20272.
--
-- What this does:
--   1. Takes 2026-2 off the storefront (is_for_sale = false). The cohort row
--      stays active = true: existing members keep full access (membership gating
--      checks only the membership window, never is_for_sale/active), 60D unlock
--      dates keep working, and admin reports still show the turma.
--   2. Flips the leads.target_cohort column default to 'revalida-2027-1' —
--      soft-captured leads (who never reach the turma picker) now default to the
--      turma we actually sell.
--   3. Deactivates the 2026-2-scoped coupons REVALIDA5 (welcome) and VOLTA5
--      (recovery). Their codes are baked into already-sent drip emails; a dead
--      coupon simply fails to redeem, and checkout rejects the off-sale turma
--      anyway. REVALIDA10 / VOLTA10 (2027.1 + 2027.2) are untouched.
--   4. Reassigns non-converted 2026-2 leads to revalida-2027-1 (15 rows at time
--      of writing) so their remaining drip steps render 2027.1 exam framing,
--      working checkout links, and the REVALIDA10/VOLTA10 codes. The 1 converted
--      lead keeps 2026-2 — that's the turma they actually bought.
--   5. Removes "2026.2" from the live FAQ answer (site_content key faq.4.a,
--      which overrides the code fallback). Surgical REPLACE, not overwrite, to
--      preserve Karina's surrounding copy.
--
-- Deliberately NOT touched:
--   - cohorts.active (soft delete) — reserve for after the 13/09 exam window.
--   - leads_target_cohort_check — 'revalida-2026-2' stays valid so historical
--     rows (the converted buyer) keep passing the constraint.
--   - email_templates 'lead-final' — mentions turma 2026.2 but is retired
--     (the drip cron hard-skips step 5 and never sends it).
--
-- Idempotent — safe to re-run. Apply with:
--   node scripts/run-sql.js schema-patch-retire-cohort-2026-2.sql
--
-- Rollback (put the turma back on sale):
--   UPDATE cohorts SET is_for_sale = true WHERE slug = 'revalida-2026-2';
--   ALTER TABLE leads ALTER COLUMN target_cohort SET DEFAULT 'revalida-2026-2';
--   UPDATE coupons SET active = true WHERE UPPER(code) IN ('REVALIDA5','VOLTA5');
--   UPDATE site_content SET value = REPLACE(value, 'Disponíveis: Revalida 2027.1 e 2027.2',
--     'Disponíveis: Revalida 2026.2, 2027.1 e 2027.2') WHERE key = 'faq.4.a';
--   -- Lead reassignment is NOT auto-reversible (original per-lead choice is
--   -- overwritten). Restore from a backup of the leads table if ever needed.
--   (and revert the code changes in the same commit)
--
-- NOTE: run-sql.js wraps the whole file in one transaction (atomic all-or-nothing),
-- so no explicit BEGIN/COMMIT here.

-- 1) Off the storefront. Loja/landing cards, checkout, and the funnel reward
--    offers all read is_for_sale via getCohortsForSale/getCohortProduct.
UPDATE cohorts
SET is_for_sale = false
WHERE slug = 'revalida-2026-2';

-- 2) New soft-capture default: the turma we're selling.
ALTER TABLE leads
  ALTER COLUMN target_cohort SET DEFAULT 'revalida-2027-1';

-- 3) Kill the 2026-2-scoped promo codes.
UPDATE coupons
SET active = false
WHERE UPPER(code) IN ('REVALIDA5', 'VOLTA5');

-- 4) Move the still-nurturing 2026-2 leads onto 2027-1. Converted buyers keep
--    their real purchase turma.
UPDATE leads
SET target_cohort = 'revalida-2027-1'
WHERE target_cohort = 'revalida-2026-2'
  AND drip_status <> 'converted';

-- 5) Live FAQ copy (site_content overrides the code fallback).
UPDATE site_content
SET value = REPLACE(value, 'Disponíveis: Revalida 2026.2, 2027.1 e 2027.2',
                           'Disponíveis: Revalida 2027.1 e 2027.2')
WHERE key = 'faq.4.a'
  AND value LIKE '%2026.2%';

-- Post-apply sanity check (read-only):
--   SELECT slug, is_for_sale FROM cohorts ORDER BY id;
--   SELECT column_default FROM information_schema.columns
--     WHERE table_name = 'leads' AND column_name = 'target_cohort';
--   SELECT code, active FROM coupons WHERE UPPER(code) IN ('REVALIDA5','VOLTA5');
--   SELECT target_cohort, drip_status, count(*) FROM leads GROUP BY 1,2;
--   SELECT value FROM site_content WHERE key = 'faq.4.a';
