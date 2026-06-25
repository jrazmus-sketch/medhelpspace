-- schema-patch-editable-pages.sql
--
-- Adds `editable_pages`: DB-backed bodies for long-form public pages that were
-- previously hardcoded React (Política de Privacidade, Termos de Uso). Each row
-- is one public page, addressed by a stable `slug` ('privacidade', 'termos').
--
-- Unlike `site_content` (one short marketing string per row, plain text), legal
-- documents are rewritten wholesale, so each page is a single editable rich-HTML
-- body plus a plain title. The front-end inline editor ("Edição rápida") writes
-- `title` (plain) and `body_html` (HTML, re-sanitized server-side via lib/sanitize
-- in actions/inline-edit.ts) exactly like it does for pages/lessons.
--
-- Why a table: EditableText can only edit DB-backed rows. The pages keep their
-- original markup as a hardcoded fallback (rendered when the row is absent or in
-- mock mode), so they still render correctly before this patch is applied; once
-- applied, the title + body become editable.
--
-- Idempotent (safe to re-run): table + policies use IF NOT EXISTS / DROP-IF-EXISTS,
-- seed uses ON CONFLICT (slug) DO NOTHING so existing edits are preserved.
--
-- Rollback:
--   DROP TABLE IF EXISTS editable_pages;

BEGIN;

CREATE TABLE IF NOT EXISTS editable_pages (
  id          SERIAL       PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  title       TEXT         NOT NULL,
  body_html   TEXT         NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE editable_pages ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read — these are public pages.
DROP POLICY IF EXISTS editable_pages_select_all ON editable_pages;
CREATE POLICY editable_pages_select_all ON editable_pages
  FOR SELECT USING (true);

-- Writes restricted to super_admin / content_admin. The inline-edit server action
-- goes through the service-role client (RLS-bypassing) so this is defense-in-depth
-- for any future non-admin writer.
DROP POLICY IF EXISTS editable_pages_update_admin ON editable_pages;
CREATE POLICY editable_pages_update_admin ON editable_pages
  FOR UPDATE USING (current_user_role() IN ('super_admin', 'content_admin'));

-- Seed the two legal pages. body_html / title must stay in sync with the
-- hardcoded fallbacks in app/src/app/{privacidade,termos}/page.tsx. ON CONFLICT
-- preserves any prior edits on re-run.
INSERT INTO editable_pages (slug, title, body_html) VALUES
  (
    'privacidade',
    'Política de privacidade',
    '<p class="text-sm text-muted-foreground">Última atualização: maio de 2026</p>'
    '<p>Esta política descreve como o MedHelpSpace coleta, usa e protege as informações dos usuários da plataforma.</p>'
    '<h2>1. Dados coletados</h2>'
    '<p>Coletamos nome, endereço de e-mail e dados de uso da plataforma (progresso em questões, flashcards e aulas). Não coletamos dados sensíveis de saúde.</p>'
    '<h2>2. Uso das informações</h2>'
    '<p>Os dados são utilizados para fornecer e melhorar o serviço, personalizar a experiência de aprendizado e enviar comunicações relacionadas à conta.</p>'
    '<h2>3. Compartilhamento</h2>'
    '<p>Não vendemos nem compartilhamos seus dados pessoais com terceiros, exceto quando exigido por lei ou para operar serviços essenciais da plataforma (ex.: processamento de pagamento).</p>'
    '<h2>4. Segurança</h2>'
    '<p>Utilizamos criptografia e boas práticas de segurança para proteger suas informações. O acesso aos dados é restrito à equipe autorizada.</p>'
    '<h2>5. Seus direitos (LGPD)</h2>'
    '<p>Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento.</p>'
    '<h2>6. Cookies</h2>'
    '<p>Utilizamos cookies técnicos necessários para o funcionamento da plataforma, como manutenção de sessão. Não utilizamos cookies de rastreamento para publicidade.</p>'
    '<p>Para exercer seus direitos ou tirar dúvidas, entre em contato em <a href="mailto:contato@medhelpspace.com.br">contato@medhelpspace.com.br</a></p>'
  ),
  (
    'termos',
    'Termos de uso',
    '<p class="text-sm text-muted-foreground">Última atualização: maio de 2026</p>'
    '<p>Ao utilizar a plataforma MedHelpSpace, você concorda com os termos descritos neste documento. Leia com atenção antes de criar sua conta.</p>'
    '<h2>1. Uso da plataforma</h2>'
    '<p>A plataforma é destinada exclusivamente a médicos e estudantes de medicina que se preparam para o exame Revalida. O acesso é pessoal e intransferível.</p>'
    '<h2>2. Propriedade intelectual</h2>'
    '<p>Todo o conteúdo disponível na plataforma — textos, questões, flashcards, áudios e imagens — é de propriedade exclusiva do MedHelpSpace e protegido por lei. É proibida a reprodução ou distribuição sem autorização prévia.</p>'
    '<h2>3. Responsabilidades</h2>'
    '<p>O usuário é responsável pela segurança de suas credenciais de acesso e pelo uso adequado da plataforma. O MedHelpSpace não se responsabiliza por resultados em provas ou concursos.</p>'
    '<h2>4. Cancelamento</h2>'
    '<p>O acesso pode ser cancelado a qualquer momento pelo usuário. Não há reembolso proporcional após a ativação do plano.</p>'
    '<h2>5. Alterações</h2>'
    '<p>Estes termos podem ser atualizados periodicamente. O uso continuado da plataforma após a publicação de alterações constitui aceite dos novos termos.</p>'
    '<p>Dúvidas? Entre em contato em <a href="mailto:contato@medhelpspace.com.br">contato@medhelpspace.com.br</a></p>'
  )
ON CONFLICT (slug) DO NOTHING;

COMMIT;
