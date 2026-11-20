/**
 * Deleting a member who once paid ClinAct (2026-11-20): Karina's delete of her ClinAct test account failed with
 * "Database error deleting user" because clinact_invoices.user_id was ON DELETE RESTRICT. The invoice is a fiscal
 * record and is KEPT (link cleared, as orders), and an account whose ClinAct subscription is still live at PagBank
 * is refused with a readable message (returned, never thrown — prod redacts thrown Server Action messages).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");
const root = (...p: string[]) => readFileSync(path.join(process.cwd(), "..", ...p), "utf8");

test("the invoice survives the account: SET NULL, never RESTRICT or CASCADE", () => {
  const p = root("schema-patch-clinact-invoices-keep-on-delete.sql").replace(/--.*$/gm, "");
  assert.match(p, /ALTER COLUMN user_id DROP NOT NULL/);
  assert.match(p, /REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
  assert.doesNotMatch(p, /ON DELETE (CASCADE|RESTRICT)/);
});

test("a live ClinAct subscription blocks the delete, with a returned reason the screen translates", () => {
  const a = src("actions", "admin.ts");
  const fn = a.slice(a.indexOf("export async function deleteMember"));
  assert.match(fn, /from\("clinact_subscriptions"\)/);
  assert.match(fn, /return \{ ok: false, reason: "clinact_subscription_active" \}/);
  assert.ok(fn.indexOf("clinact_subscriptions") < fn.indexOf("auth.admin.deleteUser"), "checked BEFORE deleting");
  assert.match(a, /const CLINACT_SUBSCRIPTION_ENDED = \["CANCELED", "EXPIRED"\]/);
  const c = src("app", "admin", "members", "members-client.tsx");
  assert.match(c, /t\("members\.deleteBlockedClinact"\)/);
  for (const loc of ["pt-BR", "en"]) {
    const j = JSON.parse(src("locales", "admin", `${loc}.json`));
    assert.ok(j.members.deleteBlockedClinact, `${loc} has the message`);
  }
});

test("an invoice whose account was deleted is not refunded from the screen (no access or subscription to touch)", () => {
  const r = src("lib", "clinact", "refund.ts");
  const guard = r.indexOf("if (!invoice.user_id)");
  assert.ok(guard > 0 && guard < r.indexOf("refund_claimed_at: new Date()"), "guard runs before the claim / any money");
});
