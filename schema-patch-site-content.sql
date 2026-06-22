-- schema-patch-site-content.sql
--
-- Adds `site_content`: a key-value store for the editable marketing copy on the
-- public landing page (`/`). Each row is one user-facing string, addressed by a
-- stable `key` slug (e.g. "hero.headline"). The front-end inline editor
-- (EditableText / "Edição rápida") writes to `value`, exactly like it does for
-- pages/lessons/simulado_sections.
--
-- Why a table: landing copy was hardcoded across ~8 components
-- (app/src/components/landing/*). EditableText can only edit DB-backed rows, so
-- each editable string is promoted to a row here. Components keep the same text
-- as a fallback (see <SiteText fallback=…>), so the page still renders correctly
-- before this patch is applied; once applied, those strings become editable.
--
-- `key` is a stable slug; only `value` is editable. Keys ending in numeric
-- segments (faq.0.q, pricing.included.0) are POSITIONAL — they line up with the
-- order of the corresponding JS array in the component. Reordering that array in
-- code would remap keys to values; reordering is a code change, not a content edit.
--
-- Idempotent (safe to re-run): table + policies use IF NOT EXISTS / DROP-IF-EXISTS,
-- seed uses ON CONFLICT (key) DO NOTHING so existing edits are preserved.
--
-- Rollback:
--   DROP TABLE IF EXISTS site_content;

BEGIN;

CREATE TABLE IF NOT EXISTS site_content (
  id          SERIAL       PRIMARY KEY,
  key         TEXT         UNIQUE NOT NULL,
  value       TEXT         NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read — these are public marketing strings.
DROP POLICY IF EXISTS site_content_select_all ON site_content;
CREATE POLICY site_content_select_all ON site_content
  FOR SELECT USING (true);

-- Writes restricted to super_admin / content_admin. The inline-edit server
-- action goes through the service-role client (RLS-bypassing) so this is
-- defense-in-depth for any future non-admin writer.
DROP POLICY IF EXISTS site_content_update_admin ON site_content;
CREATE POLICY site_content_update_admin ON site_content
  FOR UPDATE USING (current_user_role() IN ('super_admin', 'content_admin'));

-- Seed the canonical rows. ON CONFLICT preserves any prior edits on re-run.
-- Values must match the <SiteText fallback=…> in the components verbatim.
INSERT INTO site_content (key, value) VALUES
  -- Hero
  ('hero.eyebrow',            'Prepare-se para o Revalida'),
  ('hero.headline',           'É um sistema de aprovação.'),
  ('hero.subhead',            'Não é curso. Não é videoaula. É o método que treina o raciocínio que o Revalida cobra.'),
  ('hero.cta',                'Comprar Agora →'),
  ('hero.secondary',          'Ver o sistema ↓'),
  ('hero.trust1',             'Acesso imediato'),
  ('hero.trust2',             'Garantia de 7 dias'),
  ('hero.trust3',             'Pagamento via PagBank'),

  -- Problem
  ('problem.eyebrow',         'O problema'),
  ('problem.headline1',       'O Revalida não derruba por falta de esforço.'),
  ('problem.headline2',       'Ele derruba quando o esforço vira volume.'),
  ('problem.body',            'Muito conteúdo, pouca decisão, pouca fixação. A virada é simples: você não precisa de mais horas. Você precisa de método.'),

  -- Features (cinematic) — section header
  ('features.eyebrow',        'O que está incluído'),
  ('features.title1',         'Um sistema completo.'),
  ('features.title2',         'Cinco ferramentas.'),
  -- Features — per tool
  ('features.questoes.name',     'Estudo por Questões'),
  ('features.questoes.tagline',  'Treino real de Revalida: resolver, entender e acertar mais.'),
  ('features.questoes.body',     'Você faz questões oficiais por tema com comentários que mostram o raciocínio, a pegadinha e a conduta que marca ponto. Reforça com simulados inéditos comentados no mesmo padrão.'),
  ('features.questoes.result',   'Você treina o que cai, do jeito que cai — reduz pegadinhas e ganha segurança.'),
  ('features.resumos.name',      'Resumos Narrativos'),
  ('features.resumos.tagline',   'Clínica em cena: menos teoria solta, mais raciocínio que vira acerto.'),
  ('features.resumos.body',      'Você acompanha o caso, reconhece o padrão, entende o raciocínio e fecha com a conduta do jeito que cai. No final: o que a prova quer + checklist de revisão rápida.'),
  ('features.resumos.result',    'Menos decoreba, mais clareza — e mais acertos sob pressão.'),
  ('features.medvoice.name',     'MedVoice'),
  ('features.medvoice.tagline',  'Não é aula. É treinamento de decisão — em áudios curtos.'),
  ('features.medvoice.body',     'Você entra numa cena clínica, aprende o raciocínio que cai, identifica a pegadinha e sai com a conduta pronta na cabeça. Cena → diagnóstico → pegadinhas → conduta → grito da prova.'),
  ('features.medvoice.result',   'Revisão rápida, todo dia, sem enrolação — resposta mais automática na prova.'),
  ('features.formula.name',      'Fórmula MedHelp'),
  ('features.formula.tagline',   'Não é resumo. É atalho de prova — em dicas curtas e diretas.'),
  ('features.formula.body',      'Você pega o tema que já caiu, vê onde a banca tenta te derrubar e grava a resposta certa em segundos. Com macetes, mnemônicos e frases-chave que fixam.'),
  ('features.formula.result',    'Você reduz erro bobo, ganha velocidade — e marca certo quando a banca tenta te confundir.'),
  ('features.audiocards.name',   'Audiocards'),
  ('features.audiocards.tagline','Flashcards em áudio com o que já caiu na prova.'),
  ('features.audiocards.body',   'Para revisar em qualquer lugar, de forma leve, rápida e constante — do jeito que fixa. Áudios curtos e objetivos, só temas recorrentes do Revalida.'),
  ('features.audiocards.result', 'Revisão rápida em qualquer momento do dia — conteúdo vivo na cabeça na hora da prova.'),

  -- MedHelp 60D
  ('sixtyd.eyebrow',          'MedHelp 60D'),
  ('sixtyd.headline1',        'Fase final do sistema.'),
  ('sixtyd.headline2',        'Liberada 60 dias antes da prova.'),
  ('sixtyd.body',             'Aqui você revisa padrões recorrentes do INEP e as variações que a prova pode trazer, sem se perder em excesso. Já incluso na compra — libera automaticamente.'),
  ('sixtyd.item1.name',       'Revalida Up'),
  ('sixtyd.item1.desc',       'Mini-resumos: padrão + decisão treinada'),
  ('sixtyd.item2.name',       'MemoreCards'),
  ('sixtyd.item2.desc',       'Cards visuais de alta fixação por especialidade'),
  ('sixtyd.item3.name',       'Simulados 100Q'),
  ('sixtyd.item3.desc',       'Treino completo do dia da prova'),

  -- Pricing
  ('pricing.eyebrow',         'Comece sua preparação'),
  ('pricing.headline',        'Escolha sua turma.'),
  ('pricing.subhead',         'O sistema é o mesmo — a turma define o seu calendário de preparação.'),
  ('pricing.cohortPrompt',    'Qual é a sua prova?'),
  ('pricing.installments',    'ou parcele em até 12x no cartão'),
  ('pricing.included.0',      'Estudo por Questões'),
  ('pricing.included.1',      'Resumos Narrativos'),
  ('pricing.included.2',      'MedVoice'),
  ('pricing.included.3',      'Fórmula MedHelp'),
  ('pricing.included.4',      'Audiocards'),
  ('pricing.included.5',      'MedHelp 60D — liberado 60 dias antes'),
  ('pricing.included.6',      'Acesso em celular, tablet e computador'),
  ('pricing.included.7',      'Atualizações contínuas'),
  ('pricing.cta',             'Comprar Agora →'),
  ('pricing.trust1',          '✓ Acesso imediato'),
  ('pricing.trust2',          '✓ Garantia incondicional de 7 dias'),
  ('pricing.trust3',          '✓ Pagamento 100% seguro · PagBank'),
  ('pricing.soon.eyebrow',    'Inscrições'),
  ('pricing.soon.headline',   'Inscrições abertas em breve'),
  ('pricing.soon.body',       'Estamos preparando a próxima turma. Volte em breve para garantir sua vaga.'),

  -- FAQ
  ('faq.eyebrow',             'Dúvidas frequentes'),
  ('faq.title',               'Perguntas Frequentes'),
  ('faq.0.q',  'Para quem o MedHelpSpace foi feito?'),
  ('faq.0.a',  'Para quem quer passar com método: rotina corrida ou não, treino do jeito que cai, menos pegadinha e mais segurança — sem conteúdo infinito.'),
  ('faq.1.q',  'O que diferencia o MedHelpSpace dos outros cursos?'),
  ('faq.1.a',  'Aqui você não compra aula — você entra num sistema de aprovação. O foco é marcar ponto: treino por padrões, revisão objetiva e repetição que fixa. E você ainda recebe algo que quase ninguém entrega: MemoreCards exclusivos no MedHelp 60D + simulados completos para treinar o dia da prova.'),
  ('faq.2.q',  'O que eu recebo ao me inscrever?'),
  ('faq.2.a',  'Acesso imediato ao sistema completo: Estudos por Questões, Resumos Narrativos, MedVoice, Audiocards e Fórmula MedHelp. O MedHelp 60D já está incluído na compra — liberado automaticamente 60 dias antes da prova.'),
  ('faq.3.q',  'O acesso é imediato?'),
  ('faq.3.a',  'Sim. Pagamento confirmado, você entra e já começa.'),
  ('faq.4.q',  'Serve para qual edição do Revalida?'),
  ('faq.4.a',  'Você escolhe a turma e estuda com o sistema organizado para a sua janela de prova. Disponíveis: Revalida 2026.2 e 2027.1.'),
  ('faq.5.q',  'Preciso ter muito tempo livre?'),
  ('faq.5.a',  'Não. Foi feito para rotina real: blocos curtos, constância e treino objetivo. Você faz no seu ritmo, mesmo com faculdade, plantões e trabalho.'),
  ('faq.6.q',  'O MedHelp 60D é liberado quando?'),
  ('faq.6.a',  '60 dias antes da prova — revisão final guiada com MemoreCards exclusivos, Revalida Up e simulados completos (100 questões).'),
  ('faq.7.q',  'Posso acessar pelo celular?'),
  ('faq.7.a',  'Sim. Celular, tablet ou computador. Com tema claro ou escuro, do jeito que você preferir estudar.'),
  ('faq.8.q',  'Quais são as formas de pagamento?'),
  ('faq.8.a',  'Pix e cartão de crédito (parcelamento em até 12x diretamente no checkout). Processamento 100% seguro via PagBank.'),
  ('faq.9.q',  'Tem garantia?'),
  ('faq.9.a',  'Sim. Garantia incondicional de 7 dias. Você pode solicitar reembolso total dentro desse prazo, sem precisar justificar.'),
  ('faq.10.q', 'Tem atualizações?'),
  ('faq.10.a', 'Sim. O MedHelpSpace é atualizado continuamente — sempre que a prova muda o jeito de cobrar, a gente ajusta o treino.'),
  ('faq.11.q', 'Como funciona o suporte?'),
  ('faq.11.a', 'Você tem canal de suporte para acesso, pagamento e uso da plataforma.'),

  -- Footer
  ('footer.tagline',          'Sistema de aprovação para o Revalida — treino direto ao ponto, do jeito que a prova cobra.'),
  ('footer.copyright',        '© 2026 MedHelpSpace. Todos os direitos reservados.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
