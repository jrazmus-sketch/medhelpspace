-- schema-patch-flag-typo-bounce-test-lead.sql
--
-- Data correction, 2026-07-26. One row.
--
-- `nynabran@gmail.com` is not a real candidate. It is Karina's own address with a
-- typo, created while she was testing /simulado-revalida on 2026-07-26. The address
-- does not exist, so the resume-link email hard-bounced and the Resend webhook set
-- drip_status='bounced'.
--
-- WHY THIS MATTERS BEYOND TIDINESS: the row was is_test=false, so it counted as a
-- real lead in the /admin/leads funnel stats — and as the only bounce among 42
-- leads it read as a ~2.4% bounce rate on a young sending domain. That is a number
-- you would act on. It is an artefact of a test, not a deliverability signal.
--
-- Justin confirmed the origin. Flipping is_test excludes it from the funnel stats
-- (lib/admin/funnel.ts) and from the Google Ads OCI export (lib/admin/oci.ts), both
-- of which already filter on is_test.
--
-- The row is NOT deleted: it is the only production example of the bounce path
-- end-to-end, and the lead_email_events rows attached to it (a `sent` and a
-- `bounced` sharing one resend_id) are the reference for how that data looks.
-- Keeping it also means the new in-exam correction prompt
-- (schema-patch-simulado-email-correction.sql) has something real to be tested
-- against — drip_status='bounced' is exactly what triggers its bounce variant.
--
-- Idempotent. Apply to prod only (the row does not exist locally):
--   node scripts/run-sql.js schema-patch-flag-typo-bounce-test-lead.sql
--
-- Rollback:
--   UPDATE leads SET is_test = false WHERE email = 'nynabran@gmail.com';

UPDATE leads
SET is_test = true
WHERE email = 'nynabran@gmail.com'
  AND is_test = false;

-- Post-apply sanity check (read-only):
--   SELECT email, source, drip_status, is_test FROM leads
--     WHERE email LIKE 'nynabran%' ORDER BY email;
--   -- expect nynabran@gmail.com → bounced / is_test = true
--   SELECT count(*) FROM leads WHERE is_test = false AND drip_status = 'bounced';
--   -- expect 0: no real lead has bounced.
