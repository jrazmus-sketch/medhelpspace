-- schema-patch-privacidade-cookie-prefs.sql
-- /privacidade item 6, last sentence (Karina 2026-11-10 23:10 BRT): point to the
-- footer link "Preferências de cookies" instead of "apague os cookies do site no
-- seu navegador". Only this sentence changes; the rest of the row is untouched.
-- Re-run safe: matches only while the old sentence is still there.
-- Rollback: schema-patch-privacidade-cookie-prefs-rollback.sql

UPDATE editable_pages
   SET body_html = replace(
         body_html,
         $old$Para mudar sua escolha, apague os cookies do site no seu navegador ou escreva para $old$,
         $new$Para mudar sua escolha, use o link 'Preferências de cookies', no rodapé do site, ou escreva para $new$),
       updated_at = now()
 WHERE slug = 'privacidade'
   AND body_html LIKE '%Para mudar sua escolha, apague os cookies do site no seu navegador%';
