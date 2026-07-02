-- Make the /questoes-revalida free-funnel magnet page inline-editable.
-- Promotes each marketing/intro <SiteText> fallback to an editable site_content
-- row. Apply with:
--   node scripts/run-sql.js seed-magnet-editable.sql
--
-- Scope = the static marketing copy of the funnel:
--   * page.tsx  — header tag + hero (eyebrow/title/subhead) + empty state
--   * magnet-quiz.tsx welcome card (eyebrow, body, 3 bullets, CTA, note)
--   * magnet-quiz.tsx static gate + cohort headings
-- Intentionally NOT seeded (dynamic/transactional, stays hardcoded): the quiz
-- question view, score framing, "{days} dias"/"{correctCount} de 5" stakes,
-- verify-to-claim + reward flow, and all error messages.
--
-- Note: three source strings dropped an inline <strong> emphasis (hero subhead,
-- welcome bullets 1 & 3) so each is one clean editable field — the copy is
-- unchanged, only the bold styling on a sub-phrase is gone.
--
-- Values MUST match the <SiteText fallback=…> verbatim → applying is a no-op
-- visually; it only unlocks inline editing. The page is force-dynamic, so edits
-- show on the next request (no ISR cache to bust).
--
-- ON CONFLICT DO NOTHING: additive only; never clobbers an existing key/edit.
-- Rollback: DELETE FROM site_content WHERE key LIKE 'magnet.%';

INSERT INTO site_content (key, value) VALUES
  -- Page: header tag + hero + empty state
  ('magnet.header_tag',  $$Simulado Honesto · 1ª etapa$$),
  ('magnet.hero_eyebrow', $$Revalida · 1ª etapa$$),
  ('magnet.hero_title',   $$15 questões comentadas da 1ª etapa. De graça.$$),
  ('magnet.hero_subhead', $$Sem promessa de aprovação. Resolva, veja exatamente onde você está e receba um plano de estudo até a data da sua prova. As 5 primeiras são abertas — depois é só o seu e-mail.$$),
  ('magnet.empty',        $$Simulado em preparação. Volte em instantes.$$),

  -- Welcome card (phase 0 — before Q1)
  ('magnet.wel_eyebrow', $$Antes de começar$$),
  ('magnet.wel_body',    $$Você resolve, vê o comentário na hora e, no final, a gente monta seu plano de estudo — focado nas matérias que você errou. Sem pegadinha.$$),
  ('magnet.wel_b1',      $$10–15 min · 15 questões comentadas, no seu ritmo$$),
  ('magnet.wel_b2',      $$Comentário e explicação logo após cada resposta$$),
  ('magnet.wel_b3',      $$No final: seu nível real + um plano de estudo até a data da sua prova$$),
  ('magnet.wel_cta',     $$Começar agora →$$),
  ('magnet.wel_note',    $$Grátis · sem cartão · as 5 primeiras sem cadastro$$),

  -- Email gate (static parts; the "{n} de 5" eyebrow stays dynamic)
  ('magnet.gate_title', $$Veja as 10 questões restantes + seu resultado comentado$$),
  ('magnet.gate_body',  $$São questões reais de provas anteriores. Deixe seu e-mail para continuar e receber seu resultado no final — sem custo.$$),
  ('magnet.gate_note',  $$Sem spam. Você pode sair quando quiser.$$),

  -- Cohort question card
  ('magnet.cohort_eyebrow', $$Quase lá — montando seu plano$$),
  ('magnet.cohort_title',   $$Para qual prova você está estudando?$$),
  ('magnet.cohort_body',    $$Usamos isso para montar seu cronograma até a data certa.$$)
ON CONFLICT (key) DO NOTHING;
