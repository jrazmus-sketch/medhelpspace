import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { headingLevelChanges } from "@/lib/heading-level-changes";

// Karina 2026-11-13: the saved Revalida Up / AudioCard texts had their first heading demoted to H4.

test("reports the Revalida Up title demoted from H2 to H4", () => {
  const before = "<h2>CaiuNaProva – Choque</h2>\n<h3>① Sepse x choque séptico</h3><p>packing pré-peritoneal</p>";
  const after = "<h4>CaiuNaProva – Choque</h4><h3>① Sepse x choque séptico</h3><p>tamponamento pré-peritoneal</p>";
  assert.deepEqual(headingLevelChanges(before, after), [{ text: "CaiuNaProva – Choque", from: 2, to: 4 }]);
});

test("reports AudioCards 'Card 1' H3 → H4 even though 'Card 2' keeps H3", () => {
  const before = '<h3 class="ac-card">Card 1</h3><p class="ac-q">Q</p><h3 class="ac-card">Card 2</h3>';
  const after = '<h4 class="ac-card">Card 1</h4><p class="ac-q">Q</p><h3 class="ac-card">Card 2</h3>';
  assert.deepEqual(headingLevelChanges(before, after), [{ text: "Card 1", from: 3, to: 4 }]);
});

test("a plain text edit, an added heading or a removed heading is not a level change", () => {
  const before = "<h2>Título</h2><h3>A</h3><p>x</p>";
  assert.deepEqual(headingLevelChanges(before, "<h2>Título</h2><h3>A</h3><p>y</p>"), []);
  assert.deepEqual(headingLevelChanges(before, "<h2>Título</h2><h3>A</h3><h4>Novo</h4>"), []);
  assert.deepEqual(headingLevelChanges(before, "<h2>Título</h2><p>x</p>"), []);
  assert.deepEqual(headingLevelChanges(before, "<h2>Título novo</h2><h3>A</h3>"), []);
});

test("repeated heading texts are matched level by level", () => {
  const before = "<h4>Comentário</h4><p>1</p><h4>Comentário</h4><p>2</p>";
  assert.deepEqual(headingLevelChanges(before, "<h4>Comentário</h4><p>1</p><h3>Comentário</h3><p>2</p>"), [
    { text: "Comentário", from: 4, to: 3 },
  ]);
  assert.deepEqual(headingLevelChanges(before, before), []);
});

test("the page editor asks before saving a heading-level change", () => {
  const src = readFileSync(path.join(process.cwd(), "src/app/admin/pages/[id]/edit/edit-client.tsx"), "utf8");
  assert.match(src, /headingLevelChanges\(/);
  assert.match(src, /pageEdit\.headingChangeTitle/);
});
