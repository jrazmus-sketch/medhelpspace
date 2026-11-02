/**
 * The ClinAct sales page footer (Karina 2026-10-30, repeated 2026-11-01): the
 * MedHelpSpace social profiles, Termos de Uso, Política de Privacidade and the
 * WhatsApp contact on the same number as the floating button.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CLINACT_COPY } from "@/lib/clinact/site-copy";

const SRC = path.resolve(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");
const FOOTER = read("components/clinact/sales/clinact-footer.tsx");

test("the sales page renders the footer after every section, outside the orderable list", () => {
  const page = read("app/clinact/page.tsx");
  assert.ok(page.indexOf("<ClinactFooter />") > page.indexOf("sections.map("));
  assert.doesNotMatch(read("components/clinact/sales/sections.tsx"), /key: "footer"/);
});

test("Termos and Privacidade link to pages that exist", () => {
  for (const [href, dir] of [["/termos", "app/termos"], ["/privacidade", "app/privacidade"]]) {
    assert.match(FOOTER, new RegExp(`href="${href}"`));
    assert.ok(existsSync(path.join(SRC, dir, "page.tsx")), dir);
  }
});

test("social icons come from the one list both footers share, WhatsApp from lib/whatsapp", () => {
  assert.match(FOOTER, /<SocialLinks /);
  assert.match(read("components/landing/landing-footer.tsx"), /<SocialLinks /);
  assert.match(read("components/marketing/social-links.tsx"), /SOCIAL_PROFILES\.map/);
  assert.match(FOOTER, /whatsappUrl\("clinact"\)/);
  assert.doesNotMatch(FOOTER, /wa\.me|5575988672544/, "the number lives only in lib/whatsapp.ts");
});

test("its editable strings are in the copy map", () => {
  for (const k of ["clinact.footer.tagline", "clinact.footer.copyright"]) {
    assert.ok(k in CLINACT_COPY, k);
    assert.ok(FOOTER.includes(`"${k}"`), k);
  }
});

test("the checkout carries the Revalida store's reassurances, with Karina's ClinAct guarantee line", () => {
  const form = read("app/clinact/(membro)/assinar/subscribe-form.tsx");
  for (const t of ["Acesso imediato após confirmação", "Pagamento 100% seguro · PagBank"]) {
    assert.ok(form.includes(t), t);
    assert.ok(read("app/loja/page.tsx").includes(t), `/loja no longer says "${t}"`);
  }
  // Karina 2026-11-02: replaces "Garantia incondicional de 7 dias" on ClinAct only.
  assert.ok(form.includes("7 dias para cancelar e receber 100% do valor de volta"));
  assert.ok(!form.includes("Garantia incondicional"));
});
