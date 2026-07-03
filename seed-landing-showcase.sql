-- Landing "Por dentro da plataforma" desktop-showcase section copy.
-- Seeding these rows is what makes the section's <SiteText> editable in the
-- front-page visual editor (an unseeded key renders the fallback as plain,
-- non-editable text). Values mirror the component fallbacks exactly.
-- Idempotent upsert by key. Apply with:
--   node scripts/run-sql.js seed-landing-showcase.sql            (prod)
--   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/run-sql.js seed-landing-showcase.sql   (local)

INSERT INTO site_content (key, value) VALUES
  -- Section header
  ('showcase.eyebrow',  $$Por dentro da plataforma$$),
  ('showcase.headline', $$Feito para o computador também.$$),
  ('showcase.body',     $$Você já viu no celular. Na tela grande, cada recurso ganha espaço — questões comentadas, áudios com transcrição, relatórios e o módulo dos últimos 60 dias. Veja como é estudar por dentro.$$),

  -- Per-slide captions (title + caption), keyed by the slide's stable id
  ('showcase.painel.title',          $$Seu painel de estudos$$),
  ('showcase.painel.caption',        $$Contagem regressiva, plano do dia e todo o seu progresso em uma só tela.$$),
  ('showcase.questoes.title',        $$Questões comentadas$$),
  ('showcase.questoes.caption',      $$Provas do Revalida com gabarito, comentário completo e o “pega” de cada questão.$$),
  ('showcase.resumos.title',         $$Resumos narrativos$$),
  ('showcase.resumos.caption',       $$Clínica em cena: o que mais cai, contado como história para fixar de verdade.$$),
  ('showcase.medvoice.title',        $$MedVoice — a clínica fala$$),
  ('showcase.medvoice.caption',      $$Áudios por tema com transcrição sincronizada, para estudar no seu ritmo.$$),
  ('showcase.especialidade.title',   $$Tudo por especialidade$$),
  ('showcase.especialidade.caption', $$Questões, resumos, áudios e flashcards de cada área, reunidos em um só lugar.$$),
  ('showcase.relatorio.title',       $$Relatório de desempenho$$),
  ('showcase.relatorio.caption',     $$Acertos, sequência, mapa de atividade e seus pontos fracos por especialidade.$$),
  ('showcase.medhelp-60d.title',     $$MedHelp 60D$$),
  ('showcase.medhelp-60d.caption',   $$O módulo intensivo que abre nos últimos 60 dias antes da prova.$$)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
