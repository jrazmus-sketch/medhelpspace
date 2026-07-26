-- Simulado landing — copy for the "Veja por dentro" section (real screenshots).
--
-- Replaces the hand-drawn report mock with actual screenshots of the exam and the
-- report, captured from the running app by scripts/capture-simulado-shots.js.
-- Rationale: eyetracking research finds decorative imagery is skipped while
-- information-carrying images (real product, real content) get read — and this page
-- was asking for an e-mail in exchange for 100 questions nobody could see.
--
-- The sim.preview.* keys from the mock are retired.
--
-- Run with: node scripts/run-sql.js schema-patch-simulado-peek-content.sql
--   local:  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/run-sql.js ...

DELETE FROM site_content WHERE key LIKE 'sim.preview.%';

INSERT INTO site_content (key, value) VALUES
  ('sim.peek.eyebrow',     'Veja por dentro'),
  ('sim.peek.title',       'É exatamente assim que o simulado funciona'),
  ('sim.peek.body',        'Sem enrolação: uma questão por vez, folha de respostas para navegar como no caderno oficial e, ao entregar, um relatório com o seu desempenho em cada grande área.'),
  ('sim.peek.shot_exam',   'Durante a prova: uma questão por vez, sem cronômetro e sem gabarito à mostra.'),
  ('sim.peek.shot_report', 'Ao entregar: sua nota, o desempenho nas cinco grandes áreas e os temas a revisar.'),
  ('sim.peek.figures',     'Como na prova real, algumas questões trazem imagem — eletrocardiograma, radiografia, mamografia, retinografia, gráficos epidemiológicos.')
ON CONFLICT (key) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM site_content WHERE key LIKE 'sim.peek.%';
