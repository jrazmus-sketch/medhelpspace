-- schema-patch-privacidade-whatsapp.sql
-- Privacy policy: the WhatsApp paragraph (Karina, 2026-09-28). She asked to review
-- the text BEFORE it is published — do NOT apply until she approves it. The same
-- text lives in the code fallback of app/src/app/privacidade/page.tsx.
--
-- Inserts section 7 right before the closing "Para exercer seus direitos" paragraph
-- of the live editable_pages row (which is what /privacidade renders). Idempotent:
-- skipped when the section is already there. After applying, the page refreshes
-- within the hour (ISR) or immediately via an inline edit / revalidatePath.
-- Rollback: remove the '<h2>7. Comunicações pelo WhatsApp</h2>…</p>' block.

UPDATE editable_pages
   SET body_html = replace(
         body_html,
         '<p>Para exercer seus direitos',
         '<h2>7. Comunicações pelo WhatsApp</h2>'
         || '<p>Ao deixar seu e-mail em uma de nossas páginas gratuitas, você pode, opcionalmente, informar o seu número de WhatsApp e autorizar o recebimento de mensagens da MedHelpSpace com materiais e conteúdos educacionais, novidades, ofertas, descontos e cupons. O número só é coletado com o seu consentimento expresso, registrado com data, hora e a versão do texto aceito, e é usado exclusivamente para essas comunicações. Não compartilhamos o seu número com terceiros.</p>'
         || '<p>Você pode cancelar a qualquer momento: basta responder <strong>SAIR</strong> a qualquer mensagem, fazer qualquer pedido claro nesse sentido pelo próprio WhatsApp, ou escrever para <a href="mailto:contato@medhelpspace.com.br">contato@medhelpspace.com.br</a>. Registramos a revogação e deixamos de enviar mensagens.</p>'
         || '<p>Para exercer seus direitos'
       ),
       updated_at = now()
 WHERE slug = 'privacidade'
   AND body_html NOT LIKE '%Comunicações pelo WhatsApp%';
