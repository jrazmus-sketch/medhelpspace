import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { errorFingerprint, normalizeMessage, pathOnly, trimStack } from "@/lib/app-errors";
import { ADMIN_NOTIFY_DEFAULTS, ADMIN_NOTIFY_ELIGIBLE_ROLES, DAILY_ONLY_EVENTS } from "@/lib/admin-notify-types";

const SRC = path.join(process.cwd(), "src");
// Line endings normalised: git may check files out with CRLF on Windows.
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8").split("\r\n").join("\n");

test("only the path is ever kept — query strings carry lead tokens and magic links", () => {
  assert.equal(pathOnly("https://www.medhelpspace.com.br/resultado?lead=SECRET#x"), "/resultado");
  assert.equal(pathOnly("/simulado/acesso?t=SECRET"), "/simulado/acesso");
  assert.equal(pathOnly(null), null);
});

test("occurrences that differ only in ids, numbers or quoted values are one error", async () => {
  assert.equal(
    normalizeMessage('Cannot read "answers" of order 3f2b1c4d-0000-4000-8000-000000000001 at 42'),
    normalizeMessage('Cannot read "options" of order 9a8b7c6d-1111-4111-8111-111111111111 at 7'),
  );
  const a = await errorFingerprint({ kind: "client", route: "/x", digest: null, message: "Failed at 12" });
  const b = await errorFingerprint({ kind: "client", route: "/x", digest: null, message: "Failed at 99" });
  const c = await errorFingerprint({ kind: "client", route: "/y", digest: null, message: "Failed at 12" });
  assert.equal(a, b);
  assert.notEqual(a, c, "the same message on another route is another error");
});

test("a server digest identifies the error even when messages differ", async () => {
  const a = await errorFingerprint({ kind: "server", route: "/app", digest: "123", message: "one" });
  const b = await errorFingerprint({ kind: "server", route: "/app", digest: "123", message: "two" });
  assert.equal(a, b);
});

test("stacks are capped", () => {
  const long = Array.from({ length: 50 }, (_, i) => `    at f${i} (x.ts:${i})`).join("\n");
  assert.equal(trimStack(long)!.split("\n").length, 15);
});

test("errors reach admins only through the daily digest, never as instant e-mails", () => {
  assert.ok(DAILY_ONLY_EVENTS.has("app_error"));
  assert.equal(ADMIN_NOTIFY_DEFAULTS.app_error, "daily");
  assert.deepEqual([...ADMIN_NOTIFY_ELIGIBLE_ROLES.app_error], ["super_admin"]);
  const instrumentation = read("instrumentation.ts");
  assert.ok(!instrumentation.includes("recordAdminAlert("), "recordAdminAlert sends instant e-mails");
  assert.ok(instrumentation.includes("recordAppError("));
});

test("browser reports are same-origin only, rate-limited on their own bucket, and body-capped", () => {
  const route = read("app/api/client-error/route.ts");
  assert.ok(route.includes("new URL(source).host === request.nextUrl.host"));
  assert.ok(route.includes("checkRateLimit(`client-error:"));
  assert.ok(route.includes("raw.length > MAX_BODY"));
  for (const f of ["app/error.tsx", "app/global-error.tsx"]) {
    assert.ok(read(f).includes("reportClientError(error)"), `${f} must report`);
  }
});
