-- schema-patch-orphan-content-repair.sql
--
-- Repairs the 391 orphan content pages whose specialty_id was NULL because
-- the original parser only knew 12 of the 17 specialties. Topics were classified
-- by clinical area (see orphan-specialty-mapping.csv). 9 ambiguous placements
-- are tracked in memory: project_ambiguous_specialty_placements.md
--
-- Also creates 15 new blurb-nav-hub pages (Cirurgia Geral, Ginecologia,
-- Obstetrícia, Pediatria, Saúde Coletiva × simulados/resumos/formula) plus
-- the nav_items that link each to its content, so these specialties show up
-- in /app/simulados, /app/resumos, and /app/formula-medhelp.
--
-- After this runs the simulados/resumos/formula grids show 17 specialties, not 12.
-- Reversible: each statement has an idempotency guard.

BEGIN;

-- ── 1. Assign specialty_id to orphan content pages (391 pages) ──

UPDATE pages SET specialty_id = 1 WHERE id IN (671,685) AND specialty_id IS NULL;  -- Cardiologia (2 pages)

UPDATE pages SET specialty_id = 7 WHERE id IN (3081) AND specialty_id IS NULL;  -- Infectologia (1 pages)

UPDATE pages SET specialty_id = 11 WHERE id IN (3153) AND specialty_id IS NULL;  -- Psiquiatria (1 pages)

UPDATE pages SET specialty_id = 12 WHERE id IN (3252) AND specialty_id IS NULL;  -- Reumatologia (1 pages)

UPDATE pages SET specialty_id = 13 WHERE id IN (362,365,368,371,374,377,380,383,386,390,393,396,399,409,1267,1271,1275,1281,1287,1432,1439,1460,1938,1939,1940,1945,1953,1956,1970,1982,1988,2066,2401,2405,2409,2416,2419,2422,2426,2429,2431,2434,2438,2441,2445,2448,2451,2454,2457,2728,2745,2783,3283,3286,3289,3292,3295,3300,3303,3306,3309,3312,3315,3318,3321,3325,3328,3331,3334,3339,3343,3346,3349,3352,3355,3358,3547,3562,3602,4213,4217,4220,4223,4227,4231,4234,4237,4240,4244,4247,4250,4253,4259,4264,4267,4270,4273,4275,4277,4280,4283,4286,4289,4507,4520,4555,5849,6115,7630,9810) AND specialty_id IS NULL;  -- Cirurgia Geral (110 pages)

UPDATE pages SET specialty_id = 14 WHERE id IN (412,415,418,424,428,436,442,445,1336,1339,1344,1351,1356,1365,1369,1372,1375,1379,2470,2474,2477,2480,2483,2487,2490,2493,2497,2500,2503,2506,2509,2512,2515,2519,2522,2526,2529,3362,3365,3368,3375,3380,3383,3386,3389,3393,3398,3401,3404,3407,3410,3413,3416,3419,3422,3427,4328,4332,4335,4338,4341,4344,4347,4350,4353,4356,4360,4363,4366,4369,4372,4376,4379,4382,4385,10712) AND specialty_id IS NULL;  -- Ginecologia (76 pages)

UPDATE pages SET specialty_id = 15 WHERE id IN (452,455,471,475,478,481,486,493,497,1390,1393,1397,1401,1404,1407,1410,1413,2574,2579,2582,2586,2589,2592,2595,2599,2602,2605,2608,2611,2614,2618,2621,2624,2627,3472,3475,3478,3481,3484,3487,3490,3493,3496,3500,3503,3506,3509,3512,3515,3518,3521,4427,4430,4433,4436,4443,4446,4449,4453,4457,4460,4463,4466,4470,4473,4476,4479,4482,6259) AND specialty_id IS NULL;  -- Obstetrícia (69 pages)

UPDATE pages SET specialty_id = 16 WHERE id IN (500,503,506,509,513,528,532,540,548,553,557,560,563,1426,1429,1436,1442,1445,1450,1454,2706,2709,2712,2715,2719,2722,2725,2731,2734,2737,2748,2752,2756,2759,2763,2766,2769,2773,2777,2780,3526,3529,3532,3535,3538,3541,3544,3552,3555,3559,3568,3572,3575,3579,3582,3586,3589,3592,3595,3598,4486,4489,4492,4495,4498,4501,4504,4510,4513,4517,4523,4527,4531,4534,4537,4540,4543,4546,4549,4552,6358,6365) AND specialty_id IS NULL;  -- Pediatria (82 pages)

UPDATE pages SET specialty_id = 17 WHERE id IN (566,573,577,584,588,592,596,600,1474,2533,2536,2539,2542,2545,2548,2551,2554,2557,2560,2564,3431,3435,3438,3441,3444,3447,3450,3453,3456,3459,3462,4390,4395,4398,4401,4404,4407,4411,4414,4417,4420,4423,6344,10920) AND specialty_id IS NULL;  -- Saúde Coletiva (44 pages)

-- ── 2. Create 15 new blurb-nav-hub pages for the 5 missing specialties ──
-- Synthetic ids in 90001-90015 range to clearly distinguish from WP-imported pages.

INSERT INTO pages (id, slug, title, type, status, specialty_id, view) VALUES
  (90001, 'cirurgia-geral-simulados', 'Cirurgia Geral Simulados', 'blurb-nav-hub', 'publish', 13, 'simulados'),
  (90002, 'cirurgia-geral-resumos', 'Cirurgia Geral Resumos', 'blurb-nav-hub', 'publish', 13, 'resumos'),
  (90003, 'cirurgia-geral-formula', 'Cirurgia Geral Formula', 'blurb-nav-hub', 'publish', 13, 'formula'),
  (90004, 'ginecologia-simulados', 'Ginecologia Simulados', 'blurb-nav-hub', 'publish', 14, 'simulados'),
  (90005, 'ginecologia-resumos', 'Ginecologia Resumos', 'blurb-nav-hub', 'publish', 14, 'resumos'),
  (90006, 'ginecologia-formula', 'Ginecologia Formula', 'blurb-nav-hub', 'publish', 14, 'formula'),
  (90007, 'obstetricia-simulados', 'Obstetrícia Simulados', 'blurb-nav-hub', 'publish', 15, 'simulados'),
  (90008, 'obstetricia-resumos', 'Obstetrícia Resumos', 'blurb-nav-hub', 'publish', 15, 'resumos'),
  (90009, 'obstetricia-formula', 'Obstetrícia Formula', 'blurb-nav-hub', 'publish', 15, 'formula'),
  (90010, 'pediatria-simulados', 'Pediatria Simulados', 'blurb-nav-hub', 'publish', 16, 'simulados'),
  (90011, 'pediatria-resumos', 'Pediatria Resumos', 'blurb-nav-hub', 'publish', 16, 'resumos'),
  (90012, 'pediatria-formula', 'Pediatria Formula', 'blurb-nav-hub', 'publish', 16, 'formula'),
  (90013, 'saude-coletiva-simulados', 'Saúde Coletiva Simulados', 'blurb-nav-hub', 'publish', 17, 'simulados'),
  (90014, 'saude-coletiva-resumos', 'Saúde Coletiva Resumos', 'blurb-nav-hub', 'publish', 17, 'resumos'),
  (90015, 'saude-coletiva-formula', 'Saúde Coletiva Formula', 'blurb-nav-hub', 'publish', 17, 'formula')
ON CONFLICT (id) DO NOTHING;

-- ── 3. Link each new hub to its content pages via nav_items ──

-- cirurgia-geral-simulados: 28 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90001, 4213, 1, 'Abdome Agudo Hemorrágico', 'cards'),
  (90001, 4217, 2, 'Abdome Agudo Obstrutivo', 'cards'),
  (90001, 4220, 3, 'Abdome Agudo Perfurativo', 'cards'),
  (90001, 4223, 4, 'Abdome Agudo Vascular', 'cards'),
  (90001, 4227, 5, 'Apendicite', 'cards'),
  (90001, 4231, 6, 'Câncer de Colorretal', 'cards'),
  (90001, 4234, 7, 'Câncer de Esôfago', 'cards'),
  (90001, 4237, 8, 'Câncer de Estômago', 'cards'),
  (90001, 7630, 9, 'Cirurgia Pediátrica', 'cards'),
  (90001, 4240, 10, 'Colecistite', 'cards'),
  (90001, 4244, 11, 'Diverticulite', 'cards'),
  (90001, 4247, 12, 'Doenças Hepatobiliares', 'cards'),
  (90001, 4250, 13, 'Doenças Orificiais', 'cards'),
  (90001, 4507, 14, 'Estenose Hipertrófica do Piloro', 'cards'),
  (90001, 4253, 15, 'Feridas Cirúrgicas', 'cards'),
  (90001, 4259, 16, 'Hemorragia Digestiva', 'cards'),
  (90001, 4264, 17, 'Hérnias', 'cards'),
  (90001, 4520, 18, 'Invaginação Intestinal em Lactente', 'cards'),
  (90001, 4267, 19, 'Pancreatite', 'cards'),
  (90001, 4270, 20, 'Perioperatório', 'cards'),
  (90001, 4273, 21, 'Queimados', 'cards'),
  (90001, 4275, 22, 'TEC', 'cards'),
  (90001, 4280, 23, 'Trauma - Atendimento Inicial e Vias Áreas', 'cards'),
  (90001, 4283, 24, 'Trauma - Osteomielite', 'cards'),
  (90001, 4286, 25, 'Trauma de Tórax', 'cards'),
  (90001, 4277, 26, 'Trauma Raquimedular', 'cards'),
  (90001, 4289, 27, 'Tumor de Pâncreas', 'cards'),
  (90001, 4555, 28, 'Tumor Neuroendócrino Infantil', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- cirurgia-geral-resumos: 28 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90002, 1940, 1, 'Abdome Agudo Hemorrágico', 'cards'),
  (90002, 1945, 2, 'Abdome Agudo Obstrutivo', 'cards'),
  (90002, 1953, 3, 'Abdome Agudo Perfurativo', 'cards'),
  (90002, 1988, 4, 'Abdome Agudo Vascular', 'cards'),
  (90002, 362, 5, 'Apendicite', 'cards'),
  (90002, 365, 6, 'Câncer de Colorretal', 'cards'),
  (90002, 368, 7, 'Câncer de Esôfago', 'cards'),
  (90002, 371, 8, 'Câncer de Estômago', 'cards'),
  (90002, 1267, 9, 'Colecistite', 'cards'),
  (90002, 374, 10, 'Diverticulite', 'cards'),
  (90002, 1271, 11, 'Doenças Hepatobiliares', 'cards'),
  (90002, 377, 12, 'Doenças Orificiais', 'cards'),
  (90002, 2728, 13, 'Estenose Hipertrófica do Piloro', 'cards'),
  (90002, 1275, 14, 'Feridas Cirúrgicas', 'cards'),
  (90002, 2429, 15, 'Hemorragia Digestiva', 'cards'),
  (90002, 6115, 16, 'Hemorroidas', 'cards'),
  (90002, 383, 17, 'Hérnias', 'cards'),
  (90002, 2745, 18, 'Invaginação Intestinal em Lactente', 'cards'),
  (90002, 386, 19, 'Pancreatite', 'cards'),
  (90002, 390, 20, 'Perioperatório', 'cards'),
  (90002, 393, 21, 'Queimados', 'cards'),
  (90002, 396, 22, 'TEC', 'cards'),
  (90002, 2445, 23, 'Trauma - Osteomielite', 'cards'),
  (90002, 2066, 24, 'Trauma Atendimento Inicial e Vias Aéreas', 'cards'),
  (90002, 1287, 25, 'Trauma de Tórax', 'cards'),
  (90002, 399, 26, 'Trauma Raquimedular', 'cards'),
  (90002, 409, 27, 'Tumor de Pâncreas', 'cards'),
  (90002, 2783, 28, 'Tumor Neuroendócrino Infantil', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- cirurgia-geral-formula: 28 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90003, 3283, 1, 'Abdome Agudo Hemorrágico', 'cards'),
  (90003, 3286, 2, 'Abdome Agudo Obstrutivo', 'cards'),
  (90003, 3289, 3, 'Abdome Agudo Perfurativo', 'cards'),
  (90003, 3292, 4, 'Abdome Agudo Vascular', 'cards'),
  (90003, 3295, 5, 'Apendicite', 'cards'),
  (90003, 3300, 6, 'Câncer de Colorretal', 'cards'),
  (90003, 3303, 7, 'Câncer de Esôfago', 'cards'),
  (90003, 3306, 8, 'Câncer de Estômago', 'cards'),
  (90003, 3309, 9, 'Colecistite', 'cards'),
  (90003, 3312, 10, 'Diverticulite', 'cards'),
  (90003, 3315, 11, 'Doenças Hepatobiliares', 'cards'),
  (90003, 3318, 12, 'Doenças Orificiais', 'cards'),
  (90003, 3547, 13, 'Estenose Hipertrófica do Piloro', 'cards'),
  (90003, 3321, 14, 'Feridas Cirúrgicas', 'cards'),
  (90003, 3325, 15, 'Hemorragia Digestiva', 'cards'),
  (90003, 3328, 16, 'Hérnias', 'cards'),
  (90003, 3562, 17, 'Invaginação Intestinal em Lactente', 'cards'),
  (90003, 3331, 18, 'Pancreatite', 'cards'),
  (90003, 3334, 19, 'Perioperatório', 'cards'),
  (90003, 3339, 20, 'Queimados', 'cards'),
  (90003, 3343, 21, 'TCE', 'cards'),
  (90003, 9810, 22, 'Técnica Cirúrgica', 'cards'),
  (90003, 3349, 23, 'Trauma - Atendimento Inicial e Vias Áreas', 'cards'),
  (90003, 3352, 24, 'Trauma - Osteomielite', 'cards'),
  (90003, 3355, 25, 'Trauma de Tórax', 'cards'),
  (90003, 3346, 26, 'Trauma Raquimedular', 'cards'),
  (90003, 3358, 27, 'Tumor de Pâncreas', 'cards'),
  (90003, 3602, 28, 'Tumor Neuroendócrino Infantil', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- ginecologia-simulados: 19 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90004, 4328, 1, 'Amenorreia', 'cards'),
  (90004, 4332, 2, 'Anticoncepção', 'cards'),
  (90004, 4335, 3, 'Câncer de Endométrio', 'cards'),
  (90004, 4338, 4, 'Câncer de Mama', 'cards'),
  (90004, 4341, 5, 'Câncer de Ovário', 'cards'),
  (90004, 4344, 6, 'Cervicite e Vulvovaginite', 'cards'),
  (90004, 4347, 7, 'Climatério', 'cards'),
  (90004, 4350, 8, 'Distopias Genitais', 'cards'),
  (90004, 4353, 9, 'Distúrbio do Desenvolvimento Sexual', 'cards'),
  (90004, 4356, 10, 'Doença Inflamatória Pélvica', 'cards'),
  (90004, 4360, 11, 'Doenças Benignas da Mama', 'cards'),
  (90004, 4363, 12, 'Doenças Benignas do Útero', 'cards'),
  (90004, 4366, 13, 'Doenças Ovarianas', 'cards'),
  (90004, 4369, 14, 'Endometriose', 'cards'),
  (90004, 4372, 15, 'HPV e Câncer de Colo', 'cards'),
  (90004, 4376, 16, 'Patologias da Vulva', 'cards'),
  (90004, 4379, 17, 'Planejamento Familiar', 'cards'),
  (90004, 4382, 18, 'Sangramento Uterino Anormal', 'cards'),
  (90004, 4385, 19, 'Síndrome dos Ovários Policísticos', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- ginecologia-resumos: 19 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90005, 2470, 1, 'Amenorreia', 'cards'),
  (90005, 2474, 2, 'Anticoncepção', 'cards'),
  (90005, 2477, 3, 'Câncer de Endométrio', 'cards'),
  (90005, 2480, 4, 'Câncer de Mama', 'cards'),
  (90005, 2483, 5, 'Câncer de Ovário', 'cards'),
  (90005, 2487, 6, 'Cervicite e Vulvovaginite', 'cards'),
  (90005, 2490, 7, 'Climatério', 'cards'),
  (90005, 2493, 8, 'Distopias Genitais', 'cards'),
  (90005, 2497, 9, 'Distúrbio do Desenvolvimento Sexual', 'cards'),
  (90005, 2500, 10, 'Doença Inflamatória Pélvica', 'cards'),
  (90005, 2503, 11, 'Doenças Benignas da Mama', 'cards'),
  (90005, 2519, 12, 'Doenças Benignas do Útero', 'cards'),
  (90005, 2506, 13, 'Doenças Ovarianas', 'cards'),
  (90005, 2509, 14, 'Endometriose', 'cards'),
  (90005, 2512, 15, 'HPV e Câncer de Colo Uterino', 'cards'),
  (90005, 2515, 16, 'Patologias da Vulva', 'cards'),
  (90005, 2522, 17, 'Planejamento Familiar', 'cards'),
  (90005, 2526, 18, 'Sangramento Uterino Anormal', 'cards'),
  (90005, 2529, 19, 'Síndrome dos Ovários Policísticos', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- ginecologia-formula: 19 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90006, 3362, 1, 'Amenorreia', 'cards'),
  (90006, 3365, 2, 'Anticoncepção', 'cards'),
  (90006, 3368, 3, 'Câncer de Endométrio', 'cards'),
  (90006, 3375, 4, 'Câncer de Mama', 'cards'),
  (90006, 3380, 5, 'Câncer de Ovário', 'cards'),
  (90006, 3383, 6, 'Cervicite e Vulvovaginite', 'cards'),
  (90006, 3386, 7, 'Climatério', 'cards'),
  (90006, 3389, 8, 'Distopias Genitais', 'cards'),
  (90006, 3393, 9, 'Distúrbio do Desenvolvimento Sexual', 'cards'),
  (90006, 3398, 10, 'Doença Inflamatória Pélvica', 'cards'),
  (90006, 3401, 11, 'Doenças Benignas da Mama', 'cards'),
  (90006, 3404, 12, 'Doenças Benignas do Útero', 'cards'),
  (90006, 3407, 13, 'Doenças Ovarianas', 'cards'),
  (90006, 3410, 14, 'Endometriose', 'cards'),
  (90006, 3413, 15, 'HPV e Câncer de Colo Uterino', 'cards'),
  (90006, 3416, 16, 'Patologias da Vulva', 'cards'),
  (90006, 3419, 17, 'Planejamento Familiar', 'cards'),
  (90006, 3422, 18, 'Sangramento Uterino Anormal', 'cards'),
  (90006, 3427, 19, 'Síndrome dos Ovários Policísticos', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- obstetricia-simulados: 17 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90007, 4427, 1, 'Aborto', 'cards'),
  (90007, 4433, 2, 'Assistência Clínica ao Parto', 'cards'),
  (90007, 4430, 3, 'Assistência Pré-Natal', 'cards'),
  (90007, 4436, 4, 'Diabetes da Gestação', 'cards'),
  (90007, 4443, 5, 'Gestação Ectópica', 'cards'),
  (90007, 4446, 6, 'Infecção Urinária na Gestação', 'cards'),
  (90007, 4449, 7, 'Isoimunização RH', 'cards'),
  (90007, 4453, 8, 'Mecanismo de Parto', 'cards'),
  (90007, 4457, 9, 'Prematuridade', 'cards'),
  (90007, 4460, 10, 'Puerpério', 'cards'),
  (90007, 4463, 11, 'Relações Uterofetais', 'cards'),
  (90007, 4466, 12, 'Rotura Prematura de Membranas', 'cards'),
  (90007, 4470, 13, 'Sífilis na Gestação', 'cards'),
  (90007, 4473, 14, 'Síndromes Hemorrágicas da Gestação', 'cards'),
  (90007, 4476, 15, 'Síndromes Hipertensivas na Gestação', 'cards'),
  (90007, 4479, 16, 'Toxoplasmose na Gestação', 'cards'),
  (90007, 4482, 17, 'Vitalidade Fetal', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- obstetricia-resumos: 18 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90008, 2574, 1, 'Aborto', 'cards'),
  (90008, 2582, 2, 'Assistência Clínica ao Parto', 'cards'),
  (90008, 2579, 3, 'Assistência Pré-Natal', 'cards'),
  (90008, 2586, 4, 'Diabetes da Gestação', 'cards'),
  (90008, 2589, 5, 'Gestação Ectópica', 'cards'),
  (90008, 6259, 6, 'HIV na Gestação', 'cards'),
  (90008, 2592, 7, 'Infecção Urinária na Gestação', 'cards'),
  (90008, 2595, 8, 'Isoimunização RH', 'cards'),
  (90008, 2599, 9, 'Mecanismo de Parto', 'cards'),
  (90008, 2602, 10, 'Prematuridade', 'cards'),
  (90008, 2605, 11, 'Puerpério', 'cards'),
  (90008, 2608, 12, 'Relações Uterofetais', 'cards'),
  (90008, 2611, 13, 'Rotura Prematura de Membranas', 'cards'),
  (90008, 2614, 14, 'Sífilis na Gestação', 'cards'),
  (90008, 2618, 15, 'Síndromes Hemorrágicas da Gestação', 'cards'),
  (90008, 2621, 16, 'Síndromes Hipertensivas na Gestação', 'cards'),
  (90008, 2624, 17, 'Toxoplasmose na Gestação', 'cards'),
  (90008, 2627, 18, 'Vitalidade Fetal', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- obstetricia-formula: 17 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90009, 3472, 1, 'Aborto', 'cards'),
  (90009, 3478, 2, 'Assistência Clínica ao Parto', 'cards'),
  (90009, 3475, 3, 'Assistência Pré-Natal', 'cards'),
  (90009, 3481, 4, 'Diabetes da Gestação', 'cards'),
  (90009, 3484, 5, 'Gestação Ectópica', 'cards'),
  (90009, 3487, 6, 'Infecção Urinária na Gestação', 'cards'),
  (90009, 3490, 7, 'Isoimunização RH', 'cards'),
  (90009, 3493, 8, 'Mecanismo de Parto', 'cards'),
  (90009, 3496, 9, 'Prematuridade', 'cards'),
  (90009, 3500, 10, 'Puerpério', 'cards'),
  (90009, 3503, 11, 'Relações Uterofetais', 'cards'),
  (90009, 3506, 12, 'Rotura Prematura de Membranas', 'cards'),
  (90009, 3509, 13, 'Sífilis na Gestação', 'cards'),
  (90009, 3512, 14, 'Síndromes Hemorrágicas da Gestação', 'cards'),
  (90009, 3515, 15, 'Síndromes Hipertensivas na Gestação', 'cards'),
  (90009, 3518, 16, 'Toxoplasmose na Gestação', 'cards'),
  (90009, 3521, 17, 'Vitalidade Fetal', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- pediatria-simulados: 20 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90010, 4486, 1, 'Aleitamento Materno', 'cards'),
  (90010, 4489, 2, 'Alimentação Complementar do Lactente', 'cards'),
  (90010, 4492, 3, 'Bronquiolite', 'cards'),
  (90010, 4495, 4, 'Convulsão Febril', 'cards'),
  (90010, 4498, 5, 'Desnutrição e Obesidade na Infância', 'cards'),
  (90010, 4501, 6, 'Diarreia e Desidratação', 'cards'),
  (90010, 4504, 7, 'Distúrbios do Crescimento e Desenvolvimento', 'cards'),
  (90010, 4510, 8, 'Faringoamigdalite Estreptocócica', 'cards'),
  (90010, 4513, 9, 'Icterícia neonatal', 'cards'),
  (90010, 4517, 10, 'Imunizações', 'cards'),
  (90010, 4523, 11, 'Laringite Viral (crupe)', 'cards'),
  (90010, 4527, 12, 'Malformações Congênitas', 'cards'),
  (90010, 4531, 13, 'Maus Tratos e Prevenções de Acidentes na Infância', 'cards'),
  (90010, 4534, 14, 'Puericultura', 'cards'),
  (90010, 4537, 15, 'Reanimação Neonatal', 'cards'),
  (90010, 4540, 16, 'Sepse Neonatal', 'cards'),
  (90010, 4543, 17, 'Síndrome do Desconforto Respiratório', 'cards'),
  (90010, 4546, 18, 'Taquipneia Transitória do Recém-Nascido', 'cards'),
  (90010, 4549, 19, 'TORCHS', 'cards'),
  (90010, 4552, 20, 'Triagem Neonatal', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- pediatria-resumos: 22 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90011, 2706, 1, 'Aleitamento Materno', 'cards'),
  (90011, 2709, 2, 'Alimentação Complementar do Lactente', 'cards'),
  (90011, 2712, 3, 'Bronquiolite', 'cards'),
  (90011, 2715, 4, 'Convulsão Febril', 'cards'),
  (90011, 2719, 5, 'Desnutrição e Obesidade na Infância', 'cards'),
  (90011, 2722, 6, 'Diarreia e Desidratação', 'cards'),
  (90011, 2725, 7, 'Distúrbios do Crescimento e Desenvolvimento', 'cards'),
  (90011, 2731, 8, 'Faringoamigdalite Estreptocócica', 'cards'),
  (90011, 6358, 9, 'Febre sem sinais de localização', 'cards'),
  (90011, 2734, 10, 'Icterícia Neonatal', 'cards'),
  (90011, 2737, 11, 'Imunizações', 'cards'),
  (90011, 6365, 12, 'IVAS - resfriado, sinusite e otite', 'cards'),
  (90011, 2748, 13, 'Laringite Viral (crupe)', 'cards'),
  (90011, 2752, 14, 'Malformações Congênitas', 'cards'),
  (90011, 2756, 15, 'Maus Tratos e Prevenções de Acidentes na Infância', 'cards'),
  (90011, 2759, 16, 'Puericultura', 'cards'),
  (90011, 2763, 17, 'Reanimação Neonatal', 'cards'),
  (90011, 2766, 18, 'Sepse Neonatal', 'cards'),
  (90011, 2769, 19, 'Síndrome do Desconforto Respiratório', 'cards'),
  (90011, 2773, 20, 'Taquipneia Transitória do Recém-Nascido', 'cards'),
  (90011, 2777, 21, 'TORCHS', 'cards'),
  (90011, 2780, 22, 'Triagem Neonatal', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- pediatria-formula: 20 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90012, 3526, 1, 'Aleitamento Materno', 'cards'),
  (90012, 3529, 2, 'Alimentação Complementar do Lactente', 'cards'),
  (90012, 3532, 3, 'Bronquiolite', 'cards'),
  (90012, 3535, 4, 'Convulsão Febril', 'cards'),
  (90012, 3538, 5, 'Desnutrição e Obesidade na Infância', 'cards'),
  (90012, 3541, 6, 'Diarreia e Desidratação', 'cards'),
  (90012, 3544, 7, 'Distúrbios do Crescimento e Desenvolvimento', 'cards'),
  (90012, 3552, 8, 'Faringoamigdalite Estreptocócica', 'cards'),
  (90012, 3555, 9, 'Icterícia Neonatal', 'cards'),
  (90012, 3559, 10, 'Imunizações', 'cards'),
  (90012, 3568, 11, 'Laringite Viral (crupe)', 'cards'),
  (90012, 3572, 12, 'Malformações Congênitas', 'cards'),
  (90012, 3589, 13, 'Manejo Inicial do Desconforto Respiratório no Recém-Nascido', 'cards'),
  (90012, 3575, 14, 'Maus Tratos e Prevenções de Acidentes na Infância', 'cards'),
  (90012, 3579, 15, 'Puericultura', 'cards'),
  (90012, 3582, 16, 'Reanimação Neonatal', 'cards'),
  (90012, 3586, 17, 'Sepse Neonatal', 'cards'),
  (90012, 3592, 18, 'Taquipneia Transitória do Recém-Nascido', 'cards'),
  (90012, 3595, 19, 'TORCHS', 'cards'),
  (90012, 3598, 20, 'Triagem Neonatal', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- saude-coletiva-simulados: 11 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90013, 4390, 1, 'Atenção ao Idoso', 'cards'),
  (90013, 4395, 2, 'Atenção Básica', 'cards'),
  (90013, 4398, 3, 'Bioestatística', 'cards'),
  (90013, 4401, 4, 'Declaração de Óbito', 'cards'),
  (90013, 4404, 5, 'Ética Médica', 'cards'),
  (90013, 4407, 6, 'Indicadores de Saúde', 'cards'),
  (90013, 4411, 7, 'Medicina do Trabalho', 'cards'),
  (90013, 4414, 8, 'Processo Saúde – Doença', 'cards'),
  (90013, 4417, 9, 'SUS: Histórico, Princípios e Diretrizes', 'cards'),
  (90013, 4420, 10, 'Testes Diagnósticos', 'cards'),
  (90013, 4423, 11, 'Vigilância Epidemiológica', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- saude-coletiva-resumos: 12 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90014, 2533, 1, 'Atenção ao Idoso', 'cards'),
  (90014, 2536, 2, 'Atenção Básica', 'cards'),
  (90014, 2539, 3, 'Bioestatística', 'cards'),
  (90014, 2542, 4, 'Declaração de Óbito', 'cards'),
  (90014, 6344, 5, 'Estudos epidemiológicos', 'cards'),
  (90014, 2545, 6, 'Ética Médica', 'cards'),
  (90014, 2548, 7, 'Indicadores de Saúde', 'cards'),
  (90014, 2551, 8, 'Medicina do Trabalho', 'cards'),
  (90014, 2554, 9, 'Processo Saúde – Doença', 'cards'),
  (90014, 2557, 10, 'SUS: Histórico, Princípios e Diretrizes', 'cards'),
  (90014, 2560, 11, 'Testes Diagnósticos', 'cards'),
  (90014, 2564, 12, 'Vigilância Epidemiológica', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- saude-coletiva-formula: 11 items
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES
  (90015, 3431, 1, 'Atenção ao Idoso', 'cards'),
  (90015, 3435, 2, 'Atenção Básica', 'cards'),
  (90015, 3438, 3, 'Bioestatística', 'cards'),
  (90015, 3441, 4, 'Declaração de Óbito', 'cards'),
  (90015, 3444, 5, 'Ética Médica', 'cards'),
  (90015, 3447, 6, 'Indicadores de Saúde', 'cards'),
  (90015, 3450, 7, 'Medicina do Trabalho', 'cards'),
  (90015, 3453, 8, 'Processo Saúde – Doença', 'cards'),
  (90015, 3456, 9, 'SUS: Histórico, Princípios e Diretrizes', 'cards'),
  (90015, 3459, 10, 'Testes Diagnósticos', 'cards'),
  (90015, 3462, 11, 'Vigilância Epidemiológica', 'cards')
ON CONFLICT (source_page_id, position) DO NOTHING;

-- 3b. Stray pages now assigned to original 12 specialties — link from existing hubs.
-- Use position = MAX(existing) + N to avoid collisions with existing nav_items.

WITH next_pos AS (SELECT COALESCE(MAX(position),0) AS p FROM nav_items WHERE source_page_id = 1656)
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
SELECT 1656, v.target_id, next_pos.p + v.idx, v.lbl, 'cards' FROM next_pos,
(VALUES
  (1, 671::bigint, 'Insuficiência Cardíaca')
) AS v(idx, target_id, lbl)
WHERE NOT EXISTS (SELECT 1 FROM nav_items WHERE source_page_id = 1656 AND target_page_id = v.target_id);

WITH next_pos AS (SELECT COALESCE(MAX(position),0) AS p FROM nav_items WHERE source_page_id = 3054)
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
SELECT 3054, v.target_id, next_pos.p + v.idx, v.lbl, 'cards' FROM next_pos,
(VALUES
  (1, 3081::bigint, 'Leptospirose')
) AS v(idx, target_id, lbl)
WHERE NOT EXISTS (SELECT 1 FROM nav_items WHERE source_page_id = 3054 AND target_page_id = v.target_id);

WITH next_pos AS (SELECT COALESCE(MAX(position),0) AS p FROM nav_items WHERE source_page_id = 3219)
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
SELECT 3219, v.target_id, next_pos.p + v.idx, v.lbl, 'cards' FROM next_pos,
(VALUES
  (1, 3153::bigint, 'Delirium')
) AS v(idx, target_id, lbl)
WHERE NOT EXISTS (SELECT 1 FROM nav_items WHERE source_page_id = 3219 AND target_page_id = v.target_id);

WITH next_pos AS (SELECT COALESCE(MAX(position),0) AS p FROM nav_items WHERE source_page_id = 3248)
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
SELECT 3248, v.target_id, next_pos.p + v.idx, v.lbl, 'cards' FROM next_pos,
(VALUES
  (1, 3252::bigint, 'Artrite Infecciosa')
) AS v(idx, target_id, lbl)
WHERE NOT EXISTS (SELECT 1 FROM nav_items WHERE source_page_id = 3248 AND target_page_id = v.target_id);

-- ── 4. Verification ──
SELECT s.id, s.slug, s.name, COUNT(p.id) AS pages
FROM specialties s
LEFT JOIN pages p ON p.specialty_id = s.id
WHERE s.display_order >= 13
GROUP BY s.id, s.slug, s.name
ORDER BY s.display_order;

SELECT view, type, COUNT(*) FROM pages WHERE specialty_id IS NULL GROUP BY view, type ORDER BY 1,2;

COMMIT;
