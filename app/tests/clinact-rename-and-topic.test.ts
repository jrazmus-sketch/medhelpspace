import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { slugifyTitle } from "@/lib/clinact/slug";

// Karina, 2026-09-02 (Etapa 2 closed): renaming a case must move its address
// without breaking links or touching history, and the TEMA must not give the
// case away before the student opens it.

const SRC = path.resolve(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");

// ── 1. The address is derived from the title, always ────────────────────────

test("dropping the diagnosis from a title changes the slug", () => {
  // The real case: "Choque" was giving the answer away in the URL too.
  assert.equal(slugifyTitle("Choque — a pressão não respondeu"), "choque-a-pressao-nao-respondeu");
  assert.equal(slugifyTitle("A pressão não respondeu"), "a-pressao-nao-respondeu");
});

test("the editor no longer freezes the slug once a case is published", () => {
  const editor = read("components/clinact/case-editor.tsx");
  const onTitle = editor.slice(editor.indexOf("function onTitle"), editor.indexOf("function onFormat"));
  assert.ok(onTitle.includes("slug: slugifyTitle(v)"), "the title must drive the slug");
  assert.ok(
    !/status === "draft"/.test(onTitle),
    'the slug must no longer depend on the case being a draft',
  );
});

test("a rename resolves collisions instead of taking another case's address", () => {
  const actions = read("actions/clinact.ts");
  const save = actions.slice(actions.indexOf("export async function saveCaseDraft"), actions.indexOf("export type PublishResult"));
  assert.ok(save.includes("resolveCaseSlug"), "saveCaseDraft must resolve the slug");
  assert.ok(!save.includes('error: "slug_taken"'), "a rename must not dead-end on a taken slug");
  // duplicateCase must consult retired addresses too, not just live ones.
  const dup = actions.slice(actions.indexOf("export async function duplicateCase"), actions.indexOf("export async function createPreviewLink"));
  assert.ok(dup.includes("resolveCaseSlug"));
});

test("a retired address redirects to the case's current one", () => {
  const route = read("app/clinact/(membro)/caso/[slug]/page.tsx");
  assert.ok(route.includes("getCaseBySlugAlias"), "the route must look up retired addresses");
  assert.ok(route.includes("permanentRedirect"), "an old link must 308, not 404");
  // The lookup only runs when no live case holds the slug, so an alias can
  // never shadow a case that currently answers to it.
  const idx = route.indexOf("await getCaseBySlugAlias");
  assert.ok(route.lastIndexOf("if (!doc)", idx) !== -1, "alias lookup must be inside the !doc branch");
});

test("the id is what history hangs on, so a rename cannot reach it", () => {
  // Every performance table keys on case_id; none of them stores a slug.
  const schema = readFileSync(path.join(SRC, "..", "..", "schema-patch-clinact.sql"), "utf8");
  for (const table of ["clinact_attempts", "clinact_step_events"]) {
    const i = schema.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`);
    assert.ok(i > 0, `${table} must exist`);
    const body = schema.slice(i, schema.indexOf(");", i));
    assert.ok(!/\bslug\b/.test(body), `${table} must not store a slug`);
  }
});

// ── 2. TEMA is withheld until the case is over ──────────────────────────────

test("the player payload withholds the theme until the attempt is finished", () => {
  const load = read("lib/clinact/player-load.ts");
  assert.ok(
    /topic:\s*finished\s*\?\s*\(doc\.topic_text\s*\?\?\s*null\)\s*:\s*null/.test(load),
    "topic must follow the same finished-gate as the map spoilers",
  );
});

test("the library shows the theme only on cases the reader has finished", () => {
  const page = read("app/clinact/(membro)/treinar/page.tsx");
  assert.ok(page.includes("{done && c.topic_text ?"), "theme must be gated on completion");
  assert.ok(!/\{c\.topic_text \?/.test(page), "no ungated theme render may remain");
  // What she DOES see before opening is unchanged.
  for (const shown of ["FORMAT_LABELS[", "DIFF[c.difficulty]", "c.est_minutes"]) {
    assert.ok(page.includes(shown), `${shown} must still be visible in the list`);
  }
});

test("finishing a case reveals the theme in the same response as the map", () => {
  const actions = read("actions/clinact.ts");
  const finishes = actions.match(/return \{ ok: true, state[^}]*finished: true[^}]*\};/g) ?? [];
  assert.equal(finishes.length, 2, "both finish branches");
  for (const line of finishes) assert.ok(line.includes("topic:"), `finish branch must carry the theme: ${line}`);
});

// ── 3. The guide carries both editorial rules ───────────────────────────────

test("the guide states the selective-confidence rule for Clínica em Cena", () => {
  const guide = readFileSync(
    path.join(SRC, "..", "..", "docs", "clinact", "formato-de-conteudo.md"),
    "utf8",
  );
  assert.ok(/No Clínica em Cena a coleta é seletiva/.test(guide));
  assert.ok(/nenhuma coleta, uma ou\s*\nvárias/.test(guide), "must allow none, one or several");
  assert.ok(/O título não entrega o caso/.test(guide), "title rule must be documented");
  assert.ok(/Título público = não entrega o caso/.test(guide));
});
