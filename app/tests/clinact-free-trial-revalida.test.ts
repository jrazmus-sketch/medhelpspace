/**
 * Karina + Justin 2026-11-03: the free trial lands on the four free cases, a
 * free case is playable without a subscription, and nothing a ClinAct person
 * meets is branded Revalida (auth screens, confirmation e-mail, app e-mails,
 * share cards). Server files are checked on their source; pure helpers directly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { freeCaseSet } from "@/lib/clinact/library-filters";
import { isClinactDestination } from "@/lib/clinact/destination";
import { renderEmail, DEFAULT_EMAIL_SETTINGS, type EmailTemplateRow } from "@/lib/email-render";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

test("one free case per format, in the fixed format order", () => {
  const rows = [
    { id: 1, format: "ponto_de_virada", is_free: true },
    { id: 2, format: "codigo_clinico", is_free: false },
    { id: 3, format: "codigo_clinico", is_free: true },
    { id: 4, format: "codigo_clinico", is_free: true },
    { id: 5, format: "decisao_30s", is_free: true },
  ] as const;
  assert.deepEqual(freeCaseSet([...rows]).map((r) => r.id), [3, 5, 1]);
});

test("ClinAct destinations are recognised — and nothing that only starts with the word", () => {
  for (const n of ["/clinact", "/clinact/gratis", "/clinact/assinar?plano=anual", "/clinact?x=1"]) assert.equal(isClinactDestination(n), true, n);
  for (const n of [null, "", "/app", "/clinactx", "/loja?clinact"]) assert.equal(isClinactDestination(n), false, String(n));
});

test("a free case can be answered and restarted without a subscription", () => {
  const actions = read("src/actions/clinact.ts");
  assert.match(actions, /if \(!doc\.is_free && !ANY_ADMIN\.includes\(ctx\.role\)\)/);
  assert.match(actions, /if \(!c\.is_free && !ANY_ADMIN\.includes\(ctx\.role\)\)/);
});

test("the trial CTA and the end of a free case lead to /clinact/gratis; subscribers skip it", () => {
  assert.match(read("src/components/clinact/sales/sections.tsx"), /isLoggedIn \? "\/clinact\/gratis" : "\/signup\?next=%2Fclinact%2Fgratis"/);
  assert.match(read("src/components/clinact/case-player.tsx"), /subscribeCta \? "\/clinact\/gratis" : "\/clinact\/treinar"/);
  assert.match(read("src/app/clinact/(membro)/gratis/page.tsx"), /if \(viewer\.hasAccess && !viewer\.isAdmin\) redirect\("\/clinact\/treinar"\)/);
});

test("the fixed action bar is never lifted by its parent's space-y margin", () => {
  assert.match(read("src/components/clinact/case-player.tsx"), /className="fixed inset-x-0 bottom-0 z-40 mb-0 /);
});

test("ClinAct app e-mails wear the ClinAct frame; Revalida ones are unchanged", () => {
  const tpl = (kind: string): EmailTemplateRow =>
    ({ kind, name: "", description: "", subject: "s", kicker: "", headline: "h", body_html: "<p>b</p>", cta_label: "", cta_href: "" }) as EmailTemplateRow;
  const clinact = renderEmail(tpl("clinact-subscription-confirmed"), DEFAULT_EMAIL_SETTINGS, {}).html;
  assert.ok(clinact.includes("medhelpspace-clinact-wordmark-email.png"));
  assert.ok(clinact.includes("/clinact/assinatura"));
  assert.ok(!/Revalida/.test(clinact), "no Revalida anywhere in a ClinAct e-mail");
  const revalida = renderEmail(tpl("purchase"), DEFAULT_EMAIL_SETTINGS, {}).html;
  assert.ok(revalida.includes("medhelpspace-wordmark-email.png"));
  assert.ok(revalida.includes("MedHelpSpace Revalida"));
});

test("the confirmation e-mail switches its header on clinact_signup", () => {
  const html = read("../docs/auth-email-templates/confirmation.html");
  assert.match(html, /\{\{ if \.Data\.clinact_signup \}\}<img src="https:\/\/www\.medhelpspace\.com\.br\/brand\/medhelpspace-clinact-wordmark-email\.png"/);
  assert.match(read("src/app/auth/signup/route.ts"), /clinact_signup: true/);
});

test("auth screens and ClinAct routes never inherit the Revalida title or card", () => {
  assert.match(read("src/app/login/login-client.tsx"), /<AuthBrandLink clinact=\{isClinactDestination\(next\)\} \/>/);
  assert.match(read("src/app/signup/signup-client.tsx"), /<AuthBrandLink clinact=\{clinact\} \/>/);
  for (const p of ["src/app/clinact/page.tsx", "src/app/clinact/(membro)/layout.tsx"]) {
    assert.match(read(p), /CLINACT_SHARE_METADATA/, p);
  }
  assert.match(read("src/lib/membership-gate.ts"), /viewerIsClinactPerson\(\)\) \? "\/clinact\/treinar" : "\/loja"/);
});

test("a ClinAct signup gets the app's own ClinAct confirmation e-mail, not Supabase's template", async () => {
  const route = read("src/app/auth/signup/route.ts");
  assert.match(route, /if \(clinactSignup && !USE_MOCK_DATA\) \{\s*const \{ data: link, error: linkError \} = await createAdminClient\(\)\.auth\.admin\.generateLink\(\{\s*type: "signup"/);
  // Same link shape the dashboard template builds, so /auth/confirm is unchanged.
  assert.match(route, /href\.searchParams\.set\("token_hash", link\.properties\.hashed_token\)/);
  assert.match(route, /href\.searchParams\.set\("type", "signup"\)/);
  // The token link's host is the configured site, never the request's Host.
  assert.match(route, /const origin = new URL\(settings\.app_url\)\.origin;/);
  assert.ok(!/new URL\(request\.url\)\.origin;\s*const href/.test(route));
  const { clinactConfirmationEmailHtml, CLINACT_CONFIRMATION_SUBJECT } = await import("@/lib/clinact/confirmation-email");
  const html = clinactConfirmationEmailHtml("https://x.test/auth/confirm?token_hash=a&type=signup&next=/clinact/gratis", "https://x.test");
  assert.ok(html.includes("medhelpspace-clinact-wordmark-email.png"));
  assert.ok(html.includes("token_hash=a&amp;type=signup&amp;next=/clinact/gratis"));
  assert.ok(!/Revalida/.test(html + CLINACT_CONFIRMATION_SUBJECT));
  assert.match(read("src/app/signup/signup-client.tsx"), /already been registered/);
});
