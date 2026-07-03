-- schema-patch-swap-copy-updates.sql
--
-- Data-only copy fix (no DDL) completing the Revalida Up ⇄ Fórmula MedHelp swap
-- (2026-06-20 gating swap; see schema-patch-swap-revalida-formula-gating.sql).
-- Post-swap truth: Revalida Up = Day-1/ungated; Fórmula MedHelp = MedHelp-60D/gated.
--
-- SCOPE — verified against PROD on 2026-07-03 (scratch/verify-swap-copy.js):
--   • All site_content rows (loja.*, pricing.*, faq.*, sixtyd.*) were ALREADY the
--     correct post-swap values in prod (admin had inline-edited them). They are
--     therefore NOT touched here — updating them would only clobber admin edits.
--   • The two transactional email templates and the content_modules description
--     were still pre-swap. Those are the only rows this patch changes.
--
-- Uses REPLACE (not a full-column SET) so any other admin edits to these templates
-- survive. REPLACE targets the bare product name (never the "&nbsp;" markup, which
-- the visual editor may store as a literal U+00A0). Runs inside run-sql.js's own
-- transaction — do NOT add BEGIN/COMMIT here (it nests badly).
--
-- Run with: node scripts/run-sql.js schema-patch-swap-copy-updates.sql
-- Verify with: node scratch/verify-swap-copy.js   (before + after)

-- 1) Purchase email — Day-1 checklist must list Revalida Up, not Fórmula MedHelp.
UPDATE email_templates
SET body_html = REPLACE(body_html, 'Fórmula MedHelp', 'Revalida Up — mini-resumos'),
    updated_at = NOW()
WHERE kind = 'purchase';

-- 2) 60D-unlock email — reta-final list must name Fórmula MedHelp, not Revalida Up.
--    Also fixes the live "({{testDate}})" bug: testDate is passed already wrapped in
--    its own " (…)" (or blank when the exam date is unconfirmed), so the template must
--    use a bare {{testDate}} — the extra parens rendered "prova ( (date))." or "prova ()."
UPDATE email_templates
SET body_html = REPLACE(
                  REPLACE(body_html, 'Revalida Up', 'Fórmula MedHelp'),
                  ' ({{testDate}})', '{{testDate}}'
                ),
    variables = '[{"tag":"displayName","description":"Primeiro nome do membro"},{"tag":"testDate","description":"Data da prova já entre parênteses e com espaço inicial (ex.: (15 de novembro de 2026)); vazio quando a data da turma ainda não foi confirmada pela banca."}]'::jsonb,
    updated_at = NOW()
WHERE kind = '60d-unlock';

-- 3) content_modules — the 60D module now bundles Fórmula MedHelp (Revalida Up moved to day-1).
UPDATE content_modules
SET description = 'Fórmula MedHelp + Memorecards — unlocks 60 days before the cohort test date'
WHERE slug = 'medhelp-60d';

-- ── Rollback (prior PROD values, captured 2026-07-03) ────────────────────────────
--   -- purchase:
--   UPDATE email_templates
--     SET body_html = REPLACE(body_html, 'Revalida Up — mini-resumos', 'Fórmula MedHelp')
--     WHERE kind = 'purchase';
--   -- 60d-unlock:
--   UPDATE email_templates SET body_html =
--     'Faltam 60 dias para sua prova ({{testDate}}). O módulo intensivo <strong>MedHelp 60D</strong> agora está disponível — Revalida Up, Memorecards e todos os recursos de reta final.'
--     WHERE kind = '60d-unlock';
--   -- content_modules:
--   UPDATE content_modules
--     SET description = 'Revalida Up + Memorecards — unlocks 60 days before the cohort test date'
--     WHERE slug = 'medhelp-60d';
