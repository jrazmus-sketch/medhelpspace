-- schema-patch-simulado-karina-notes-0726.sql
--
-- Karina's notes of 2026-07-26 ("corrigir mensagem 1.1 / 1.2"): five deletions
-- across the simulado funnel. All copy, no schema.
--
-- WHY THIS PATCH IS NOT OPTIONAL: every string below has a site_content row in
-- production, and a site_content row WINS over the component fallback. Editing
-- the components alone changes nothing on the live pages — the code edits in the
-- same commit only fix what a NEW environment (or a wiped site_content) would
-- render.
--
-- Landing (/simulado-revalida), hero:
--   1. sim.hero.badge  — drop "· sem cartão"  → "Grátis · 100 questões inéditas"
--   2. sim.hero.stat + sim.hero.stat_label — the big "100 / QUESTÕES INÉDITAS"
--      strip is gone from the page; the rows are deleted so nobody edits a
--      string that no longer renders (the visual editor would happily let them).
--   3. sim.hero.re_0   — "Grátis, sem cartão" → "Grátis"
--   4. sim.hero.trust  — the "mesmas 100 questões que entregamos aos nossos
--      alunos" quote-bar is gone from the page; row deleted for the same reason.
--
-- Report (/simulado-revalida/resultado):
--   5. The cut-score verdict box no longer renders. Its rows — sim.report.cut_score,
--      cut_above, cut_below — are DELIBERATELY LEFT IN PLACE. Justin chose
--      "remove the box, keep the plumbing": the prop and the page's read still
--      exist, so restoring it is re-adding one JSX block (see the RESTORE comment
--      at the bottom of app/src/components/magnet/simulado-report.tsx), not
--      rebuilding Phase 2's verdict logic.
--
-- "sem cartão" now appears nowhere on /simulado-revalida. It is untouched on the
-- OTHER funnels (fc.hero.badge, fc.gate.eyebrow, the questoes-revalida metadata),
-- which Karina did not mark.
--
-- Idempotent — safe to re-run. Apply to BOTH databases:
--   prod:  node scripts/run-sql.js schema-patch-simulado-karina-notes-0726.sql
--   local: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
--            node scripts/run-sql.js schema-patch-simulado-karina-notes-0726.sql
--
-- Rollback (restores the exact pre-2026-07-26 production values):
--   UPDATE site_content SET value = 'Grátis · 100 questões inéditas · sem cartão'
--     WHERE key = 'sim.hero.badge';
--   UPDATE site_content SET value = 'Grátis, sem cartão' WHERE key = 'sim.hero.re_0';
--   INSERT INTO site_content (key, value) VALUES
--     ('sim.hero.stat_label', 'questões inéditas'),
--     ('sim.hero.stat', 'Questões elaboradas para avaliar raciocínio clínico, interpretação e escolha da conduta mais adequada — no nível e no formato da 1ª etapa.'),
--     ('sim.hero.trust', 'São as mesmas 100 questões que entregamos aos nossos alunos dentro da plataforma. Aqui elas são suas de graça — sem versão reduzida.')
--     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--   (and revert the code changes in the same commit)
--
-- NOTE: run-sql.js wraps the whole file in one transaction (atomic all-or-nothing),
-- so no explicit BEGIN/COMMIT here.

-- ── 1) Eyebrow chip: drop "sem cartão" ───────────────────────────────────────
UPDATE site_content
SET value = 'Grátis · 100 questões inéditas'
WHERE key = 'sim.hero.badge';

-- ── 3) Reassurance row: "Grátis, sem cartão" → "Grátis" ──────────────────────
-- (re_1 "Sem cronômetro" and re_2 "Pare e volte quando quiser" are untouched.)
UPDATE site_content
SET value = 'Grátis'
WHERE key = 'sim.hero.re_0';

-- ── 2 + 4) Rows for elements that no longer exist on the page ────────────────
DELETE FROM site_content
WHERE key IN ('sim.hero.stat', 'sim.hero.stat_label', 'sim.hero.trust');

-- Post-apply sanity check (read-only):
--   SELECT key, value FROM site_content
--     WHERE key LIKE 'sim.hero.%' ORDER BY key;
--   -- expect: badge/re_0 updated; stat, stat_label, trust ABSENT (8 rows left).
--   SELECT key, left(value, 40) FROM site_content WHERE key LIKE 'sim.report.cut%';
--   -- expect: all 3 still present — plumbing kept on purpose.
--   SELECT key FROM site_content WHERE value ILIKE '%sem cartão%' ORDER BY key;
--   -- expect: only the OTHER funnels' keys (fc.*), never sim.*.
