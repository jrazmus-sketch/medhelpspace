/**
 * Meu Plano settings (Justin, 2026-09-23: selections that didn't stick, controls
 * that locked with a "not allowed" cursor) and slow navigation inside /app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(APP, p), "utf8");

test("no plan setting is locked while it saves", () => {
  const src = read("src/app/app/plano/plano-client.tsx");
  assert.doesNotMatch(src, /cursor: pending \? "not-allowed"/);
  for (const fn of ["SpecialtyMultiSelect", "ContentTypesEditor", "NotificationsEditor", "AdvancedEditor", "AvailabilityEditor"]) {
    const body = src.slice(src.indexOf(`function ${fn}(`), src.indexOf("\nfunction ", src.indexOf(`function ${fn}(`) + 10));
    assert.doesNotMatch(body, /disabled=\{pending\}/, `${fn} still disables controls while saving`);
    assert.match(body, /useAutosave/, `${fn} saves through useAutosave`);
  }
});

test("no save is ever started inside a React state updater", () => {
  const src = read("src/app/app/plano/plano-client.tsx");
  assert.doesNotMatch(src, /set[A-Z]\w*\(\(prev\) => \{[^}]*startTransition/);
});

test("autosave keeps the latest value and reports failures", () => {
  const src = read("src/lib/use-autosave.ts");
  assert.match(src, /latest\.current/);
  assert.match(src, /while \(again\.current\)/, "a change made during a save is saved afterwards");
  assert.match(src, /setStatus\("error"\)/);
});

test("the flashcard limit is only saved when it is a valid number", () => {
  const src = read("src/app/app/plano/plano-client.tsx");
  assert.match(src, /n >= 5 && n <= 500/);
});

test("functions run in São Paulo, next to the database (sa-east-1)", () => {
  const cfg = JSON.parse(read("vercel.json"));
  assert.deepEqual(cfg.regions, ["gru1"]);
});

test("/app has a loading state, so a click answers at once", () => {
  assert.ok(existsSync(join(APP, "src/app/app/loading.tsx")));
});
