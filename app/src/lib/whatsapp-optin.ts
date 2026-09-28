// Optional WhatsApp opt-in step in the lead funnels — Karina, 2026-09-28
// ("Nova etapa opcional de WhatsApp na captação de leads").
//
// Pure module (no DOM, no Next runtime): copy, consent text + version, phone
// normalisation and the status derivation the admin panel shows. The step
// component, the server actions, the admin read models and the tests all import it.
//
// Rules she set:
//  • The e-mail is saved BEFORE this step ever shows; nothing here can lose a lead.
//  • Flashcards: e-mail → turma → WhatsApp → confirmação. Simulado de 15:
//    e-mail → WhatsApp → questões 6–15 → turma → resultado. Not the 100-question
//    simulado (later, after she has watched these two).
//  • Consent box starts UNCHECKED; two equal buttons; never a small "pular".
//  • Number stored in E.164, shown with the Brazilian mask.
//  • Consent text is a versioned constant: bump WHATSAPP_CONSENT_VERSION whenever
//    the wording changes, so every opt-in records which text was accepted.

export const WHATSAPP_OPTIN_GATE_KEY = "whatsapp-optin";

export type WhatsappFunnel = "flashcards" | "simulado";

export const WHATSAPP_CONSENT_VERSION = "wa-2026-09-v1";

/** Karina's exact wording (2026-09-28). The last sentence is rendered as a link. */
export const WHATSAPP_CONSENT_TEXT =
  "Quero receber mensagens da MedHelpSpace pelo WhatsApp com materiais e conteúdos educacionais, novidades, ofertas, descontos e cupons. Posso cancelar a qualquer momento. Consulte a Política de Privacidade.";
export const WHATSAPP_CONSENT_LINK_LABEL = "Política de Privacidade";
export const WHATSAPP_CONSENT_LINK_HREF = "/privacidade";

export const WHATSAPP_STEP_COPY = {
  title: "Quer receber também pelo WhatsApp?",
  body: "Receba materiais, conteúdos, novidades, ofertas, descontos e cupons da MedHelpSpace diretamente no seu WhatsApp.",
  label: "WhatsApp com DDD",
  placeholder: "(11) 99999-9999",
  accept: "Receber também pelo WhatsApp",
  skip: {
    flashcards: "Continuar sem WhatsApp",
    simulado: "Continuar para as questões sem WhatsApp",
  } as Record<WhatsappFunnel, string>,
  errors: {
    phone: "Digite um número de celular com DDD, por exemplo (11) 99999-9999.",
    consent: "Para receber pelo WhatsApp, marque a caixa de autorização.",
    generic: "Não foi possível salvar agora. Você pode continuar sem WhatsApp.",
  },
} as const;

/** lead_events.event_type values written by the step (one row each, per lead). */
export const WHATSAPP_EVENTS = {
  shown: "whatsapp_step_shown",
  accepted: "whatsapp_opt_in",
  skipped: "whatsapp_skipped",
} as const;

// ── Phone ────────────────────────────────────────────────────────────────────

// Every Brazilian area code in use (ANATEL). Rejects 10, 20, 23, 25, 26, 29, 30,
// 39, 40, 50, 52, 56–60, 70, 72, 76, 78, 80, 90 — none of which exist.
const BR_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46,
  47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85,
  86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * "(11) 99999-9999", "11999999999", "+55 11 99999-9999", "011 9 9999 9999" →
 * "+5511999999999". Returns null for anything that is not a Brazilian mobile:
 * wrong length, unknown DDD, no leading 9 on the subscriber number, or a
 * keyboard-mash like 11999999999 repeated digits.
 */
export function normalizeBrMobile(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 12 && d.startsWith("0")) d = d.slice(1);
  if (d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (!BR_DDD.has(ddd)) return null;
  if (d[2] !== "9") return null;
  const subscriber = d.slice(3);
  if (/^(\d)\1{7}$/.test(subscriber)) return null; // 99999999 / 00000000
  return `+55${d}`;
}

/** "+5511999999999" → "(11) 99999-9999". Anything else is returned untouched. */
export function formatBrMobile(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+55(\d{2})(\d{5})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Progressive input mask for the step's text field: keeps only digits, caps at 11. */
export function maskBrMobileInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ── Status (admin) ───────────────────────────────────────────────────────────

/**
 * Karina's four states (2026-09-28):
 *   autorizou      — gave the number, ticked the box, confirmed
 *   nao            — clicked "continuar sem WhatsApp"
 *   nao_informado  — saw the step and did not finish it
 *   revogado       — had authorised, later asked to stop
 * null = the step was never shown to this lead (older leads, other funnels).
 */
export type WhatsappStatus = "autorizou" | "nao" | "nao_informado" | "revogado";

export function whatsappStatusOf(lead: {
  whatsappOptIn: boolean | null;
  whatsappRevokedAt: string | null;
  whatsappStepShownAt: string | null;
}): WhatsappStatus | null {
  if (lead.whatsappRevokedAt) return "revogado";
  if (lead.whatsappOptIn === true) return "autorizou";
  if (lead.whatsappOptIn === false) return "nao";
  if (lead.whatsappStepShownAt) return "nao_informado";
  return null;
}

/** What the capture actions hand the client so it can decide whether to show the step. */
export type WhatsappStepInfo = {
  /** Signed reference to the lead row (lib/magnet/lead-ref); never the id itself. */
  ref: string;
  /** site_pages gate: true = live for everyone, false = admins only (test mode). */
  enabled: boolean;
  /** Already authorised or revoked — never ask again. */
  done: boolean;
};

/** Client-side decision: show the step when it is live, or to an admin in test mode. */
export function shouldShowWhatsappStep(info: WhatsappStepInfo | null | undefined, isAdmin: boolean): boolean {
  if (!info || info.done) return false;
  return info.enabled || isAdmin;
}
