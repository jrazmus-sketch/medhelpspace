import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { filterCases, toFormat } from "@/lib/clinact/library-filters";
import { FORMATS, FORMAT_SKILL, SKILL_LABELS, FORMAT_BLURBS, type CaseListRow } from "@/lib/clinact/types";

// The library architecture Karina froze on 2026-09-02: two doors, one set of
// cases, and TEMA is never a public layer.

const SRC = path.resolve(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");

function row(over: Partial<CaseListRow>): CaseListRow {
  return {
    id: 1, slug: "s", format: "clinica_em_cena", title: "T",
    specialty_id: 1, topic_id: null, specialty_text: null, topic_text: "Pneumonia",
    difficulty: "intermediaria", est_minutes: 8, summary: null, status: "published",
    revision: 1, published_at: null, is_free: false, updated_at: "",
    ...over,
  } as CaseListRow;
}

const LIBRARY: CaseListRow[] = [
  row({ id: 1, format: "clinica_em_cena", specialty_id: 10, title: "No início do plantão" }),
  row({ id: 2, format: "ponto_de_virada", specialty_id: 10, title: "Outro de pneumo" }),
  row({ id: 3, format: "clinica_em_cena", specialty_id: 20, title: "A dor mudou de lugar" }),
  row({ id: 4, format: "decisao_30s", specialty_id: 30, title: "A pressão não respondeu" }),
];

// ── Both doors reach the same case ──────────────────────────────────────────

test("format→specialty and specialty→format select the identical case", () => {
  // Porta A: Clínica em Cena, then narrowed to specialty 10.
  const doorA = filterCases(filterCases(LIBRARY, { format: "clinica_em_cena" }), { specialtyId: 10 });
  // Porta B: specialty 10, then narrowed to Clínica em Cena.
  const doorB = filterCases(filterCases(LIBRARY, { specialtyId: 10 }), { format: "clinica_em_cena" });
  assert.deepEqual(doorA.map((c) => c.id), [1]);
  assert.deepEqual(doorB.map((c) => c.id), [1]);
  // Same row object — one library, never a copy per door.
  assert.equal(doorA[0], doorB[0]);
});

test("an unfiltered list is the whole library, and filters compose", () => {
  assert.equal(filterCases(LIBRARY, {}).length, 4);
  assert.equal(filterCases(LIBRARY, { format: "clinica_em_cena" }).length, 2);
  assert.equal(filterCases(LIBRARY, { specialtyId: 10 }).length, 2);
  assert.equal(filterCases(LIBRARY, { format: "ponto_de_virada", specialtyId: 20 }).length, 0);
});

test("only real formats survive a URL segment", () => {
  assert.equal(toFormat("clinica_em_cena"), "clinica_em_cena");
  assert.equal(toFormat("pneumonia"), null);
  assert.equal(toFormat(undefined), null);
  for (const f of FORMATS) assert.equal(toFormat(f), f);
});

// ── The verb is the point of the format ─────────────────────────────────────

test("every format carries its verb and a one-line blurb", () => {
  const verbs = FORMATS.map((f) => SKILL_LABELS[FORMAT_SKILL[f]]);
  assert.deepEqual(verbs, ["CONECTAR", "CONDUZIR", "PRIORIZAR", "REAVALIAR"]);
  for (const f of FORMATS) assert.ok(FORMAT_BLURBS[f].length > 10, `${f} needs a blurb`);
});

// ── TEMA is not a public layer ──────────────────────────────────────────────

test("no library screen renders the theme except on finished rows", () => {
  const list = read("components/clinact/case-list.tsx");
  // The single place topic_text may appear is guarded by `finished`.
  const hits = [...list.matchAll(/topic_text/g)];
  assert.equal(hits.length, 1, "exactly one topic_text reference");
  assert.ok(/finished \? c\.topic_text : null/.test(list), "and it is gated on completion");

  for (const page of [
    "app/clinact/(membro)/treinar/page.tsx",
    "app/clinact/(membro)/treinar/casos/page.tsx",
    "app/clinact/(membro)/treinar/[especialidade]/page.tsx",
  ]) {
    assert.ok(!read(page).includes("topic_text"), `${page} must not render the theme`);
    assert.ok(!/topics\b/.test(read(page)), `${page} must not navigate by theme`);
  }
});

test("the specialty door never offers a shelf with nothing on it", () => {
  const lib = read("lib/clinact/library.ts");
  assert.ok(/\.filter\(\(s\) => s\.count > 0\)/.test(lib), "empty specialties are dropped");
});

test("both doors point at the same case URL", () => {
  for (const page of ["components/clinact/case-list.tsx"]) {
    assert.ok(read(page).includes("/clinact/caso/${c.slug}"), "cases open at their own address");
  }
  // Neither hub links straight to a case — they narrow, then hand off to the list.
  const home = read("app/clinact/(membro)/treinar/page.tsx");
  assert.ok(home.includes("/clinact/treinar/casos?formato="), "format door filters the list");
  assert.ok(home.includes("/clinact/treinar/${s.slug}"), "specialty door opens the specialty");
});
