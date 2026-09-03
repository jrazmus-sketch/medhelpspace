import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { safeDestination } from "@/lib/ambassadors/ref-link";

// Etapa 3 (ClinAct commercial) opens with: sales page → signup/login → the four
// free cases. That chain needs `next` to survive login, signup and the
// confirmation e-mail — and `next` is attacker-controlled the whole way.

const SRC = path.resolve(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");

const BS = String.fromCharCode(92); // a literal backslash, unmangled by the shell

// ── The guard itself ────────────────────────────────────────────────────────

test("only same-origin rooted paths survive the guard", () => {
  assert.equal(safeDestination("/clinact/treinar"), "/clinact/treinar");
  assert.equal(safeDestination("/clinact/caso/a-pressao-nao-respondeu"), "/clinact/caso/a-pressao-nao-respondeu");
  // Everything that could leave the origin falls back to "/".
  for (const hostile of [
    "https://evil.com",
    "//evil.com",
    "/" + BS + "evil.com",
    "javascript:alert(1)",
    "/x:y",
    "@evil.com",
    "/path" + String.fromCharCode(10) + "Location: https://evil.com",
  ]) {
    assert.equal(safeDestination(hostile), "/", `must not pass through: ${JSON.stringify(hostile)}`);
  }
});

// ── Login: `next` was declared and then ignored ─────────────────────────────

test("the login route lands on next, not always /app", () => {
  const route = read("app/auth/login/route.ts");
  assert.ok(route.includes("safeDestination"), "login must validate next");
  assert.ok(
    /successResponse = NextResponse\.redirect\(`\$\{origin\}\$\{next\}`/.test(route),
    "the success redirect must use next",
  );
  assert.ok(!/redirect\(`\$\{origin\}\/app`/.test(route), "no hardcoded /app redirect may remain");
});

test("a failed login keeps the destination", () => {
  const route = read("app/auth/login/route.ts");
  assert.ok(route.includes("backToLogin"), "errors go back to /login carrying next");
  // Two call sites: empty fields and rejected credentials.
  assert.equal(route.match(/backToLogin\(/g)?.length, 2, "used on both error paths");
});

test("the login form carries next, and the page validates it", () => {
  const page = read("app/login/page.tsx");
  assert.ok(page.includes("safeDestination"), "page must validate next");
  assert.ok(page.includes("redirect(next ?? \"/app\")"), "an already-signed-in user goes to next");
  const client = read("app/login/login-client.tsx");
  assert.ok(client.includes('name="next"'), "the form must post next");
});

// ── Signup: the destination must survive the confirmation e-mail ────────────

test("signup carries next into emailRedirectTo", () => {
  const route = read("app/auth/signup/route.ts");
  assert.ok(route.includes("safeDestination"), "signup must validate next");
  assert.ok(route.includes('confirmUrl.searchParams.set("next", next)'), "next rides on the confirm URL");
  assert.ok(
    !/emailRedirectTo: `\$\{new URL\(request\.url\)\.origin\}\/auth\/confirm`/.test(route),
    "the hardcoded confirm URL must be gone",
  );
});

test("the signup page and client thread next through", () => {
  const page = read("app/signup/page.tsx");
  assert.ok(page.includes("safeDestination"));
  assert.ok(page.includes("<SignupPageClient next={next} />"));
  const client = read("app/signup/signup-client.tsx");
  assert.ok(client.includes("next,"), "next is sent to /auth/signup");
  assert.ok(!/router\.push\("\/app"\)/.test(client), "no hardcoded /app push may remain");
  assert.equal(client.match(/router\.push\(next \?\? "\/app"\)/g)?.length, 2, "both success paths honour it");
});

test("/auth/confirm still guards next on the way back", () => {
  // Defence in depth: signup validates before sending the mail, confirm
  // validates again when the link is clicked.
  const route = read("app/auth/confirm/route.ts");
  assert.ok(route.includes("safeDestination"), "confirm must keep its own guard");
});
