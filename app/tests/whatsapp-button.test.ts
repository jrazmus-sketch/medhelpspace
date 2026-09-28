import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { WHATSAPP_GATE_KEY, WHATSAPP_MESSAGES, WHATSAPP_NUMBER, whatsappUrl } from "@/lib/whatsapp";

const SRC = path.join(process.cwd(), "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");

// The two links exactly as Karina sent them (2026-09-28, "WhatsApp Business").
const KARINA_LINKS = {
  revalida:
    "https://wa.me/5575988672544?text=Ol%C3%A1%21%20Vim%20pelo%20site%20da%20MedHelpSpace%20e%20gostaria%20de%20saber%20mais%20sobre%20a%20prepara%C3%A7%C3%A3o%20para%20o%20Revalida",
  clinact:
    "https://wa.me/5575988672544?text=Ol%C3%A1%21%20Vim%20pelo%20site%20da%20MedHelpSpace%20e%20gostaria%20de%20saber%20mais%20sobre%20o%20ClinAct",
} as const;

test("each product's link opens Karina's number with her exact message", () => {
  for (const product of ["revalida", "clinact"] as const) {
    const ours = new URL(whatsappUrl(product));
    const hers = new URL(KARINA_LINKS[product]);
    assert.equal(ours.host, "wa.me");
    assert.equal(ours.pathname, `/${WHATSAPP_NUMBER}`);
    assert.equal(ours.pathname, hers.pathname);
    // Her links lack the final period she wrote in the message body; the message
    // we send is the one she wrote out ("…Revalida." / "…ClinAct.").
    assert.equal(ours.searchParams.get("text"), WHATSAPP_MESSAGES[product]);
    assert.equal(hers.searchParams.get("text") + ".", WHATSAPP_MESSAGES[product]);
  }
});

test("both Revalida sales pages mount the button behind the same gate", () => {
  for (const page of ["app/page.tsx", "app/loja/page.tsx"]) {
    const src = read(page);
    assert.match(src, /<WhatsAppButton product="revalida" published=\{whatsappPublished\} \/>/, page);
    assert.match(src, /getSitePagePublished\(WHATSAPP_GATE_KEY\.revalida\)/, page);
  }
  assert.equal(WHATSAPP_GATE_KEY.revalida, "whatsapp-revalida");
  assert.equal(WHATSAPP_GATE_KEY.clinact, "whatsapp-clinact");
});

test("the button yields to the bottom bar and the consent card, and the admin pill moved aside", () => {
  const button = read("components/marketing/whatsapp-button.tsx");
  assert.match(button, /var\(--mhs-bottom-bar-h, 0px\)/, "button does not add the sticky bar's height");
  assert.match(button, /hasConsentChoice\(\)/, "button does not wait for the consent card");
  assert.match(button, /z-\[65\]/, "button must sit below the consent card (z-70) and above the bar (z-50)");
  assert.match(button, /target="_blank"/);
  const bar = read("components/landing/sticky-cta-bar.tsx");
  assert.match(bar, /setProperty\("--mhs-bottom-bar-h"/, "sticky bar does not publish its height");
  assert.match(bar, /removeProperty\("--mhs-bottom-bar-h"\)/, "sticky bar never clears its height");
  const pill = read("components/layout/public-edit-toggle.tsx");
  assert.doesNotMatch(pill, /bottom-5 right-5/, "admin edit pill still sits on the WhatsApp corner");
});

test("the gate can only be flipped by super_admin and revalidates both sales pages", () => {
  const action = read("actions/site-pages.ts");
  assert.match(action, /who\.role !== "super_admin"/);
  assert.match(action, /\[WHATSAPP_GATE_KEY\.revalida\]: \["\/", "\/loja"\]/);
});
