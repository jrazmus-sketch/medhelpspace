-- Test coupons for staging verification. Apply once with:
--   node scripts/run-sql.js scripts/seed-test-coupons.sql
--
-- Idempotent — re-running is safe (skips rows whose code already exists).
-- Delete with: DELETE FROM coupons WHERE UPPER(code) IN ('TESTE20','TESTE100','TESTE50REAIS');

INSERT INTO coupons (code, discount_type, discount_value, active, notes)
SELECT 'TESTE20', 'percent', 20, true, 'Staging test — 20% off any cohort'
WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE UPPER(code) = 'TESTE20');

INSERT INTO coupons (code, discount_type, discount_value, active, notes)
SELECT 'TESTE100', 'percent', 100, true, 'Staging test — 100% off, skips PagBank'
WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE UPPER(code) = 'TESTE100');

INSERT INTO coupons (code, discount_type, discount_value, active, notes)
SELECT 'TESTE50REAIS', 'fixed_cents', 5000, true, 'Staging test — R$ 50 off (5000 centavos)'
WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE UPPER(code) = 'TESTE50REAIS');
