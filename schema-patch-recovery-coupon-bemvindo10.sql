-- Recovery e-mails offer BEMVINDO10 instead of VOLTA10 (Karina, 2026-10-01).
--
-- The code itself is not stored here: {{coupon}} is filled by the lead-recovery cron from
-- RECOVERY_COUPONS in app/src/lib/magnet/links.ts, which this release switches to
-- BEMVINDO10 for 2027.1 + 2027.2. BEMVINDO10 already exists (Karina created it in
-- /admin/coupons: 10%, both 2027 turmas, 1 use per person); VOLTA10 stays active so a code
-- already mailed keeps working.
--
-- This patch only refreshes the editor hint of the two recovery templates — the DB row's
-- `variables` win over the code defaults, so they still read "ex.: VOLTA10".
--
-- Run with:
--   node scripts/run-sql.js schema-patch-recovery-coupon-bemvindo10.sql                     # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-recovery-coupon-bemvindo10.sql                   # local
--
-- Rollback: the same UPDATE with 'VOLTA10' (and RECOVERY_COUPONS back to VOLTA10).

UPDATE email_templates t
   SET variables = (
         SELECT jsonb_agg(
                  CASE WHEN e->>'tag' = 'coupon'
                       THEN jsonb_set(e, '{description}', to_jsonb('Cupom de recuperação (ex.: BEMVINDO10)'::text))
                       ELSE e END
                  ORDER BY ord)
           FROM jsonb_array_elements(t.variables) WITH ORDINALITY AS x(e, ord)
       )
 WHERE t.kind IN ('lead-recover-unfinished-1', 'lead-recover-unfinished-2')
   AND jsonb_typeof(t.variables) = 'array'
   AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(t.variables) e
          WHERE e->>'tag' = 'coupon' AND e->>'description' LIKE '%VOLTA10%'
       );
