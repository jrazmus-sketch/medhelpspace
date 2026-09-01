import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeDestination,
  buildRefUrl,
  normalizeRefCode,
  REF_MAX_AGE_SECONDS,
} from "@/lib/ambassadors/ref-link";

// The ambassador tracking link is /r/<CODE>?destino=<path>. Both halves are
// public and shareable, which makes `destino` attacker-controlled: anyone can
// mint a link on OUR domain and choose where it lands.
//
// That is the whole risk. A visitor who checks the domain before clicking sees
// medhelpspace.com.br and trusts it — so an unguarded redirect here is worth
// more to a phishing campaign than one on a domain nobody recognises. These
// tests exist so the guard can never be quietly loosened.

test("ordinary same-origin paths pass through untouched", () => {
  assert.equal(safeDestination("/loja"), "/loja");
  assert.equal(safeDestination("/simulado-revalida"), "/simulado-revalida");
  assert.equal(safeDestination("/app/revalida-up"), "/app/revalida-up");
  assert.equal(safeDestination("/loja?turma=2027-1"), "/loja?turma=2027-1");
});

test("missing or empty destino falls back to the home page", () => {
  assert.equal(safeDestination(null), "/");
  assert.equal(safeDestination(undefined), "/");
  assert.equal(safeDestination(""), "/");
});

test("absolute URLs to another origin are rejected", () => {
  assert.equal(safeDestination("https://evil.com"), "/");
  assert.equal(safeDestination("http://evil.com/login"), "/");
  assert.equal(safeDestination("javascript:alert(1)"), "/");
  assert.equal(safeDestination("data:text/html,<script>"), "/");
});

test("protocol-relative URLs are rejected", () => {
  // The classic miss: starts with "/" so a naive check waves it through, but the
  // browser reads it as //host and leaves the origin entirely.
  assert.equal(safeDestination("//evil.com"), "/");
  assert.equal(safeDestination("//evil.com/phish"), "/");
});

test("backslash and colon tricks are rejected", () => {
  // Several parsers normalise a backslash to a slash, turning this into //evil.com.
  assert.equal(safeDestination("/\\evil.com"), "/");
  assert.equal(safeDestination("/\\/evil.com"), "/");
  // A colon can reintroduce a scheme after normalisation.
  assert.equal(safeDestination("/redirect:https://evil.com"), "/");
});

test("control characters are rejected", () => {
  // CR/LF could split a header; NUL can truncate the value before the guards.
  assert.equal(safeDestination("/loja\r\nLocation: https://evil.com"), "/");
  assert.equal(safeDestination("/loja\u0000"), "/");
  assert.equal(safeDestination("/lo\tja"), "/");
});

test("buildRefUrl produces the shareable link the panel shows", () => {
  assert.equal(
    buildRefUrl("https://medhelpspace.com.br", "MARIA10"),
    "https://medhelpspace.com.br/r/MARIA10",
  );
  assert.equal(
    buildRefUrl("https://medhelpspace.com.br", "MARIA10", "/loja"),
    "https://medhelpspace.com.br/r/MARIA10?destino=%2Floja",
  );
});

test("a code with URL-significant characters is escaped, not injected", () => {
  const url = buildRefUrl("https://medhelpspace.com.br", "a/b?c=d");
  assert.ok(!url.includes("/r/a/b"), "a slash in the code must not create a new path segment");
  assert.ok(url.startsWith("https://medhelpspace.com.br/r/"), "must stay on the /r/ route");
});

test("the attribution window is the contract's 30 days", () => {
  assert.equal(REF_MAX_AGE_SECONDS, 60 * 60 * 24 * 30);
});

// normalizeRefCode is what lets the two lookups use an exact match instead of a
// LIKE pattern. Attribution decides who gets paid a commission, so a visitor must
// never be able to hand-write a code that resolves to somebody else's.

test("a real code is normalized to the stored uppercase form", () => {
  assert.equal(normalizeRefCode("MARIA10"), "MARIA10");
  assert.equal(normalizeRefCode("maria10"), "MARIA10");
  assert.equal(normalizeRefCode("  Maria10  "), "MARIA10");
  // The creation rule allows these three punctuation marks, so lookup must too.
  assert.equal(normalizeRefCode("dra.maria_10-b"), "DRA.MARIA_10-B");
});

test("empty and missing codes resolve to nothing", () => {
  assert.equal(normalizeRefCode(null), null);
  assert.equal(normalizeRefCode(undefined), null);
  assert.equal(normalizeRefCode(""), null);
  assert.equal(normalizeRefCode("   "), null);
});

test("LIKE wildcards are rejected outright", () => {
  // The bug this exists to prevent: /r/% under a pattern lookup matches the
  // first ambassador in the table and credits that person's sales.
  assert.equal(normalizeRefCode("%"), null);
  assert.equal(normalizeRefCode("MARIA%"), null);
  assert.equal(normalizeRefCode("M%RIA10"), null);
  // "_" is NOT rejected here: it is a legal code character (DRA.MARIA_10-B
  // above). What stops it matching any single character is the exact-match
  // lookup at the call sites, which is the whole reason this helper exists.
  assert.equal(normalizeRefCode("m_ria10"), "M_RIA10");
  // PostgREST reads "*" as "%" before the pattern reaches Postgres.
  assert.equal(normalizeRefCode("*"), null);
  assert.equal(normalizeRefCode("MARIA*"), null);
  // A backslash is the default LIKE escape character.
  assert.equal(normalizeRefCode("MARIA\\10"), null);
});

test("codes outside the minting charset are rejected", () => {
  assert.equal(normalizeRefCode("MARIA 10"), null);
  assert.equal(normalizeRefCode("MARIA/10"), null);
  assert.equal(normalizeRefCode("MARIA'10"), null);
  assert.equal(normalizeRefCode("MARIA,10"), null);
  assert.equal(normalizeRefCode("MARIA\u0000"), null);
});

// The auth confirmation route (`/auth/confirm`) builds its redirect as
// `${origin}${next}` and now runs `next` through this same guard. These are the
// shapes that turn that concatenation into a DIFFERENT host — the reason the
// guard had to be there before the ClinAct sales page threads `next` into
// signup links.
test("origin-concatenation escapes are refused (the /auth/confirm vector)", () => {
  // "https://site.com" + "@evil.com" → host becomes evil.com (userinfo trick).
  assert.equal(safeDestination("@evil.com"), "/");
  assert.equal(safeDestination("evil.com"), "/");
  assert.equal(safeDestination("//evil.com"), "/");
  // A literal backslash, spelled out so no escaping layer can quietly eat it.
  assert.equal(safeDestination("/" + String.fromCharCode(92) + "evil.com"), "/");
  assert.equal(safeDestination("https://evil.com"), "/");
  // ...while the destinations the sales page actually needs survive untouched.
  assert.equal(safeDestination("/clinact/treinar"), "/clinact/treinar");
  assert.equal(safeDestination("/clinact/caso/tep-paciente-instavel"), "/clinact/caso/tep-paciente-instavel");
});
