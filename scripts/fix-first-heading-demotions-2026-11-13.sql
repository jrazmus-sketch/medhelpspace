-- NOT YET AUTHORIZED — run only after Karina's written OK.
-- Same editor slip as the AudioCards "Card 1" headings (scripts/fix-audiocard-card1-h3-2026-11-13.sql):
-- a heading command run while the cursor sat at the start of the text turned the FIRST block into <h4>.
-- Found by a read-only scan of every lesson saved since 2026-11-01 (parsed/reorganizacao/run4/h4scan.js):
--   1436 valvopatias-revalida-up    <h2>CaiuNaProva – Valvopatias</h2>   saved 13/11 18:41 BRT
--   1289 choque-revalida-up         <h2>CaiuNaProva – Choque</h2>        saved 13/11 18:49 BRT
--   1420 tireotoxicose-revalida-up  <h2>CaiuNaProva – Tireotoxicose</h2> saved 13/11 18:51 BRT
--     (the other 191 Revalida Up pages all start with <h2>)
--   436  cardiologia-medvoice, lesson 1 (Bradiarritmias): the "MedVoice – A Clínica Fala" intro line was a <p>
--     at migration (parsed/lessons.sql, WP 3606) like every other MedVoice lesson; saved as <h4> 08/11 23:53 BRT.
-- Only the first block changes (exact-prefix match). Text, other headings, order and audio untouched.
-- Guarded: aborts unless all four rows still start with exactly the demoted block.
-- Rollback: swap the prefixes back (same four ids).

DO $$
BEGIN
  IF (SELECT count(*) FROM lessons WHERE
        (id = 1436 AND starts_with(body_html, '<h4>CaiuNaProva – Valvopatias</h4>')) OR
        (id = 1289 AND starts_with(body_html, '<h4>CaiuNaProva – Choque</h4>')) OR
        (id = 1420 AND starts_with(body_html, '<h4>CaiuNaProva – Tireotoxicose</h4>')) OR
        (id = 436  AND starts_with(body_html, '<h4><strong><span style="color: #7e04bf;">MedVoice – A Clínica Fala</span></strong><span style="color: #7e04bf;"><span style="font-weight: 400;"><br>MedHelpSpace Revalida</span></span></h4>'))
     ) <> 4 THEN
    RAISE EXCEPTION 'unexpected state - nothing changed';
  END IF;
END $$;

UPDATE lessons SET body_html = '<h2>CaiuNaProva – Valvopatias</h2>' || substr(body_html, length('<h4>CaiuNaProva – Valvopatias</h4>') + 1) WHERE id = 1436;
UPDATE lessons SET body_html = '<h2>CaiuNaProva – Choque</h2>' || substr(body_html, length('<h4>CaiuNaProva – Choque</h4>') + 1) WHERE id = 1289;
UPDATE lessons SET body_html = '<h2>CaiuNaProva – Tireotoxicose</h2>' || substr(body_html, length('<h4>CaiuNaProva – Tireotoxicose</h4>') + 1) WHERE id = 1420;
UPDATE lessons SET body_html =
  '<p><strong><span style="color: #7e04bf;">MedVoice – A Clínica Fala</span></strong><span style="color: #7e04bf;"><span style="font-weight: 400;"><br>MedHelpSpace Revalida</span></span></p>'
  || substr(body_html, length('<h4><strong><span style="color: #7e04bf;">MedVoice – A Clínica Fala</span></strong><span style="color: #7e04bf;"><span style="font-weight: 400;"><br>MedHelpSpace Revalida</span></span></h4>') + 1)
WHERE id = 436;

DO $$
BEGIN
  IF (SELECT count(*) FROM lessons WHERE id IN (1436, 1289, 1420) AND body_html ~ '^<h2>CaiuNaProva – ') <> 3
     OR (SELECT count(*) FROM lessons WHERE id = 436 AND starts_with(body_html, '<p><strong><span style="color: #7e04bf;">MedVoice')) <> 1 THEN
    RAISE EXCEPTION 'post-check failed - rolled back';
  END IF;
END $$;
