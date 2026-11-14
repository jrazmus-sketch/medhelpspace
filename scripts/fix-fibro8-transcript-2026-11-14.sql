-- Karina 2026-11-14 (e-mail 17h50 BRT, item 1, AUTHORIZED FOR PRODUCTION): Fibromialgia card 8 —
-- make the AudioCard TRANSCRIPT text identical to the Flashcard (id 13794). Text only: the Flashcard
-- and the recording are not touched (the audio already narrates the Flashcard wording).
--   Pergunta: "para diagnosticar fibromialgia"      -> "para o diagnóstico de fibromialgia"
--   Resposta: "a contagem de pontos dolorosos"      -> "a contagem dos pontos dolorosos"
-- Lesson 1609 = reumatologia-audiocards · Fibromialgia. Checked on prod first (both still differ).
-- Guarded: each old phrase must occur exactly once, inside card 8, or nothing changes.
-- Rollback: the two replaces in reverse on lesson 1609.

DO $$
DECLARE
  b text;
  c8 text;
BEGIN
  SELECT body_html INTO b FROM lessons WHERE id = 1609;
  c8 := substr(b, position('<h3 class="ac-card">Card 8</h3>' in b),
               position('<h3 class="ac-card">Card 9</h3>' in b) - position('<h3 class="ac-card">Card 8</h3>' in b));
  IF b IS NULL OR c8 IS NULL OR c8 = ''
     OR (length(b) - length(replace(b, 'obrigatória para diagnosticar fibromialgia atualmente?', ''))) / length('obrigatória para diagnosticar fibromialgia atualmente?') <> 1
     OR (length(b) - length(replace(b, 'mas a contagem de pontos dolorosos à palpação não é requisito', ''))) / length('mas a contagem de pontos dolorosos à palpação não é requisito') <> 1
     OR position('obrigatória para diagnosticar fibromialgia atualmente?' in c8) = 0
     OR position('mas a contagem de pontos dolorosos à palpação não é requisito' in c8) = 0 THEN
    RAISE EXCEPTION 'unexpected state on lesson 1609 - nothing changed';
  END IF;
END $$;

UPDATE lessons
SET body_html = replace(replace(body_html,
      'obrigatória para diagnosticar fibromialgia atualmente?',
      'obrigatória para o diagnóstico de fibromialgia atualmente?'),
      'mas a contagem de pontos dolorosos à palpação não é requisito',
      'mas a contagem dos pontos dolorosos à palpação não é requisito'),
    updated_at = now()
WHERE id = 1609;

DO $$
BEGIN
  IF (SELECT count(*) FROM lessons WHERE id = 1609
        AND position('obrigatória para o diagnóstico de fibromialgia atualmente?' in body_html) > 0
        AND position('mas a contagem dos pontos dolorosos à palpação não é requisito' in body_html) > 0
        AND position('para diagnosticar fibromialgia' in body_html) = 0) <> 1 THEN
    RAISE EXCEPTION 'post-check failed - rolled back';
  END IF;
END $$;
