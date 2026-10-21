-- "Por trás da MedHelpSpace" v4 text (Karina 2026-10-21). Every paragraph changed, so the
-- copy lives under NEW keys (behind.v4_*) — the v3 rows (behind.p1a … p5) stay in place,
-- unused, as the rollback. Values = the fallbacks in components/landing/founder-section.tsx.
-- Idempotent: ON CONFLICT DO NOTHING never overwrites an inline edit.
-- Rollback: DELETE FROM site_content WHERE key LIKE 'behind.v4\_%'; and revert the component.
INSERT INTO site_content (key, value) VALUES
  ('behind.v4_p1',    $$Durante meus anos de estudo, também passei por erros e acertos. Levei tempo para compreender que estudar muitas horas não significa necessariamente aprender melhor. Aprendi a importância de estudar de forma ativa, conectar informações e voltar ao que ainda não havia compreendido.$$),
  ('behind.v4_p2',    $$Mais tarde, ao conhecer de perto diferentes cursos e materiais de preparação para o Revalida, senti falta de algo que, para mim, era essencial: uma experiência de estudo realmente conectada à maneira como o INEP cobra o conhecimento médico.$$),
  ('behind.v4_p3a',   $$Foi então que comecei a me fazer uma pergunta:$$),
  ('behind.v4_p3_em', $$e se, em vez de partir de uma sequência de aulas, a preparação começasse pelas próprias provas?$$),
  ('behind.v4_p4',    $$Dessa pergunta nasceu a MedHelpSpace.$$),
  ('behind.v4_p5',    $$Meu trabalho começa pela análise das questões do Revalida. Observo como os temas reaparecem ao longo dos anos, como as pistas mudam e quais informações são decisivas para chegar à resposta. Essa análise orienta a organização dos conteúdos e a forma como eles se conectam.$$),
  ('behind.v4_p6',    $$Quis reunir diferentes maneiras de estudar um mesmo assunto, permitindo que questões, revisões, recursos visuais e áudios se complementassem. Não para preencher horas com mais material, mas para que cada etapa do estudo tivesse um propósito.$$),
  ('behind.v4_p7_em', $$Meu objetivo foi criar a experiência de preparação que eu gostaria de ter encontrado: uma plataforma construída a partir da prova, com atenção ao raciocínio, à revisão e ao tempo de quem estuda.$$),
  ('behind.v4_p8',    $$Sei que o Revalida representa muito mais do que uma avaliação. Por trás de cada candidato existe uma trajetória, um esforço e um projeto de vida.$$),
  ('behind.v4_p9_em', $$É com respeito a tudo isso que conduzo a MedHelpSpace, com o cuidado e a responsabilidade que essa etapa da sua trajetória merece.$$)
ON CONFLICT (key) DO NOTHING;

