import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Permanent lead delete (Karina 2026-09-28). Source-level guards: the action is
// role-gated and audited, removes the address-keyed email history the FK cascade
// cannot reach, and the UI never deletes without the confirmation modal.

const SRC = path.join(process.cwd(), "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8").split("\r\n").join("\n");

test("bulkDeleteLeads is gated, capped, cleans email history, and leaves an audit row", () => {
  const src = read("actions/leads.ts");
  const fn = src.slice(src.indexOf("export async function bulkDeleteLeads"));
  assert.match(fn, /await requireLeadsRole\(\)/);
  assert.match(fn, /leadIds\.length > 200/);
  assert.match(fn, /from\("lead_email_events"\)\s*\.delete\(\)/);
  assert.match(fn, /from\("leads"\)\s*\.delete\(\)/);
  assert.match(fn, /action: "lead_delete"/);
  assert.match(fn, /maskAddress\(r\.email\)/, "audit must store masked addresses only");
});

test("the list only deletes through the destructive confirmation modal", () => {
  const ui = read("app/admin/leads/leads-client.tsx");
  assert.match(ui, /setConfirmAction\("delete"\)/, "menu item must open the confirm modal");
  assert.doesNotMatch(ui, /onClick=\{\(\) => \{\s*setMoreMenuOpen\(false\);\s*void handleBulkDelete\(\)/, "delete must not fire straight from the menu");
  assert.match(ui, /destructive=\{confirmAction === "unsubscribe" \|\| confirmAction === "delete"\}/);
  assert.match(ui, /if \(confirmAction === "delete"\) void handleBulkDelete\(\);/);
  for (const loc of ["pt-BR", "en"]) {
    const d = JSON.parse(readFileSync(path.join(SRC, "locales", "admin", `${loc}.json`), "utf8"));
    for (const k of ["bulkDelete", "bulkDeleteTitle", "bulkDeleteDescriptionOne", "bulkDeleteDescriptionOther", "bulkDeleteConfirm", "bulkDeleteSuccessOne", "bulkDeleteSuccessOther"]) {
      assert.ok(d.leads[k], `${loc}: missing leads.${k}`);
    }
  }
});
