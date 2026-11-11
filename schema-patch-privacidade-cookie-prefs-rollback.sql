-- schema-patch-privacidade-cookie-prefs-rollback.sql
-- Restores the previous item 6 last sentence of /privacidade.

UPDATE editable_pages
   SET body_html = replace(
         body_html,
         $new$Para mudar sua escolha, use o link 'Preferências de cookies', no rodapé do site, ou escreva para $new$,
         $old$Para mudar sua escolha, apague os cookies do site no seu navegador ou escreva para $old$),
       updated_at = now()
 WHERE slug = 'privacidade'
   AND body_html LIKE '%use o link ''Preferências de cookies'', no rodapé do site%';
