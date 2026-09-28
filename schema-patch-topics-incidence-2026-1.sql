-- schema-patch-topics-incidence-2026-1.sql
-- Recount topics.incidence_count from the live past-exam bank (pages.view='quiz',
-- Revalida 2020 → 2026.1, 997 questions on published topic pages) after Karina's
-- September question delivery. Generated 2026-09-27 by a read of prod; idempotent.
--
-- • 67 topics change count (all non-Outros topics now equal the question count of
--   their source quiz page). priority_tier is a generated column → re-tiers itself.
-- • 4 new topics for quiz pages that had no topic row (Karina's new themes).
-- • The 12 Outros sub-topics (pages 90240/90241/90242) keep their hand-verified counts:
--   one page holds several conditions, so they cannot be recounted automatically.
-- • exam_cycle_source → '2020-2026.1' on every topic.
-- Rollback: restore from topics_bk_incidence_20260927 (created below), e.g.
--   UPDATE topics t SET incidence_count = b.incidence_count, exam_cycle_source = b.exam_cycle_source
--   FROM topics_bk_incidence_20260927 b WHERE b.id = t.id;
--   DELETE FROM topics WHERE id NOT IN (SELECT id FROM topics_bk_incidence_20260927);
-- Apply to BOTH databases (prod via run-sql.js, local via DATABASE_URL=…55322).

CREATE TABLE IF NOT EXISTS topics_bk_incidence_20260927 AS SELECT * FROM topics;
ALTER TABLE topics_bk_incidence_20260927 ENABLE ROW LEVEL SECURITY;

UPDATE topics SET incidence_count = 6, updated_at = now() WHERE id = 8 AND incidence_count <> 6; -- Doencas Vasculares: 3 → 6
UPDATE topics SET incidence_count = 6, updated_at = now() WHERE id = 9 AND incidence_count <> 6; -- Hipertensão Arterial: 3 → 6
UPDATE topics SET incidence_count = 5, updated_at = now() WHERE id = 10 AND incidence_count <> 5; -- Síndrome Coronariana Aguda: 3 → 5
UPDATE topics SET incidence_count = 2, updated_at = now() WHERE id = 16 AND incidence_count <> 2; -- Dislipidemias: 1 → 2
UPDATE topics SET incidence_count = 2, updated_at = now() WHERE id = 18 AND incidence_count <> 2; -- Insuficiencia Cardiaca: 1 → 2
UPDATE topics SET incidence_count = 5, updated_at = now() WHERE id = 21 AND incidence_count <> 5; -- Parasitoses Cutâneas: 4 → 5
UPDATE topics SET incidence_count = 4, updated_at = now() WHERE id = 22 AND incidence_count <> 4; -- Farmacodermias: 3 → 4
UPDATE topics SET incidence_count = 10, updated_at = now() WHERE id = 28 AND incidence_count <> 10; -- Intoxicações Exógenas: 7 → 10
UPDATE topics SET incidence_count = 9, updated_at = now() WHERE id = 32 AND incidence_count <> 9; -- Diabetes: 7 → 9
UPDATE topics SET incidence_count = 6, updated_at = now() WHERE id = 33 AND incidence_count <> 6; -- Hipotireoidismo: 5 → 6
UPDATE topics SET incidence_count = 4, updated_at = now() WHERE id = 41 AND incidence_count <> 4; -- Hepatites Virais: 3 → 4
UPDATE topics SET incidence_count = 4, updated_at = now() WHERE id = 47 AND incidence_count <> 4; -- Distúrbio da Hemostasia Primária: 3 → 4
UPDATE topics SET incidence_count = 16, updated_at = now() WHERE id = 55 AND incidence_count <> 16; -- Arboviroses: 13 → 16
UPDATE topics SET incidence_count = 12, updated_at = now() WHERE id = 56 AND incidence_count <> 12; -- Infecção do Trato Urinário: 11 → 12
UPDATE topics SET incidence_count = 3, updated_at = now() WHERE id = 65 AND incidence_count <> 3; -- Úlceras genitais - IST: 2 → 3
UPDATE topics SET incidence_count = 2, updated_at = now() WHERE id = 68 AND incidence_count <> 2; -- Raiva: 1 → 2
UPDATE topics SET incidence_count = 4, updated_at = now() WHERE id = 71 AND incidence_count <> 4; -- Síndrome Nefrótica: 3 → 4
UPDATE topics SET incidence_count = 3, updated_at = now() WHERE id = 73 AND incidence_count <> 3; -- Injúria Renal Aguda: 2 → 3
UPDATE topics SET incidence_count = 16, updated_at = now() WHERE id = 76 AND incidence_count <> 16; -- Patologias da Coluna Vertebral: 15 → 16
UPDATE topics SET incidence_count = 5, updated_at = now() WHERE id = 79 AND incidence_count <> 5; -- Cefaleias: 3 → 5
UPDATE topics SET incidence_count = 6, updated_at = now() WHERE id = 81 AND incidence_count <> 6; -- Infecções Neurológicas: 3 → 6
UPDATE topics SET incidence_count = 3, updated_at = now() WHERE id = 82 AND incidence_count <> 3; -- Delirium: 2 → 3
UPDATE topics SET incidence_count = 2, updated_at = now() WHERE id = 86 AND incidence_count <> 2; -- Demências: 1 → 2
UPDATE topics SET incidence_count = 15, updated_at = now() WHERE id = 87 AND incidence_count <> 15; -- Tuberculose: 14 → 15
UPDATE topics SET incidence_count = 11, updated_at = now() WHERE id = 88 AND incidence_count <> 11; -- Pneumonia: 10 → 11
UPDATE topics SET incidence_count = 7, updated_at = now() WHERE id = 96 AND incidence_count <> 7; -- Psiquiatria na Infancia: 5 → 7
UPDATE topics SET incidence_count = 3, updated_at = now() WHERE id = 101 AND incidence_count <> 3; -- Emergências Psiquiátricas: 2 → 3
UPDATE topics SET incidence_count = 5, updated_at = now() WHERE id = 103 AND incidence_count <> 5; -- Artrite Infecciosa: 4 → 5
UPDATE topics SET incidence_count = 13, updated_at = now() WHERE id = 110 AND incidence_count <> 13; -- Perioperatório: 9 → 13
UPDATE topics SET incidence_count = 8, updated_at = now() WHERE id = 112 AND incidence_count <> 8; -- Queimados: 7 → 8
UPDATE topics SET incidence_count = 7, updated_at = now() WHERE id = 114 AND incidence_count <> 7; -- Hérnias: 6 → 7
UPDATE topics SET incidence_count = 7, updated_at = now() WHERE id = 116 AND incidence_count <> 7; -- Trauma de Tórax: 6 → 7
UPDATE topics SET incidence_count = 6, updated_at = now() WHERE id = 118 AND incidence_count <> 6; -- Feridas Cirúrgicas: 5 → 6
UPDATE topics SET incidence_count = 5, updated_at = now() WHERE id = 125 AND incidence_count <> 5; -- Trauma Abdominal e Pélvico: 3 → 5
UPDATE topics SET incidence_count = 3, updated_at = now() WHERE id = 131 AND incidence_count <> 3; -- Trauma Atendimento Inicial e Vias Aereas: 1 → 3
UPDATE topics SET incidence_count = 14, updated_at = now() WHERE id = 133 AND incidence_count <> 14; -- Anticoncepção: 12 → 14
UPDATE topics SET incidence_count = 15, updated_at = now() WHERE id = 134 AND incidence_count <> 15; -- HPV e Câncer de Colo Uterino: 12 → 15
UPDATE topics SET incidence_count = 11, updated_at = now() WHERE id = 135 AND incidence_count <> 11; -- Câncer de Mama: 9 → 11
UPDATE topics SET incidence_count = 10, updated_at = now() WHERE id = 136 AND incidence_count <> 10; -- Sangramento Uterino Anormal: 9 → 10
UPDATE topics SET incidence_count = 8, updated_at = now() WHERE id = 137 AND incidence_count <> 8; -- Cervicite e Vulvovaginite: 7 → 8
UPDATE topics SET incidence_count = 8, updated_at = now() WHERE id = 138 AND incidence_count <> 8; -- Climatério: 7 → 8
UPDATE topics SET incidence_count = 6, updated_at = now() WHERE id = 139 AND incidence_count <> 6; -- Amenorreia: 5 → 6
UPDATE topics SET incidence_count = 5, updated_at = now() WHERE id = 142 AND incidence_count <> 5; -- Fisiologia Menstrual: 4 → 5
UPDATE topics SET incidence_count = 4, updated_at = now() WHERE id = 146 AND incidence_count <> 4; -- Doença Inflamatória Pélvica: 3 → 4
UPDATE topics SET incidence_count = 2, updated_at = now() WHERE id = 151 AND incidence_count <> 2; -- Doenças Benignas do Útero: 1 → 2
UPDATE topics SET incidence_count = 16, updated_at = now() WHERE id = 152 AND incidence_count <> 16; -- Assistência Pré-Natal: 15 → 16
UPDATE topics SET incidence_count = 11, updated_at = now() WHERE id = 154 AND incidence_count <> 11; -- Assistência Clínica ao Parto: 8 → 11
UPDATE topics SET incidence_count = 9, updated_at = now() WHERE id = 156 AND incidence_count <> 9; -- Sífilis na Gestação: 8 → 9
UPDATE topics SET incidence_count = 9, updated_at = now() WHERE id = 157 AND incidence_count <> 9; -- Puerpério: 7 → 9
UPDATE topics SET incidence_count = 4, updated_at = now() WHERE id = 162 AND incidence_count <> 4; -- Infecção Urinária na Gestação: 3 → 4
UPDATE topics SET incidence_count = 4, updated_at = now() WHERE id = 164 AND incidence_count <> 4; -- Síndromes Hemorrágicas da Gestação: 3 → 4
UPDATE topics SET incidence_count = 3, updated_at = now() WHERE id = 165 AND incidence_count <> 3; -- Gestação Ectópica: 2 → 3
UPDATE topics SET incidence_count = 8, updated_at = now() WHERE id = 170 AND incidence_count <> 8; -- Diarreia e Desidratação: 7 → 8
UPDATE topics SET incidence_count = 8, updated_at = now() WHERE id = 171 AND incidence_count <> 8; -- Distúrbios do Crescimento e Desenvolvimento: 7 → 8
UPDATE topics SET incidence_count = 6, updated_at = now() WHERE id = 174 AND incidence_count <> 6; -- Cirurgia Pediátrica: 5 → 6
UPDATE topics SET incidence_count = 5, updated_at = now() WHERE id = 182 AND incidence_count <> 5; -- Doenca de Kawasaki: 3 → 5
UPDATE topics SET incidence_count = 5, updated_at = now() WHERE id = 183 AND incidence_count <> 5; -- Doencas Exantematicas na Infancia: 3 → 5
UPDATE topics SET incidence_count = 3, updated_at = now() WHERE id = 186 AND incidence_count <> 3; -- Bronquiolite: 2 → 3
UPDATE topics SET incidence_count = 32, updated_at = now() WHERE id = 196 AND incidence_count <> 32; -- Atenção Básica: 30 → 32
UPDATE topics SET incidence_count = 18, updated_at = now() WHERE id = 197 AND incidence_count <> 18; -- Ética Médica / Medicina Legal: 14 → 18
UPDATE topics SET incidence_count = 10, updated_at = now() WHERE id = 198 AND incidence_count <> 10; -- Atenção ao Idoso: 9 → 10
UPDATE topics SET incidence_count = 9, updated_at = now() WHERE id = 200 AND incidence_count <> 9; -- Vigilância Epidemiológica: 7 → 9
UPDATE topics SET incidence_count = 8, updated_at = now() WHERE id = 201 AND incidence_count <> 8; -- Medicina do Trabalho: 6 → 8
UPDATE topics SET incidence_count = 6, updated_at = now() WHERE id = 202 AND incidence_count <> 6; -- Processo Saúde – Doença: 5 → 6
UPDATE topics SET incidence_count = 5, updated_at = now() WHERE id = 203 AND incidence_count <> 5; -- Indicadores de Saude: 4 → 5
UPDATE topics SET incidence_count = 5, updated_at = now() WHERE id = 204 AND incidence_count <> 5; -- Declaração de Óbito: 3 → 5
UPDATE topics SET incidence_count = 3, updated_at = now() WHERE id = 206 AND incidence_count <> 3; -- Estudos Epidemiológicos: 2 → 3

INSERT INTO topics (name, slug, specialty_id, source_page_id, incidence_count, exam_cycle_source)
  VALUES ('Síndrome Inflamatória Multissistêmica Pediátrica', 'sindrome-inflamatoria-multissistemica-pediatrica', 16, 91013, 2, '2020-2026.1')
  ON CONFLICT (slug) DO NOTHING;
INSERT INTO topic_content (topic_id, resource_type, page_id)
  SELECT t.id, 'quiz', 91013 FROM topics t WHERE t.slug = 'sindrome-inflamatoria-multissistemica-pediatrica'
  AND NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = t.id AND c.resource_type = 'quiz' AND c.page_id = 91013);
INSERT INTO topic_content (topic_id, resource_type, page_id)
  SELECT t.id, 'revalida_up', 91011 FROM topics t WHERE t.slug = 'sindrome-inflamatoria-multissistemica-pediatrica'
  AND NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = t.id AND c.resource_type = 'revalida_up' AND c.page_id = 91011);

INSERT INTO topics (name, slug, specialty_id, source_page_id, incidence_count, exam_cycle_source)
  VALUES ('Tromboembolismo Pulmonar', 'tromboembolismo-pulmonar', 10, 91014, 1, '2020-2026.1')
  ON CONFLICT (slug) DO NOTHING;
INSERT INTO topic_content (topic_id, resource_type, page_id)
  SELECT t.id, 'quiz', 91014 FROM topics t WHERE t.slug = 'tromboembolismo-pulmonar'
  AND NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = t.id AND c.resource_type = 'quiz' AND c.page_id = 91014);

INSERT INTO topics (name, slug, specialty_id, source_page_id, incidence_count, exam_cycle_source)
  VALUES ('Icterícia e Hiperbilirrubinemias', 'ictericia-e-hiperbilirrubinemias', 5, 91015, 1, '2020-2026.1')
  ON CONFLICT (slug) DO NOTHING;
INSERT INTO topic_content (topic_id, resource_type, page_id)
  SELECT t.id, 'quiz', 91015 FROM topics t WHERE t.slug = 'ictericia-e-hiperbilirrubinemias'
  AND NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = t.id AND c.resource_type = 'quiz' AND c.page_id = 91015);

INSERT INTO topics (name, slug, specialty_id, source_page_id, incidence_count, exam_cycle_source)
  VALUES ('HIV na Gestação', 'hiv-na-gestacao', 15, 91016, 1, '2020-2026.1')
  ON CONFLICT (slug) DO NOTHING;
INSERT INTO topic_content (topic_id, resource_type, page_id)
  SELECT t.id, 'quiz', 91016 FROM topics t WHERE t.slug = 'hiv-na-gestacao'
  AND NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = t.id AND c.resource_type = 'quiz' AND c.page_id = 91016);
INSERT INTO topic_content (topic_id, resource_type, page_id)
  SELECT t.id, 'revalida_up', 91009 FROM topics t WHERE t.slug = 'hiv-na-gestacao'
  AND NOT EXISTS (SELECT 1 FROM topic_content c WHERE c.topic_id = t.id AND c.resource_type = 'revalida_up' AND c.page_id = 91009);

UPDATE topics SET exam_cycle_source = '2020-2026.1' WHERE exam_cycle_source IS DISTINCT FROM '2020-2026.1';

-- Landing + onboarding copy that quotes the old base (site_content rows WIN over the
-- code fallbacks, so the numbers must change here too). No-op once applied.
UPDATE site_content
   SET value = replace(replace(replace(replace(value,
                 '881 questões', '988 questões'),
                 '553 estão', '622 estão'),
                 '211 temas', '215 temas'),
                 '2020–2025', '2020–2026.1')
 WHERE key IN ('fc.hero.stat', 'fc.why.body', 'onboarding.roteiro.body')
   AND (value LIKE '%881 questões%' OR value LIKE '%553%' OR value LIKE '%211 temas%' OR value LIKE '%2020–2025%');
UPDATE site_content SET value = replace(value, 'concentram 553 questões', 'concentram 622 questões')
 WHERE key = 'fc.why.body' AND value LIKE '%concentram 553 questões%';
