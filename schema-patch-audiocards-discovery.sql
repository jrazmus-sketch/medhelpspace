-- schema-patch-audiocards-discovery.sql
--
-- Seeds the editable copy for the AudioCards discovery surfaces (the
-- post-flashcard-session nudge, the dashboard "revisão passiva" playlist, and
-- the AudioCards hub label) into `site_content` so each string is inline-editable
-- via "Edição rápida" / EditableText, exactly like the landing + onboarding copy.
--
-- Also seeds the previously-unseeded `onboarding.audiocards.*` rows (the
-- audiocards tip was added after schema-patch-onboarding-content.sql shipped, so
-- those rows never made it into site_content). Without them the tip still renders
-- from its hardcoded fallback in tips.ts, just not inline-editable.
--
-- No DDL — depends on schema-patch-site-content.sql (table + RLS + the
-- site_content.value allowlist entry already exist).
--
-- Values MUST match the hardcoded fallbacks verbatim so the text is identical
-- whether served from the DB or the fallback:
--   * audiocards.nudge.*     → flashcard-player.tsx (<SiteText>)
--   * audiocards.hub.intro   → app/[specialty]/page.tsx (<SiteText>)
--   * audiocards.playlist.*  → app/page.tsx (<SiteText>)
--   * onboarding.audiocards.* → lib/onboarding/tips.ts (TIPS.audiocards)
-- The `**bold**` markers in the onboarding values are rendered by <Emphasis>.
--
-- Idempotent: ON CONFLICT (key) DO NOTHING preserves any inline edits on re-run.
--
-- Rollback:
--   DELETE FROM site_content WHERE key LIKE 'audiocards.%';
--   DELETE FROM site_content WHERE key LIKE 'onboarding.audiocards.%';

BEGIN;

INSERT INTO site_content (key, value) VALUES
  -- Post-session nudge (flashcard deck-done summary)
  ('audiocards.nudge.title', 'Fixe ouvindo'),
  ('audiocards.nudge.body',  'Os mesmos cartões em áudio, para revisar de novo — no trânsito, na academia, sem olhar a tela.'),

  -- AudioCards hub label ("revisão passiva")
  ('audiocards.hub.intro', 'Revisão passiva: os mesmos cartões dos Flashcards, agora em áudio — ouça no trânsito, na academia, onde quiser. Quem agenda a sua revisão espaçada são os Flashcards.'),

  -- Dashboard standing playlist
  ('audiocards.playlist.title',    'Revisão passiva em áudio'),
  ('audiocards.playlist.subtitle', 'Os temas que você estudou nos flashcards, agora em áudio — para fixar no trânsito ou na academia. É só ouvir.'),

  -- Onboarding tip (coachmark + guide) — previously unseeded
  ('onboarding.audiocards.title',  'Como funcionam os AudioCards'),
  ('onboarding.audiocards.body',   'São os mesmos cartões dos **Flashcards**, agora em áudio: ouça a pergunta e a resposta de cada tema sem precisar olhar a tela. Toque em **Transcrição do áudio** para ler junto; avance e volte 15s pelos controles. Sugerimos os áudios da especialidade logo depois das suas sessões de flashcards e no seu painel — é um apoio opcional, é só ouvir, sem marcar nada.'),
  ('onboarding.audiocards.review', 'Os AudioCards são só para escuta — quem agenda a **Revisão** espaçada é o mesmo tema nos **Flashcards**.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
