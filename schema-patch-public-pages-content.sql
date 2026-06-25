-- schema-patch-public-pages-content.sql
--
-- Seeds editable copy for the remaining public pages (loja + auth/transactional
-- pages) into the existing `site_content` key-value table, so the inline editor
-- ("Edição rápida") can edit them like the landing page. Each value MUST match the
-- `<SiteText fallback=…>` in the corresponding component verbatim (the component
-- renders the fallback until this patch is applied, then the row makes it editable).
--
-- Requires schema-patch-site-content.sql (creates `site_content`). Idempotent:
-- ON CONFLICT (key) DO NOTHING preserves any prior edits on re-run.
--
-- Rollback (removes only these keys):
--   DELETE FROM site_content WHERE key LIKE 'loja.%' OR key LIKE 'login.%'
--     OR key LIKE 'signup.%' OR key LIKE 'recuperar.%' OR key LIKE 'reset.%'
--     OR key LIKE 'verify.%';

BEGIN;

INSERT INTO site_content (key, value) VALUES
  -- ── /loja ──────────────────────────────────────────────────────────────────
  ('loja.title',            'Comece sua preparação.'),
  ('loja.subhead',          'Escolha a turma da sua prova. Acesso imediato ao sistema completo.'),
  ('loja.subhead_closed',   'As inscrições para a próxima turma abrem em breve.'),
  ('loja.soon.title',       'Inscrições abertas em breve'),
  ('loja.soon.body',        'Estamos preparando a próxima turma. Volte em breve para garantir sua vaga.'),
  ('loja.trust.access',     'Acesso imediato após confirmação'),
  ('loja.trust.guarantee',  'Garantia incondicional de 7 dias'),
  ('loja.trust.secure',     'Pagamento 100% seguro · PagBank'),
  ('loja.60d.title',        'MedHelp 60D — já incluso em todas as turmas'),
  ('loja.60d.body',         'A fase final do sistema é liberada automaticamente 60 dias antes da sua prova. Você não precisa fazer nada — o acesso abre na hora certa.'),
  ('loja.60d.item.0',       'Revalida Up — mini-resumos: padrão + decisão treinada'),
  ('loja.60d.item.1',       'MemoreCards — cards visuais de alta fixação por especialidade'),
  ('loja.60d.item.2',       'Simulados completos (100 questões) para treinar o dia da prova'),
  ('loja.included.0',       'Estudo por Questões — questões oficiais + simulados comentados'),
  ('loja.included.1',       'Resumos Narrativos — casos clínicos com raciocínio e conduta'),
  ('loja.included.2',       'MedVoice — treinamento de decisão em áudios curtos'),
  ('loja.included.3',       'Fórmula MedHelp — atalhos de prova, macetes e mnemônicos'),
  ('loja.included.4',       'Audiocards — flashcards em áudio com o que já caiu'),
  ('loja.included.5',       'Guia de estudos completo'),
  ('loja.included.6',       'Acesso em celular, tablet e computador'),
  ('loja.included.7',       'Tema claro e escuro'),
  ('loja.included.8',       'Atualizações contínuas'),
  ('loja.included.lock',    'MedHelp 60D — liberado 60 dias antes da prova'),
  ('loja.card.turma',       'Turma'),
  ('loja.card.installments','ou parcele em até 12x no cartão'),
  ('loja.card.cta',         'Comprar agora'),

  -- ── /login ─────────────────────────────────────────────────────────────────
  ('login.title',           'Entrar na plataforma'),

  -- ── /signup ────────────────────────────────────────────────────────────────
  ('signup.title',          'Criar conta'),

  -- ── /recuperar-senha ───────────────────────────────────────────────────────
  ('recuperar.title',       'Recuperar senha'),
  ('recuperar.subtitle',    'Digite seu e-mail e enviaremos um link para redefinir sua senha.'),

  -- ── /reset-password ────────────────────────────────────────────────────────
  ('reset.title',           'Nova senha'),
  ('reset.subtitle',        'Escolha uma nova senha para sua conta.'),

  -- ── /verify ────────────────────────────────────────────────────────────────
  ('verify.title',          'Verifique seu e-mail'),
  ('verify.body',           'Clique no link que enviamos para ativar sua conta. Não recebeu? Reenvie abaixo.'),
  ('verify.invalid.title',  'Link inválido ou expirado'),
  ('verify.invalid.body',   'O link de confirmação não é mais válido. Digite seu e-mail abaixo para receber um novo link.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
