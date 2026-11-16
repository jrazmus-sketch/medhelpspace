-- schema-patch-revalida-up-topic-links.sql
--
-- Karina 2026-11-15 ("Meu Plano – Adicionar Revalida Up aos tipos de conteúdo", item 1 + 3).
--
--   1. The 24 published Revalida Up pages that had NO Meu Plano topic get their link. Each pair is
--      unequivocal: the topic's own Questões section has the same title as the Revalida Up page. No topic is
--      created, renamed or reclassified. The 25th page (Trauma e Infecções Musculoesqueléticas) stays UNLINKED
--      on purpose — pending her editorial review after R2.
--   2. Why they were missing: the links were created ONCE (2026-07-02) by name, and later renames/specialty
--      moves never re-ran it. The link itself is stored by ids (topic_content.topic_id → topics.id,
--      topic_content.page_id → pages.id; the Revalida Up importer updates pages IN PLACE by slug, so the id
--      survives every re-delivery). What was missing was a CHECK. View revalida_up_link_check lists, live:
--        • pagina_sem_tema  — a published Revalida Up page that no topic opens;
--        • vinculo_invalido — a topic link to a page that is not a published Revalida Up page.
--      The admin dashboard shows the count (tile → /admin/revalida-up) and scripts/check-revalida-up-links.js
--      prints it after every import. Nothing is ever linked automatically: ambiguous cases wait for Karina.
--
-- Backup: topic_content_bk_ru (full rows). Rollback: schema-patch-revalida-up-topic-links-rollback.sql. Re-run safe.

BEGIN;

CREATE TABLE IF NOT EXISTS topic_content_bk_ru AS SELECT * FROM topic_content;
ALTER TABLE topic_content_bk_ru ENABLE ROW LEVEL SECURITY;

-- topic id, page id, page title (the title is re-checked: a pair whose page was renamed is skipped and shows
-- up in the check instead of being linked blindly)
CREATE TEMP TABLE _ru_pairs (topic_id bigint, page_id bigint, title text) ON COMMIT DROP;
INSERT INTO _ru_pairs VALUES
  (111, 90061, 'Câncer Colorretal Revalida Up'),
  (128, 90063, 'Câncer de Esôfago Revalida Up'),
  (118, 90122, 'Feridas Cirúrgicas e Traumáticas Revalida Up'),
  (119, 90126, 'Hemorragia Digestiva Revalida Up'),
  (120, 90164, 'Pancreatite Revalida Up'),
  (115, 90209, 'Traumatismo Cranioencefálico Revalida Up'),
  (124, 90212, 'Tumor de Pâncreas Revalida Up'),
  (43, 90214, 'Úlcera Péptica e Helicobacter pylori Revalida Up'),
  (142, 90174, 'Puberdade e Fisiologia Menstrual na Adolescência Revalida Up'),
  (57, 90132, 'HIV/Aids Revalida Up'),
  (72, 90089, 'Distúrbios Hidroeletrolíticos Nefrológicos Revalida Up'),
  (155, 90082, 'Diabetes Gestacional Revalida Up'),
  (185, 90041, 'Alimentação Complementar Revalida Up'),
  (174, 90071, 'Cirurgia Pediátrica Revalida Up'),
  (171, 90076, 'Crescimento e Desenvolvimento Infantil Revalida Up'),
  (181, 90081, 'Desnutrição e Obesidade Revalida Up'),
  (169, 90154, 'Maus-tratos, violência e prevenção de acidentes na infância Revalida Up'),
  (194, 90188, 'Síndrome do Desconforto Respiratório do Recém-Nascido Revalida Up'),
  (93, 90038, 'Abscesso Pulmonar Revalida Up'),
  (204, 90078, 'Declaração de Óbito Revalida Up'),
  (203, 90136, 'Indicadores de Saúde Revalida Up'),
  (202, 90172, 'Processo Saúde-Doença Revalida Up'),
  (201, 90181, 'Saúde do Trabalhador Revalida Up'),
  (200, 90219, 'Vigilância Epidemiológica Revalida Up');

DO $$
BEGIN
  IF (SELECT count(*) FROM _ru_pairs r JOIN pages p ON p.id = r.page_id AND p.title = r.title
        AND p.view = 'revalida-up' AND p.status = 'publish' JOIN topics t ON t.id = r.topic_id) <> 24 THEN
    RAISE EXCEPTION 'Revalida Up links: a page or topic is not as verified on 15/11/2026 - nothing changed';
  END IF;
END $$;

INSERT INTO topic_content (topic_id, resource_type, page_id, note)
SELECT r.topic_id, 'revalida_up', r.page_id, 'Karina 2026-11-15: vínculo inequívoco (título = seção de Questões do tema)'
  FROM _ru_pairs r
 WHERE NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = r.topic_id AND c.resource_type = 'revalida_up');

CREATE OR REPLACE VIEW revalida_up_link_check WITH (security_invoker = true) AS
SELECT 'pagina_sem_tema'::text AS issue, p.id AS page_id, p.slug, p.title, s.name AS specialty,
       NULL::bigint AS topic_id, NULL::text AS topic_name
  FROM pages p LEFT JOIN specialties s ON s.id = p.specialty_id
 WHERE p.view = 'revalida-up' AND p.status = 'publish'
   AND NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.resource_type = 'revalida_up' AND c.page_id = p.id)
UNION ALL
SELECT 'vinculo_invalido', p.id, p.slug, p.title, s.name, t.id, t.name
  FROM topic_content c JOIN topics t ON t.id = c.topic_id JOIN pages p ON p.id = c.page_id
  LEFT JOIN specialties s ON s.id = p.specialty_id
 WHERE c.resource_type = 'revalida_up' AND (p.status <> 'publish' OR p.view IS DISTINCT FROM 'revalida-up');
COMMENT ON VIEW revalida_up_link_check IS
  'Live check of Meu Plano ↔ Revalida Up links (Karina 2026-11-15): published pages no topic opens, and links to '
  'pages that are not published Revalida Up pages. Warns only — links are never created automatically.';
REVOKE ALL ON revalida_up_link_check FROM PUBLIC, anon, authenticated;
GRANT SELECT ON revalida_up_link_check TO service_role;

COMMIT;
