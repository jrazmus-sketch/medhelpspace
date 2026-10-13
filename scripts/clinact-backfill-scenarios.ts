/**
 * Fills `clinact_cases.scenario` for the 40 published cases with Karina's
 * classification (e-mail "ClinAct — novas especialidades + filtro por cenário
 * clínico", 2026-10-13, item 16). Needs schema-patch-clinact-taxonomia.sql.
 *
 * A case is found by FORMAT + TEMA (the part of her line before " / ", matched
 * accent-insensitively against ClinAct's own topic list), and must be exactly
 * ONE published case. Her codes (D30-01…) also follow id order inside each
 * format; that is checked too, so a mismatch stops the run instead of filing a
 * case under the wrong scenario.
 *
 * Direct UPDATE of the column, NOT through clinact_save_case: the scenario is
 * library metadata, so it must not bump the revision or snapshot a version.
 * Only an EMPTY scenario is filled — a value already set (by her, in the admin)
 * is reported and kept unless --force. Drafts are never touched (the
 * CEC-INV-TESTE-01 draft stays empty).
 *
 * Run (from the repo root) — dry run by default:
 *   node --import ./app/tests/helpers/alias-hook.mjs scripts/clinact-backfill-scenarios.ts <DATABASE_URL> [--apply] [--force]
 *
 * --partial is for the LOCAL test database, which holds only some of the cases:
 * a line with NO matching case is reported instead of stopping the run. Never
 * use it on prod — there every one of the 40 must match.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { parseScenario, scenarioLabel, type Scenario } from "@/lib/clinact/scenarios";
import type { CaseFormat } from "@/lib/clinact/types";

const require = createRequire(import.meta.url);
const postgres = require(path.resolve("node_modules/postgres"));

const url = process.argv[2];
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const PARTIAL = process.argv.includes("--partial");
if (!url || url.startsWith("--")) {
  console.error("usage: … clinact-backfill-scenarios.ts <DATABASE_URL> [--apply] [--force]");
  process.exit(1);
}

// Her list, verbatim: code — TEMA → scenario.
const LIST: [CaseFormat, string, string, string][] = [
  ["decisao_30s", "D30-01", "Choque", "Emergência"],
  ["decisao_30s", "D30-02", "Anafilaxia", "Emergência"],
  ["decisao_30s", "D30-03", "Trauma de Tórax", "Emergência"],
  ["decisao_30s", "D30-04", "AVC Isquêmico", "Emergência"],
  ["decisao_30s", "D30-05", "Taquiarritmias", "Emergência"],
  ["decisao_30s", "D30-06", "Diabetes / Cetoacidose diabética", "Emergência"],
  ["decisao_30s", "D30-07", "Síndromes Hemorrágicas da Gestação", "Maternidade / Centro Obstétrico"],
  ["decisao_30s", "D30-08", "Reanimação Neonatal", "Maternidade / Centro Obstétrico"],
  ["decisao_30s", "D30-09", "Intoxicações Exógenas", "Emergência"],
  ["decisao_30s", "D30-10", "Distúrbios Hidroeletrolíticos", "Emergência"],
  ["decisao_30s", "D30-11", "Síndrome Coronariana Aguda", "Emergência"],
  ["decisao_30s", "D30-12", "Diarreia e Desidratação", "Emergência"],
  ["codigo_clinico", "CC-01", "Valvopatias", "Ambulatório / Consultório"],
  ["codigo_clinico", "CC-02", "Farmacodermias", "Urgência"],
  ["codigo_clinico", "CC-03", "Leptospirose", "Urgência"],
  ["codigo_clinico", "CC-04", "Lupus", "Ambulatório / Consultório"],
  ["codigo_clinico", "CC-05", "Microangiopatias Tromboticas", "Emergência"],
  ["codigo_clinico", "CC-06", "Doenças das Adrenais", "Ambulatório / Consultório"],
  ["codigo_clinico", "CC-07", "Tuberculose", "Atenção Primária / UBS"],
  ["codigo_clinico", "CC-08", "Doença Inflamatória Pélvica", "Urgência"],
  ["codigo_clinico", "CC-09", "Doenca de Kawasaki", "Urgência"],
  ["codigo_clinico", "CC-10", "Síndrome de Guillain-Barré", "Urgência"],
  ["codigo_clinico", "CC-11", "Cirrose", "Ambulatório / Consultório"],
  ["codigo_clinico", "CC-12", "Síndromes Hipertensivas na Gestação", "Maternidade / Centro Obstétrico"],
  ["clinica_em_cena", "CEC-01", "Pneumonia", "Emergência"],
  ["clinica_em_cena", "CEC-02", "Insuficiencia Cardiaca", "Emergência"],
  ["clinica_em_cena", "CEC-03", "Assistência Clínica ao Parto", "Maternidade / Centro Obstétrico"],
  ["clinica_em_cena", "CEC-04", "Bronquiolite", "Urgência"],
  ["clinica_em_cena", "CEC-05", "Apendicite", "Urgência"],
  ["clinica_em_cena", "CEC-06", "Infecção do Trato Urinário / Pielonefrite", "Urgência"],
  ["clinica_em_cena", "CEC-07", "Emergências Psiquiátricas", "Emergência"],
  ["clinica_em_cena", "CEC-08", "Injúria Renal Aguda", "Hospital / Enfermaria"],
  ["ponto_de_virada", "PV-01", "Doenças Ovarianas / Torção ovariana", "Urgência"],
  ["ponto_de_virada", "PV-02", "Cefaleias / Hemorragia subaracnóidea", "Emergência"],
  ["ponto_de_virada", "PV-03", "Gestação Ectópica", "Urgência"],
  ["ponto_de_virada", "PV-04", "Tireotoxicose", "Ambulatório / Consultório"],
  ["ponto_de_virada", "PV-05", "Diverticulite", "Urgência"],
  ["ponto_de_virada", "PV-06", "Arboviroses / Dengue", "Atenção Primária / UBS"],
  ["ponto_de_virada", "PV-07", "Transtorno de Humor", "Ambulatório / Consultório"],
  ["ponto_de_virada", "PV-08", "Síndrome Nefrítica", "Atenção Primária / UBS"],
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type Row = { id: number; format: CaseFormat; title: string; topic: string | null; scenario: Scenario | null };

const sql = postgres(url, { max: 1, onnotice: () => {} });

(async () => {
  const rows: Row[] = (
    await sql`
      SELECT c.id, c.format, c.title, t.name AS topic, c.scenario
        FROM clinact_cases c
        LEFT JOIN clinact_topics t ON t.id = c.topic_id
       WHERE c.status = 'published'
       ORDER BY c.format, c.id`
  ).map((r: Row) => ({ ...r, id: Number(r.id) }));

  const plan: { code: string; row: Row; to: Scenario }[] = [];
  const problems: string[] = [];
  for (const [format, code, tema, label] of LIST) {
    const parsed = parseScenario(label);
    if (!parsed.ok) {
      problems.push(`${code}: ${parsed.message}`);
      continue;
    }
    const topic = norm(tema.split(" / ")[0]);
    const hits = rows.filter((r) => r.format === format && r.topic && norm(r.topic) === topic);
    if (hits.length === 0 && PARTIAL) {
      console.log(`${code.padEnd(7)} (${tema}): no published case here — skipped (--partial)`);
      continue;
    }
    if (hits.length !== 1) {
      problems.push(`${code} (${tema}): ${hits.length} published cases match — expected exactly 1`);
      continue;
    }
    plan.push({ code, row: hits[0], to: parsed.slug });
  }

  // Her numbering follows id order inside each format.
  for (const format of new Set(LIST.map(([f]) => f))) {
    const ids = plan.filter((p) => p.row.format === format).map((p) => p.row.id);
    if (ids.some((id, i) => i > 0 && id < ids[i - 1])) problems.push(`${format}: codes do not follow id order (${ids.join(", ")})`);
  }
  const unlisted = rows.filter((r) => !plan.some((p) => p.row.id === r.id));
  if (plan.length !== LIST.length && !PARTIAL) problems.push(`matched ${plan.length} of ${LIST.length}`);

  for (const p of plan) {
    const state =
      p.row.scenario === p.to ? "já está" : p.row.scenario ? `TEM "${scenarioLabel(p.row.scenario)}"${FORCE ? " → troca" : " → mantém"}` : "→ preenche";
    console.log(`${p.code.padEnd(7)} #${String(p.row.id).padEnd(3)} ${(p.row.topic ?? "").padEnd(38)} ${scenarioLabel(p.to)!.padEnd(32)} ${state}`);
  }
  if (unlisted.length) console.log("\npublished but not in her list (left untouched):", unlisted.map((r) => `#${r.id} ${r.title}`));
  if (problems.length) {
    console.error("\n✗ refusing to write:\n  " + problems.join("\n  "));
    await sql.end();
    process.exit(1);
  }

  const todo = plan.filter((p) => p.row.scenario !== p.to && (FORCE || !p.row.scenario));
  if (!APPLY) {
    console.log(`\ndry run — ${todo.length} case(s) would change. Re-run with --apply.`);
    await sql.end();
    return;
  }
  await sql.begin(async (tx: typeof sql) => {
    for (const p of todo) {
      const done = await tx`
        UPDATE clinact_cases SET scenario = ${p.to}
         WHERE id = ${p.row.id} AND status = 'published'
           AND (${FORCE}::boolean OR scenario IS NULL)
        RETURNING id`;
      if (done.length !== 1) throw new Error(`${p.code} #${p.row.id}: expected 1 row, got ${done.length}`);
    }
  });
  const after = await sql`SELECT count(*)::int AS n FROM clinact_cases WHERE status = 'published' AND scenario IS NOT NULL`;
  console.log(`\n✓ ${todo.length} updated · published cases with a scenario now: ${after[0].n}`);
  await sql.end();
})().catch(async (e) => {
  console.error("✗", e.message);
  await sql.end();
  process.exit(1);
});
