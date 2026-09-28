import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  WHATSAPP_CONSENT_LINK_LABEL,
  WHATSAPP_CONSENT_TEXT,
  WHATSAPP_CONSENT_VERSION,
  WHATSAPP_OPTIN_GATE_KEY,
  formatBrMobile,
  maskBrMobileInput,
  normalizeBrMobile,
  shouldShowWhatsappStep,
  whatsappStatusOf,
} from "@/lib/whatsapp-optin";
import { signLeadRef, verifyLeadRef } from "@/lib/magnet/lead-ref";

const SRC = path.join(process.cwd(), "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8").split("\r\n").join("\n");

test("Karina's consent wording is the one on record, and the policy name is linkable", () => {
  assert.equal(
    WHATSAPP_CONSENT_TEXT,
    "Quero receber mensagens da MedHelpSpace pelo WhatsApp com materiais e conteúdos educacionais, novidades, ofertas, descontos e cupons. Posso cancelar a qualquer momento. Consulte a Política de Privacidade.",
  );
  assert.ok(WHATSAPP_CONSENT_TEXT.includes(WHATSAPP_CONSENT_LINK_LABEL));
  assert.equal(WHATSAPP_CONSENT_VERSION, "wa-2026-09-v1");
  assert.equal(WHATSAPP_OPTIN_GATE_KEY, "whatsapp-optin");
});

test("Brazilian mobile numbers normalise to E.164 and format back with the mask", () => {
  for (const raw of ["(11) 99999-1234", "11999991234", "+55 11 99999-1234", "011 9 9999 1234", "5511999991234"]) {
    assert.equal(normalizeBrMobile(raw), "+5511999991234", raw);
  }
  assert.equal(formatBrMobile("+5511999991234"), "(11) 99999-1234");
  assert.equal(maskBrMobileInput("1199999123"), "(11) 99999-123");
  assert.equal(maskBrMobileInput("11"), "(11");
  assert.equal(maskBrMobileInput(""), "");
  // Rejected: landline (no 9), unknown DDD, too short, keyboard mash, empty.
  for (const bad of ["(11) 3333-1234", "(10) 99999-1234", "1199999", "11999999999", "", null, undefined]) {
    assert.equal(normalizeBrMobile(bad as string), null, String(bad));
  }
});

test("the four admin statuses derive from the columns exactly as Karina defined them", () => {
  const base = { whatsappOptIn: null, whatsappRevokedAt: null, whatsappStepShownAt: null };
  assert.equal(whatsappStatusOf(base), null);
  assert.equal(whatsappStatusOf({ ...base, whatsappStepShownAt: "2026-09-28T10:00:00Z" }), "nao_informado");
  assert.equal(whatsappStatusOf({ ...base, whatsappOptIn: false }), "nao");
  assert.equal(whatsappStatusOf({ ...base, whatsappOptIn: true }), "autorizou");
  assert.equal(whatsappStatusOf({ ...base, whatsappOptIn: true, whatsappRevokedAt: "2026-10-01T10:00:00Z" }), "revogado");
});

test("the step shows when live, or to an admin in test mode, and never after a settled answer", () => {
  const info = { ref: "x", enabled: false, done: false };
  assert.equal(shouldShowWhatsappStep(info, false), false);
  assert.equal(shouldShowWhatsappStep(info, true), true);
  assert.equal(shouldShowWhatsappStep({ ...info, enabled: true }, false), true);
  assert.equal(shouldShowWhatsappStep({ ...info, enabled: true, done: true }, true), false);
  assert.equal(shouldShowWhatsappStep(null, true), false);
});

test("a lead ref round-trips, expires, and cannot be forged or re-targeted", () => {
  process.env.LEAD_REF_SECRET ??= "test-secret";
  const now = new Date("2026-09-28T12:00:00Z");
  const ref = signLeadRef("11111111-2222-3333-4444-555555555555", "flashcards", now);
  assert.deepEqual(verifyLeadRef(ref, now), { leadId: "11111111-2222-3333-4444-555555555555", funnel: "flashcards" });
  assert.equal(verifyLeadRef(ref, new Date("2026-09-28T14:00:01Z")), null, "expired after 2h");
  assert.equal(verifyLeadRef(ref.replace("flashcards", "simulado"), now), null, "tampered funnel");
  assert.equal(verifyLeadRef(ref.slice(0, -1) + "A", now), null, "tampered signature");
  assert.equal(verifyLeadRef("garbage", now), null);
});

test("the step sits where Karina placed it: after the turma in flashcards, after the e-mail gate in the quiz", () => {
  const fc = read("components/magnet/flashcards-gate.tsx");
  // chooseCohort (turma) decides between "whatsapp" and "sent"; submitEmail does NOT.
  const chooseCohort = fc.slice(fc.indexOf("function chooseCohort"), fc.indexOf("// ── Confirmation"));
  assert.match(chooseCohort, /shouldShowWhatsappStep\(/, "flashcards: the turma step must hand off to WhatsApp");
  const submitEmail = fc.slice(fc.indexOf("function submitEmail"), fc.indexOf("function chooseCohort"));
  assert.doesNotMatch(submitEmail, /setPhase\("whatsapp"\)/, "flashcards: WhatsApp must not come before the turma");
  assert.match(fc, /onDone=\{\(\) => setPhase\("sent"\)\}/, "flashcards: after WhatsApp comes the confirmation");

  const quiz = read("components/magnet/magnet-quiz.tsx");
  const submitGate = quiz.slice(quiz.indexOf("function submitGate"), quiz.indexOf("function onVerified"));
  assert.match(submitGate, /shouldShowWhatsappStep\(/, "quiz: the e-mail gate must hand off to WhatsApp");
  assert.match(quiz, /onDone=\{\(\) => setPhase\("quiz"\)\}/, "quiz: after WhatsApp the questions resume");

  // Not the 100-question simulado — Karina wants to watch the two funnels first.
  const sim = read("components/magnet/simulado-gate.tsx");
  assert.doesNotMatch(sim, /WhatsappOptinStep/, "simulado-100 must not carry the step yet");
});

test("the capture actions issue the step info and the gate is flippable from settings", () => {
  const magnet = read("actions/magnet.ts");
  const fcAction = magnet.slice(magnet.indexOf("export async function captureFlashcardsLead"), magnet.indexOf("export async function chooseFlashcardsCohortAndSend"));
  assert.match(fcAction, /buildWhatsappStepInfo\(admin, email, "flashcards"\)/);
  const unlock = magnet.slice(magnet.indexOf("export async function captureLeadAndUnlock"), magnet.indexOf("export async function saveLeadForLater"));
  assert.match(unlock, /buildWhatsappStepInfo\(admin, email, "simulado"\)/);
  assert.match(read("actions/site-pages.ts"), /\[WHATSAPP_OPTIN_GATE_KEY\]:/);
  assert.match(read("app/admin/settings/site-toggles.tsx"), /WHATSAPP_OPTIN_GATE_KEY/);
});

test("the privacy policy fallback carries the WhatsApp section the live row will get", () => {
  const page = read("app/privacidade/page.tsx");
  assert.match(page, /Comunicações pelo WhatsApp/);
  assert.match(page, /SAIR/);
  const patch = readFileSync(path.join(process.cwd(), "..", "schema-patch-privacidade-whatsapp.sql"), "utf8");
  assert.match(patch, /Comunicações pelo WhatsApp/);
});
