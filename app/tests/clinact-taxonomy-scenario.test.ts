import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { SCENARIOS, SCENARIO_SLUGS, parseScenario, scenarioLabel } from "@/lib/clinact/scenarios";
import { parseCaseFile } from "@/lib/clinact/parse";
import { serializeCase } from "@/lib/clinact/serialize";
import { filterCases, scenarioCounts, toScenario } from "@/lib/clinact/library-filters";
import { taxonomyMarkdown } from "@/lib/clinact/taxonomy-doc";
import { FORMAT_BLURBS, type CaseListRow } from "@/lib/clinact/types";
import { CLINACT_COPY } from "@/lib/clinact/site-copy";

// Karina 2026-10-13: ClinAct's own taxonomy (specialties + topics, independent
// of Revalida) and the "Cenário clínico" metadatum.

const SRC = path.resolve(import.meta.dirname, "..", "src");
const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");

const FILE = (cenario: string | null) =>
  `FORMATO: decisao_30s\nTÍTULO: T\nESPECIALIDADE: Pneumologia\nTEMA: TEP\n${cenario === null ? "" : `CENÁRIO: ${cenario}\n`}DIFICULDADE: intermediária\nDURAÇÃO: 2\nRESUMO: R\n## NARRATIVA\nN\n## PERGUNTA\nP\n* A\n  feedback: f\n- B\n  feedback: g\n`;

// ── the six scenarios ────────────────────────────────────────────────────────

test("the six scenarios are her slugs and her names, in her order", () => {
  assert.deepEqual(SCENARIO_SLUGS, ["atencao_primaria", "ambulatorio", "urgencia", "emergencia", "hospital", "maternidade"]);
  assert.deepEqual(
    SCENARIOS.map((s) => s.label),
    ["Atenção Primária / UBS", "Ambulatório / Consultório", "Urgência", "Emergência", "Hospital / Enfermaria", "Maternidade / Centro Obstétrico"],
  );
  // The chips on /clinact/treinar: "APS / UBS | Ambulatório | Urgência | Emergência | Hospital | Maternidade".
  assert.deepEqual(SCENARIOS.map((s) => s.short), ["APS / UBS", "Ambulatório", "Urgência", "Emergência", "Hospital", "Maternidade"]);
  assert.equal(scenarioLabel("hospital"), "Hospital / Enfermaria");
  assert.equal(scenarioLabel("nada"), null);
});

test("CENÁRIO accepts the full name, the chip name, either half, the slug — any accents or case", () => {
  const cases: [string, string][] = [
    ["Atenção Primária / UBS", "atencao_primaria"],
    ["UBS", "atencao_primaria"],
    ["aps", "atencao_primaria"],
    ["Atenção Básica", "atencao_primaria"],
    ["atencao primaria", "atencao_primaria"],
    ["Ambulatório / Consultório", "ambulatorio"],
    ["consultorio", "ambulatorio"],
    ["URGÊNCIA", "urgencia"],
    ["Emergencia", "emergencia"],
    ["Enfermaria", "hospital"],
    ["hospital", "hospital"],
    ["Centro Obstétrico", "maternidade"],
    ["maternidade", "maternidade"],
  ];
  for (const [raw, slug] of cases) {
    const r = parseScenario(raw);
    assert.ok(r.ok, raw);
    assert.equal(r.ok && r.slug, slug, raw);
  }
});

test("an unknown CENÁRIO is an error that lists every accepted value", () => {
  const r = parseScenario("Pronto-socorro");
  assert.equal(r.ok, false);
  if (r.ok) return;
  for (const s of SCENARIOS) assert.ok(r.message.includes(s.label), s.label);
  assert.ok(r.message.includes('"Pronto-socorro"'));
});

// ── importer: retrocompatible, never wipes, refuses typos ────────────────────

test("a file without CENÁRIO (or with it blank) imports with NO scenario key — the save keeps the stored one", () => {
  for (const f of [FILE(null), FILE("")]) {
    const c = parseCaseFile(f).cases[0];
    assert.deepEqual(c.errors, []);
    assert.ok(c.doc);
    assert.equal("scenario" in c.doc!, false, "absent key = keep what the case has");
  }
});

test("a known CENÁRIO lands as the slug; a typo blocks the import", () => {
  const ok = parseCaseFile(FILE("UBS")).cases[0];
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.doc!.scenario, "atencao_primaria");

  const bad = parseCaseFile(FILE("Emergêncai")).cases[0];
  assert.ok(bad.errors.some((e) => /CENÁRIO "Emergêncai" não reconhecido/.test(e.message)));
});

test("the label must be exact, like every other ficha label", () => {
  const c = parseCaseFile(FILE("Urgência").replace("CENÁRIO:", "CENARIO:")).cases[0];
  assert.ok(c.errors.length > 0);
});

test("export → re-import keeps the scenario", () => {
  const c = parseCaseFile(FILE("Hospital")).cases[0];
  const text = serializeCase(c.doc!);
  assert.ok(text.includes("CENÁRIO: Hospital / Enfermaria"));
  const again = parseCaseFile(text).cases[0];
  assert.deepEqual(again.errors, []);
  assert.equal(again.doc!.scenario, "hospital");
  // No scenario → no line (the file stays importable by anyone).
  assert.ok(!serializeCase(parseCaseFile(FILE(null)).cases[0].doc!).includes("CENÁRIO"));
});

test("the four blank templates carry an empty CENÁRIO line, and the guide documents it", () => {
  for (const f of ["modelo-clinica-em-cena", "modelo-codigo-clinico", "modelo-decisao-30s", "modelo-ponto-de-virada"]) {
    const md = readFileSync(path.join(ROOT, "docs", "clinact", `${f}.md`), "utf8");
    assert.ok(/^TEMA:\r?\nCENÁRIO:\r?$/m.test(md), f);
  }
  const guide = readFileSync(path.join(ROOT, "docs", "clinact", "formato-de-conteudo.md"), "utf8");
  for (const s of SCENARIOS) assert.ok(guide.includes(`\`${s.label}\``), s.label);
  assert.ok(guide.includes("Admin → ClinAct → Taxonomia"));
});

test("the save path: the SQL keeps the stored scenario when the key is absent, and the CHECK matches the code", () => {
  const patch = readFileSync(path.join(ROOT, "schema-patch-clinact-taxonomia.sql"), "utf8");
  assert.ok(/scenario\s*=\s*CASE WHEN p_case \? 'scenario'/.test(patch), "absent key keeps the column");
  const check = patch.match(/scenario IN \(([^)]+)\)/);
  assert.ok(check, "CHECK constraint present");
  assert.deepEqual(
    check![1].split(",").map((s) => s.trim().replace(/'/g, "")),
    [...SCENARIO_SLUGS],
  );
  // The editor ALWAYS sends the key: what it shows is the truth ("—" = null).
  assert.ok(/scenario: doc\.scenario \?\? null/.test(read("components/clinact/case-editor.tsx")));
});

// ── library filters ──────────────────────────────────────────────────────────

function row(over: Partial<CaseListRow>): CaseListRow {
  return {
    id: 1, slug: "s", format: "codigo_clinico", title: "T", specialty_id: 1, topic_id: null,
    specialty_text: null, topic_text: null, difficulty: "intermediaria", est_minutes: 5, summary: null,
    status: "published", revision: 1, published_at: null, is_free: false, updated_at: "", scenario: null,
    ...over,
  } as CaseListRow;
}

const LIB = [
  row({ id: 1, format: "codigo_clinico", specialty_id: 1, scenario: "ambulatorio" }),
  row({ id: 2, format: "codigo_clinico", specialty_id: 1, scenario: "urgencia" }),
  row({ id: 3, format: "codigo_clinico", specialty_id: 2, scenario: "ambulatorio" }),
  row({ id: 4, format: "decisao_30s", specialty_id: 1, scenario: "ambulatorio" }),
  row({ id: 5, format: "decisao_30s", specialty_id: 1, scenario: null }),
];

test("format + specialty + scenario combine (Código Clínico + Cardiologia + Ambulatório)", () => {
  assert.deepEqual(filterCases(LIB, { format: "codigo_clinico", specialtyId: 1, scenario: "ambulatorio" }).map((c) => c.id), [1]);
  assert.deepEqual(filterCases(LIB, { scenario: "ambulatorio" }).map((c) => c.id), [1, 3, 4]);
  assert.deepEqual(filterCases(LIB, { format: "decisao_30s" }).map((c) => c.id), [4, 5]);
  // Order of narrowing never matters.
  const a = filterCases(filterCases(LIB, { scenario: "ambulatorio" }), { format: "codigo_clinico" });
  const b = filterCases(filterCases(LIB, { format: "codigo_clinico" }), { scenario: "ambulatorio" });
  assert.deepEqual(a, b);
});

test("a junk ?cenario= is ignored, never an empty list", () => {
  assert.equal(toScenario("praia"), null);
  assert.equal(toScenario(undefined), null);
  assert.equal(toScenario("maternidade"), "maternidade");
});

test("scenario counts always cover all six (a zero chip stays in the row, faded)", () => {
  const n = scenarioCounts(LIB);
  assert.deepEqual(Object.keys(n), [...SCENARIO_SLUGS]);
  assert.equal(n.ambulatorio, 3);
  assert.equal(n.urgencia, 1);
  assert.equal(n.maternidade, 0);
  const chips = read("components/clinact/scenario-chips.tsx");
  assert.ok(/if \(n === 0\) \{\s*return \(\s*<span/.test(chips), "a zero chip is a span, not a Link");
});

test("the Casos page has the compact scenario section; the list reads ?cenario= with the other two", () => {
  const home = read("app/clinact/(membro)/treinar/page.tsx");
  assert.ok(home.includes("clinact.app.treinar.cenario_label"));
  assert.ok(home.includes("/clinact/treinar/casos?cenario="));
  // After the specialty grid, before "Ver todos os casos".
  assert.ok(home.indexOf("portaB_label") < home.indexOf("cenario_label"));
  assert.ok(home.indexOf("cenario_label") < home.indexOf("clinact.app.treinar.todos"));
  assert.equal(CLINACT_COPY["clinact.app.treinar.cenario_label"], "Treine por cenário clínico");
  assert.equal(CLINACT_COPY["clinact.app.treinar.cenario_lead"], "Escolha o ambiente de atendimento que você quer treinar.");

  const list = read("app/clinact/(membro)/treinar/casos/page.tsx");
  assert.ok(list.includes("toScenario(sp.cenario)"));
  assert.ok(/filterCases\(cases, \{ format, specialtyId: specialty\?\.id \?\? null, scenario \}\)/.test(list));
  // The specialty page gets NO scenario grid (her item 12).
  assert.ok(!read("app/clinact/(membro)/treinar/[especialidade]/page.tsx").includes("ScenarioChips"));
});

// ── Ponto de Virada copy ─────────────────────────────────────────────────────

test("platform and sales page keep their two different Ponto de Virada lines", () => {
  assert.equal(FORMAT_BLURBS.ponto_de_virada, "Reavalie quando um novo dado muda o caso.");
  assert.equal(CLINACT_COPY["clinact.competencias.ponto_de_virada"], "Diante de um novo dado, decida o que manter e o que mudar.");
});

// ── own taxonomy: ClinAct never reads Revalida's lists ──────────────────────

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

test("no ClinAct code reads the shared specialties/topics tables", () => {
  const files = [
    ...walk(path.join(SRC, "lib", "clinact")),
    ...walk(path.join(SRC, "app", "clinact")),
    ...walk(path.join(SRC, "app", "admin", "clinact")),
    ...walk(path.join(SRC, "components", "clinact")),
    ...readdirSync(path.join(SRC, "actions")).filter((f) => f.startsWith("clinact")).map((f) => path.join(SRC, "actions", f)),
  ];
  assert.ok(files.length > 20);
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/from\(\s*["'](specialties|topics)["']\s*\)/.test(src), `${path.relative(SRC, f)} reads Revalida's taxonomy`);
  }
  assert.ok(read("lib/clinact/queries.ts").includes('from("clinact_specialties")'));
  assert.ok(read("lib/clinact/queries.ts").includes('from("clinact_topics")'));
});

test("the review queue no longer writes a Revalida specialty id into the shared review_schedule", () => {
  // review_schedule.specialty_id is a FK to Revalida's specialties: a ClinAct
  // Ortopedia id would not exist there. ClinAct never read the column back.
  const review = read("lib/clinact/review.ts");
  assert.ok(/specialty_id: null/.test(review));
  assert.ok(!/specialtyId/.test(review));
});

test("the importer's topic list is generated from ClinAct's taxonomy, not a static Revalida copy", () => {
  const md = taxonomyMarkdown({
    specialties: [
      { id: 1, name: "Cardiologia" },
      { id: 101, name: "Ortopedia" },
    ],
    topics: [
      { name: "Valvopatias", specialty_id: 1 },
      { name: "Insuficiência Cardíaca", specialty_id: 1 },
    ],
  });
  assert.ok(md.includes("Cardiologia · Ortopedia"));
  assert.ok(md.indexOf("- Insuficiência Cardíaca") < md.indexOf("- Valvopatias"), "topics sorted pt-BR");
  assert.ok(/### Ortopedia\n_Nenhum tema cadastrado ainda\._/.test(md));
  const route = read("app/admin/clinact/modelos/[name]/route.ts");
  assert.ok(route.includes("taxonomyMarkdown(await getTaxonomy(), todayKeyBR())"), "the list carries its BR date");
  const dated = taxonomyMarkdown({ specialties: [{ id: 1, name: "Cardiologia" }], topics: [{ name: "Valvopatias", specialty_id: 1 }] }, "2026-10-15");
  assert.ok(dated.includes("**Gerada em 15/10/2026** a partir da Taxonomia · 1 temas"));
  assert.ok(!route.includes("especialidades-e-temas.md\" }"), "no static file entry");
});

test("taxonomy admin: content roles only, refuses to deactivate what a published case uses, audits every change", () => {
  const actions = read("actions/clinact-taxonomy.ts");
  assert.ok(actions.startsWith('"use server"'));
  assert.ok(actions.includes('const CONTENT_ROLES = ["super_admin", "content_admin"]'));
  assert.ok(/used\.published > 0\) return \{ ok: false, error: "in_use" \}/.test(actions));
  assert.ok(/used\.cases > 0/.test(actions), "delete refused when any case uses it");
  for (const a of ["clinact_specialty_create", "clinact_specialty_update", "clinact_specialty_delete", "clinact_topic_create", "clinact_topic_update", "clinact_topic_delete"]) {
    assert.ok(actions.includes(`"${a}"`), a);
  }
  // Only async exports in a "use server" file (a const/type value export crashes /app/*).
  for (const m of actions.matchAll(/^export (?!async function|type )(\w+)/gm)) assert.fail(`non-async export: ${m[1]}`);
  // /clinact/treinar/casos is a static sibling of [especialidade].
  assert.ok(actions.includes('slug === "casos"'));
});

test("renaming never touches the slug, and a specialty with topics or cases cannot be deleted (Karina 2026-10-13)", () => {
  const actions = read("actions/clinact-taxonomy.ts");
  // "Doenca de Kawasaki" → "Doença de Kawasaki" changes the display name only;
  // cases link by id, and the slug is written once, at creation.
  for (const fn of ["updateClinactSpecialty", "updateClinactTopic"]) {
    const body = actions.slice(actions.indexOf(`export async function ${fn}`), actions.indexOf("\nexport ", actions.indexOf(`export async function ${fn}`) + 1));
    // The only write is `.update({ ...update, updated_at })`, and `update` gets name/active only.
    assert.ok(!/update\.slug|\.update\(\{[^}]*slug/.test(body), `${fn} must not write a slug`);
    assert.ok(body.includes(".update({ ...update, updated_at: new Date().toISOString() })"), fn);
  }
  const del = actions.slice(actions.indexOf("export async function deleteClinactSpecialty"), actions.indexOf("// ── Topics"));
  assert.ok(/used\.cases > 0 \|\| \(topics \?\? 0\) > 0\) return \{ ok: false, error: "in_use" \}/.test(del));
  // The floor under the admin: phase 2 re-adds the case FKs as RESTRICT, and a
  // topic already cannot outlive its specialty.
  const publish = readFileSync(path.join(ROOT, "schema-patch-clinact-taxonomia-publish.sql"), "utf8");
  assert.equal((publish.match(/REFERENCES clinact_\w+\(id\) ON DELETE RESTRICT/g) ?? []).length, 2);
  const phase1 = readFileSync(path.join(ROOT, "schema-patch-clinact-taxonomia.sql"), "utf8");
  assert.ok(/specialty_id\s+smallint NOT NULL REFERENCES clinact_specialties\(id\) ON DELETE RESTRICT/.test(phase1));
});

// ── the full topic lists (Karina 2026-10-14) ─────────────────────────────────

const TEMAS = readFileSync(path.join(ROOT, "schema-patch-clinact-taxonomia-temas.sql"), "utf8");
const section = (n: number) => TEMAS.slice(TEMAS.indexOf(`-- ── ${n}.`), TEMAS.indexOf(`-- ── ${n + 1}.`) > 0 ? TEMAS.indexOf(`-- ── ${n + 1}.`) : undefined);

test("the 21 specialties are hers, in her (alphabetical) order, and there is no Outros", () => {
  const expected = [
    "Cardiologia", "Cirurgia Geral", "Dermatologia", "Emergência", "Endocrinologia", "Gastroenterologia", "Ginecologia",
    "Hematologia", "Infectologia", "Nefrologia", "Neurologia", "Obstetrícia", "Oftalmologia", "Ortopedia",
    "Otorrinolaringologia", "Pediatria", "Pneumologia", "Psiquiatria", "Reumatologia", "Saúde Coletiva", "Urologia",
  ];
  const names = [...section(1).matchAll(/\(\d+, '[a-z-]+', '([^']+)', (\d+)\)/g)];
  assert.deepEqual(names.map((m) => m[1]), expected);
  assert.deepEqual(names.map((m) => Number(m[2])), expected.map((_, i) => (i + 1) * 10));
  assert.ok(!/outros/i.test(section(1) + section(2)));
});

test("her topic lists for the five new specialties are in the patch verbatim", () => {
  const lists: Record<number, string[]> = {
    101: ["Trauma Ortopédico — Fraturas e Luxações", "Lesões Ligamentares, Tendíneas e Musculares", "Coluna Vertebral e Lombalgia", "Ombro", "Cotovelo, Punho e Mão", "Quadril", "Joelho", "Tornozelo e Pé", "Infecções Osteoarticulares", "Osteoartrose e Doenças Degenerativas", "Ortopedia Pediátrica", "Tumores Ósseos e de Partes Moles"],
    102: ["Litíase Urinária", "Sintomas do Trato Urinário Inferior e Hiperplasia Prostática Benigna", "Câncer de Próstata", "Hematúria e Tumores Uroteliais", "Tumores Renais", "Escroto Agudo e Doenças Testiculares", "Afecções do Pênis e Prepúcio", "Trauma Urogenital", "Incontinência Urinária e Disfunções Miccionais", "Urologia Pediátrica"],
    17: ["Atenção Primária à Saúde", "SUS: Princípios, Organização e Redes de Atenção", "Rastreamento e Prevenção", "Imunizações", "Vigilância Epidemiológica e Notificação Compulsória", "Saúde do Idoso", "Saúde do Trabalhador", "Abordagem Familiar e Comunitária", "Ética Médica e Medicina Legal", "Declaração de Óbito", "Indicadores de Saúde", "Testes Diagnósticos", "Epidemiologia e Estudos Epidemiológicos", "Determinantes Sociais e Processo Saúde–Doença"],
    103: ["Trauma Ocular", "Urgências Oftalmológicas", "Glaucoma", "Catarata", "Olho Vermelho", "Doenças da Retina", "Pálpebras e Vias Lacrimais", "Erros de Refração e Alterações Visuais"],
    104: ["Otites", "Rinossinusites", "Faringoamigdalites", "Epistaxe", "Vertigem e Distúrbios Vestibulares", "Perda Auditiva", "Corpo Estranho em Otorrinolaringologia", "Infecções Cervicofaciais"],
  };
  const s5 = section(5);
  for (const [sp, names] of Object.entries(lists)) {
    const got = [...s5.matchAll(new RegExp(`\\(${sp}, '([^']+)', '[a-z0-9-]+'\\)`, "g"))].map((m) => m[1]);
    assert.deepEqual(got, names, `specialty ${sp}`);
  }
});

test("the broad list keeps the old ids, skips what she moved, and never copies Outros or later Revalida topics", () => {
  const ids = [...section(3).matchAll(/^\s+\((\d+), (\d+), '/gm)].map((m) => Number(m[1]));
  assert.equal(ids.length, 188);
  // Moved by her: Coluna, Osteomielite, Tumores Renais; and (second round) Artrite Infecciosa.
  for (const moved of [76, 129, 74, 103]) assert.ok(!ids.includes(moved), `moved topic ${moved} copied`);
  for (let id = 210; id <= 221; id++) assert.ok(!ids.includes(id), `Outros topic ${id} copied`);
  // Second round: the four Revalida created after the document ARE wanted.
  for (const id of [222, 223, 224, 225]) assert.ok(ids.includes(id), `topic ${id} missing`);
  // Artrite Infecciosa, inserted by the first run, is removed — only from Reumatologia, only while unused.
  assert.ok(/WHERE t\.id IN \(103\) AND t\.specialty_id = 12\s+AND NOT EXISTS \(SELECT 1 FROM clinact_cases c WHERE c\.topic_id = t\.id\)/.test(section(6)));
  // Kept on purpose (her answers): Trauma Raquimedular in Cirurgia Geral, Faringoamigdalite in Pediatria.
  assert.ok(ids.includes(123) && ids.includes(192));
  // Every topic a published case uses today is in it, under the same id.
  // (the 40 topic ids the published cases pointed at on 2026-10-14)
  const caseTopics = [7, 10, 14, 18, 22, 27, 28, 31, 32, 35, 36, 44, 54, 55, 56, 61, 72, 73, 75, 78, 79, 84, 87, 88, 99, 101, 105, 116, 117, 122, 140, 146, 153, 154, 164, 165, 170, 180, 182, 186];
  assert.equal(caseTopics.length, 40);
  for (const used of caseTopics) assert.ok(ids.includes(used), `case topic ${used} missing`);
  // Spelling fixes only overwrite the OLD spelling, never a later admin edit.
  assert.ok(/WHERE t\.id = v\.id AND t\.name = v\.old_name/.test(section(4)));
  assert.ok(section(4).includes("(182, 'Doenca de Kawasaki', 'Doença de Kawasaki')"));
  assert.ok(!/weight|incid|\[A\]|\[B\]/i.test(TEMAS.split("BEGIN;")[1]), "no A/B/C/D weights");
});

test("the guide and the four templates carry the same revision date, and the guide keeps the history", () => {
  // Karina 2026-10-15: every production document must say which revision it is.
  const guide = readFileSync(path.join(ROOT, "docs", "clinact", "formato-de-conteudo.md"), "utf8");
  const rev = guide.match(/\*\*Revisão do documento: (\d{2}\/\d{2}\/\d{4}) · Versão 1 do formato\*\*/);
  assert.ok(rev, "guide header carries its revision");
  assert.ok(guide.includes("## 13. Histórico de revisões"));
  assert.ok(guide.includes(`- **${rev![1]}** —`), "the current revision is the first entry of the history");
  for (const f of ["modelo-clinica-em-cena", "modelo-codigo-clinico", "modelo-decisao-30s", "modelo-ponto-de-virada"]) {
    const md = readFileSync(path.join(ROOT, "docs", "clinact", `${f}.md`), "utf8");
    assert.ok(md.includes(`**Revisão: ${rev![1]} · Versão 1 do formato**`), `${f} is on the guide's revision`);
    // The version line sits OUTSIDE the fenced template, so "Baixar modelo" (.txt) stays importable.
    assert.ok(md.indexOf("**Revisão:") < md.indexOf("```"), f);
  }
});
