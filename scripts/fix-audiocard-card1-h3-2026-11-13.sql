-- Karina 2026-11-13 (e-mail 21:34 BRT, item 2/7): restore the "Card 1" heading of two AudioCards
-- from <h4> back to <h3 class="ac-card">. Her own admin saves turned it into <h4>, so the card lost
-- its style on the student page. AUTHORIZED FOR PRODUCTION: only these two headings.
-- Never touches questions, answers, card order or audio files.
--
-- Lessons: 1456 (cirurgia-geral-audiocards · Câncer Colorretal), 1609 (reumatologia-audiocards · Fibromialgia).
-- Guarded: each row must contain exactly one '<h4 class="ac-card">Card 1</h4>' and no
-- '<h3 class="ac-card">Card 1</h3>'; anything else aborts the whole transaction.
-- Rollback: the same replace in reverse (h3 -> h4) on the same two ids.

DO $$
DECLARE
  bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM lessons
  WHERE id IN (1456, 1609)
    AND (
      (length(body_html) - length(replace(body_html, '<h4 class="ac-card">Card 1</h4>', '')))
        / length('<h4 class="ac-card">Card 1</h4>') <> 1
      OR position('<h3 class="ac-card">Card 1</h3>' in body_html) > 0
    );
  IF bad > 0 OR (SELECT count(*) FROM lessons WHERE id IN (1456, 1609)) <> 2 THEN
    RAISE EXCEPTION 'unexpected state on lessons 1456/1609 (% rows not as expected) - nothing changed', bad;
  END IF;
END $$;

UPDATE lessons
SET body_html = replace(body_html, '<h4 class="ac-card">Card 1</h4>', '<h3 class="ac-card">Card 1</h3>')
WHERE id IN (1456, 1609);

DO $$
BEGIN
  IF (SELECT count(*) FROM lessons
      WHERE id IN (1456, 1609)
        AND position('<h3 class="ac-card">Card 1</h3>' in body_html) > 0
        AND position('<h4' in body_html) = 0) <> 2 THEN
    RAISE EXCEPTION 'post-check failed - rolled back';
  END IF;
END $$;
