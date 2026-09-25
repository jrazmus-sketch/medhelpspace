import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (p: string) => readFileSync(path.join(APP, p), "utf8").split("\r\n").join("\n");

test("every script that creates a table also enables RLS on it", () => {
  const dir = path.join(APP, "..", "scripts");
  const offenders = readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .filter((f) => {
      const src = readFileSync(path.join(dir, f), "utf8");
      return /CREATE TABLE/i.test(src) && !/ENABLE ROW LEVEL SECURITY/i.test(src);
    });
  assert.deepEqual(offenders, [], "Supabase grants new tables to anon/authenticated by default");
});

test("the search page never shows the database's own error to a student", () => {
  const src = read("src/app/app/buscar/page.tsx");
  assert.ok(!/\{queryError\}|error\.message\}/.test(src));
  assert.ok(src.includes("recordAppError("), "the real error goes to Admin → Erros");
});

test("cohort actions return their error codes instead of throwing them", () => {
  const actions = read("src/actions/admin.ts");
  for (const fn of ["createCohort", "updateCohort", "setCohortForSale"]) {
    assert.match(actions, new RegExp(`export async function ${fn}\\([\\s\\S]{0,200}\\): Promise<CohortActionResult>`), fn);
  }
  const client = read("src/app/admin/cohorts/cohorts-client.tsx");
  assert.equal((client.match(/if \(!res\.ok\) throw new Error\(res\.error\)/g) ?? []).length, 3);
});

test("the shared admin error strings exist in both languages", () => {
  for (const loc of ["en", "pt-BR"]) {
    const d = JSON.parse(read(`src/locales/admin/${loc}.json`)) as { errors: Record<string, string> };
    for (const k of ["generic", "notFound", "unauthorized", "network", "validation"]) {
      assert.equal(typeof d.errors[k], "string", `${loc}: errors.${k}`);
    }
  }
});
