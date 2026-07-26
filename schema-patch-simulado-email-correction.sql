-- schema-patch-simulado-email-correction.sql
--
-- Builds the second half of docs/simulado-drip-design.md §2, which was specified
-- and never implemented.
--
-- WHAT EXISTS TODAY: after ~10 answered questions the exam shows a passive notice —
-- "Seu link de retorno foi para j***@gmail.com". It can only be dismissed. There is
-- no way to say "that address is wrong", which is precisely the situation the design
-- called out: *"Under an email gate a typo is a silent, total loss."*
--
-- Karina hit it on 2026-07-26. She mistyped her address, noticed, and had no
-- recourse inside the exam — she went back to the landing page and started over,
-- which produced a second lead row and left the drip pointed at the dead address.
-- The bounce webhook then set drip_status='bounced', and simulado-drip correctly
-- excludes bounced leads forever. Nothing could ever reach her again.
--
-- The exam surface is the ONLY place that can still fix this: the session is an
-- httpOnly cookie (mhs_sim, 120 days), so a candidate whose address bounced is
-- still identifiable on-site long after the failed send.
--
-- Two columns:
--
--   sim_email_confirmed_at  — set when the candidate confirms the link arrived.
--                             Today "dismiss" is client-only React state, so the
--                             notice returns on every page load and every session.
--                             Persisting it means confirming once is honoured for
--                             good, which is what makes it safe to show the prompt
--                             more assertively to everyone else.
--
--   sim_email_corrections   — how many times this lead has rewritten their address
--                             from inside the exam. Abuse ceiling (the action caps
--                             at 3): a valid session cookie is required to correct,
--                             but a session should not be an unbounded licence to
--                             send mail to arbitrary addresses.
--
-- Idempotent — safe to re-run. Apply to BOTH databases:
--   prod:  node scripts/run-sql.js schema-patch-simulado-email-correction.sql
--   local: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
--            node scripts/run-sql.js schema-patch-simulado-email-correction.sql
-- After the local run: NOTIFY pgrst, 'reload schema'.
--
-- Rollback (manual):
--   ALTER TABLE leads DROP COLUMN IF EXISTS sim_email_confirmed_at;
--   ALTER TABLE leads DROP COLUMN IF EXISTS sim_email_corrections;
--
-- NOTE: run-sql.js wraps the whole file in one transaction, so no BEGIN/COMMIT.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sim_email_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN leads.sim_email_confirmed_at IS
  'Set when the candidate confirmed, from inside the exam, that the resume-link email arrived. Suppresses the in-exam address check permanently for this lead (dismissal used to be client-only state that reset on every page load).';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sim_email_corrections SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN leads.sim_email_corrections IS
  'How many times this lead rewrote their own email address from inside the exam (correctSimuladoEmail). Abuse ceiling — the action refuses past 3.';

-- Backfill: a lead who already CLICKED a link demonstrably received it, so there is
-- no reason to ask them. verified_at is stamped by the /acesso magic-link route.
UPDATE leads
SET sim_email_confirmed_at = verified_at
WHERE sim_email_confirmed_at IS NULL
  AND verified_at IS NOT NULL
  AND sim_entered_at IS NOT NULL;

-- Post-apply sanity check (read-only):
--   SELECT count(*) FILTER (WHERE sim_email_confirmed_at IS NOT NULL) AS confirmed,
--          count(*) FILTER (WHERE drip_status = 'bounced')            AS bounced,
--          count(*) FILTER (WHERE sim_entered_at IS NOT NULL)         AS in_simulado
--     FROM leads;
