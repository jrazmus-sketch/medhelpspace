import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SIMULADO_COLLECTIONS,
  collectionByKey,
  collectionCopy,
  collectionForSlug,
  collectionHref,
  geralSimuladoHref,
  simuladoNumber,
} from "@/lib/simulado-collections";
import { getStudyTypeFromPathname } from "@/lib/page-type";
import { buildCrumbsForPage } from "@/lib/breadcrumbs";

// Karina 2026-10-17 ("Atualização dos Simulados Revalida"): GERAL holds two collections —
// the 20 Simulados Gerais and the 38 Questões Pegada INEP — each opening its own grid.
// POR ÁREAS is untouched.

test("a Geral simulado's collection comes from its slug", () => {
  assert.equal(collectionForSlug("simulado-geral-7")?.key, "gerais");
  assert.equal(collectionForSlug("pegada-inep-12")?.key, "pegada-inep");
  // por área, the 60D Simulados 100Q and look-alikes belong to no collection
  for (const slug of ["cardiologia-simulado-3", "simulado-100q-3", "pegada-inep-", "pegada-inep-3-old", "x-pegada-inep-3"]) {
    assert.equal(collectionForSlug(slug), null, slug);
  }
});

test("her order, titles and descriptions — verbatim", () => {
  assert.deepEqual(
    SIMULADO_COLLECTIONS.map((c) => [c.key, c.title, c.description]),
    [
      ["gerais", "Simulados Gerais", "Questões elaboradas no estilo de cobrança do Revalida."],
      ["pegada-inep", "Questões Pegada INEP", "Questões selecionadas de provas de outras instituições."],
    ],
  );
});

test("Questões Pegada INEP are never called 'inéditas' on their page", () => {
  const pegada = collectionByKey("pegada-inep")!;
  assert.doesNotMatch(collectionCopy(pegada, {}).tagline, /in[ée]dit/i);
  // the tagline follows an admin's edit of the description
  const edited = collectionCopy(pegada, { "simcol.pegada-inep.desc": { value: "Outro texto." } });
  assert.equal(edited.tagline, "Outro texto.");
  // the Gerais keep the line they always had
  assert.equal(collectionCopy(collectionByKey("gerais")!, {}).tagline, "Questões inéditas no padrão da banca");
});

test("site_content edits win; empty rows fall back", () => {
  const c = collectionByKey("gerais")!;
  assert.equal(collectionCopy(c, { "simcol.gerais.title": { value: "Gerais" } }).title, "Gerais");
  assert.equal(collectionCopy(c, { "simcol.gerais.title": { value: "" } }).title, "Simulados Gerais");
});

test("the importer seeds exactly the fallbacks the cards render", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const script = readFileSync(path.join(here, "..", "..", "scripts", "apply-pegada-inep.js"), "utf8");
  for (const c of SIMULADO_COLLECTIONS) {
    assert.ok(script.includes(`['${c.copyKey}.title', '${c.title}']`), `${c.copyKey}.title`);
    assert.ok(script.includes(`['${c.copyKey}.desc', '${c.description}']`), `${c.copyKey}.desc`);
  }
});

test("routes", () => {
  assert.equal(collectionHref("pegada-inep"), "/app/estudo-por-questoes/simulados/pegada-inep");
  assert.equal(geralSimuladoHref("pegada-inep-3"), "/app/geral/pegada-inep-3");
  assert.equal(simuladoNumber("pegada-inep-38"), 38);
  assert.equal(simuladoNumber("sem-numero"), 0);
});

test("nav highlight: a collection page and its simulados are Simulados, not Questões", () => {
  assert.equal(getStudyTypeFromPathname("/app/estudo-por-questoes/simulados/pegada-inep"), "simulados");
  assert.equal(getStudyTypeFromPathname("/app/geral/pegada-inep-3"), "simulados");
  assert.equal(getStudyTypeFromPathname("/app/geral/simulado-geral-3"), "simulados");
  assert.equal(getStudyTypeFromPathname("/app/estudo-por-questoes"), "quiz");
});

test("breadcrumb: Simulados → collection → simulado", () => {
  const page = { id: 1, title: "Simulado 7", slug: "pegada-inep-7", type: "h5p-quiz", view: "simulados" as const, track_id: null, specialty_id: null, content_module_id: null };
  const crumbs = buildCrumbsForPage({
    page,
    specialty: null,
    specialtyHubSlug: null,
    collection: { label: "Questões Pegada INEP", href: collectionHref("pegada-inep") },
  });
  assert.deepEqual(crumbs, [
    { label: "Início", href: "/app" },
    { label: "Simulados", href: "/app/estudo-por-questoes?tab=simulados" },
    { label: "Questões Pegada INEP", href: "/app/estudo-por-questoes/simulados/pegada-inep" },
    { label: "Simulado 7" },
  ]);
  // without a collection the chain is what it always was
  assert.deepEqual(buildCrumbsForPage({ page, specialty: null, specialtyHubSlug: null }).map((c) => c.label), ["Início", "Simulados", "Simulado 7"]);
});
