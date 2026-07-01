-- Fill the CNPJ in the shared email footer (email_settings singleton, id=1). The
-- CNPJ identifies the sender → legitimacy signal for recipients + spam filters,
-- and satisfies the "who is emailing me" expectation without exposing a personal
-- address. Home-based business: NO street address — `address` stays blank, and the
-- footer renders the address line only when it is set (renderFooter in email-render.ts).
--
-- Value from the authorized nota fiscal (see MEMORY project_cnpj_followup).
-- Idempotent. Run with: node scripts/run-sql.js seed-email-settings-cnpj.sql

UPDATE email_settings
SET cnpj = '61.148.283/0001-08'
WHERE id = 1;

-- rollback: UPDATE email_settings SET cnpj = '' WHERE id = 1;
