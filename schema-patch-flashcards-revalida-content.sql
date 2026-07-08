-- schema-patch-flashcards-revalida-content.sql
--
-- Seeds editable copy for the /flashcards-revalida paid-ads landing page (the
-- gift-first A/B variant vs. /questoes-revalida) into the existing `site_content`
-- key-value table, so the inline editor ("Edição rápida") can edit it like the
-- landing page. Each value MUST match the `<SiteText fallback=…>` in the
-- corresponding component verbatim — the component renders the fallback until this
-- patch is applied, then the row makes it click-editable.
--
-- Copy lives in:
--   app/src/app/flashcards-revalida/page.tsx      (fc.topbar/hero/get/teaser/why/sr/final/footer.*)
--   app/src/components/magnet/flashcards-gate.tsx (fc.gate.* — step-1 email form)
--
-- Tokens in `{braces}` (e.g. {anos}, {questoes}, {pct}) are LIVE VALUES substituted
-- at render time from WEIGHTED_DECK_STATS via <SiteText vars={…}> — the stored text
-- keeps the token so the copy stays editable and self-updating. Do NOT replace a
-- token with a hardcoded number here, or the stat stops tracking the real deck data.
--
-- Requires schema-patch-site-content.sql (creates `site_content`). Idempotent:
-- ON CONFLICT (key) DO NOTHING preserves any prior edits on re-run.
--
-- Rollback (removes only these keys):
--   DELETE FROM site_content WHERE key LIKE 'fc.%';

BEGIN;

INSERT INTO site_content (key, value) VALUES
  -- ── Top bar ──────────────────────────────────────────────────────────────────
  ('fc.topbar.label',       'Revalida · 1ª etapa'),

  -- ── Hero ─────────────────────────────────────────────────────────────────────
  ('fc.hero.badge',         'Grátis · sem cartão'),
  -- H1 is split into three so the gradient accent word stays styled.
  ('fc.hero.title_1',       '50 flashcards dos assuntos que'),
  ('fc.hero.title_accent',  'mais caem'),
  ('fc.hero.title_2',       'no Revalida.'),
  ('fc.hero.subhead',       'Um baralho pronto com os temas de maior incidência da 1ª etapa — com revisão espaçada e correção na hora. Escolhidos por dados reais das provas de {anos}.'),
  ('fc.hero.stat_label',    'da prova'),
  ('fc.hero.stat',          'Organizamos {questoes} questões das provas de {anos} por tema. {concentradas} delas se concentram em 6 assuntos de altíssima incidência. Seus 50 flashcards saem dos temas mais relevantes deles.'),

  -- ── "What you get" strip (right column, under the gate) ──────────────────────
  ('fc.get.0',              '50 flashcards dos 6 assuntos que mais caem'),
  ('fc.get.1',              'Revisão espaçada de verdade — não é PDF'),
  ('fc.get.2',              'O link chega na hora, no seu e-mail'),

  -- ── Card teaser ──────────────────────────────────────────────────────────────
  ('fc.teaser.eyebrow',     'Veja um card de verdade'),

  -- ── "Por que esses 6 assuntos?" ──────────────────────────────────────────────
  ('fc.why.eyebrow',        'Por que esses 6 assuntos?'),
  ('fc.why.title',          'Escolhidos pela incidência real na prova'),
  ('fc.why.body',           'Contamos quantas questões de cada assunto apareceram nas provas do Revalida de {anos} ({temas} temas, {questoes} questões). Juntos, estes seis concentram {pct}% delas — e o seu baralho é proporcional a isso: mais cards nos assuntos que mais caem.'),
  ('fc.why.caption',        'barra = nº de questões nas provas de {anos}'),

  -- ── Spaced-repetition proof ──────────────────────────────────────────────────
  ('fc.sr.eyebrow',         'Não é só um PDF'),
  ('fc.sr.title',           'Revisão espaçada de verdade'),
  ('fc.sr.body',            'Cada card que você acerta volta em intervalos cada vez maiores — e some do caminho. Errou? Ele volta amanhã e recomeça. É o sistema que garante que você não esquece na hora da prova.'),
  ('fc.sr.card_label',      'O intervalo cresce a cada acerto'),
  ('fc.sr.card_note',       '…e some do caminho'),

  -- ── Final CTA band ───────────────────────────────────────────────────────────
  ('fc.final.title',        'Comece pelos assuntos que mais caem — de graça.'),
  ('fc.final.body',         'Deixe seu e-mail e mandamos o link do baralho na hora. Sem cartão, sem pegadinha.'),

  -- ── Footer ───────────────────────────────────────────────────────────────────
  ('fc.footer.copyright',   '© MedHelpSpace'),

  -- ── Email gate (step 1) — flashcards-gate.tsx ────────────────────────────────
  ('fc.gate.eyebrow',       'Grátis · sem cartão'),
  ('fc.gate.headline',      'Para onde enviamos seus 50 flashcards?'),
  ('fc.gate.cta',           'Quero meus 50 flashcards →'),
  ('fc.gate.reassurance',   'Sem spam. Você recebe o baralho e pode cancelar quando quiser.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
