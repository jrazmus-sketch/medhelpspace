// WhatsApp Business contact button — Karina, 2026-09-28 ("WhatsApp Business").
//
// One number, one message per product. The message is the ONLY thing that
// differs between the Revalida sales pages and the ClinAct sales page, so both
// live here and the button component takes a `product`. Pure module: no DOM, no
// Next runtime — the client button, the server pages and the tests all import it.
//
// Publishing is a `site_pages` row per product (same page-level gate the ClinAct
// sales page uses): while `published` is false only logged-in admins see the
// button, which is how Karina tests it on desktop and phone before the public
// does. Flip it from /admin/settings (super_admin) — never by editing copy.

export const WHATSAPP_NUMBER = "5575988672544";

export type WhatsAppProduct = "revalida" | "clinact";

/** Pre-filled message, exactly as Karina wrote it (2026-09-28). */
export const WHATSAPP_MESSAGES: Record<WhatsAppProduct, string> = {
  revalida:
    "Olá! Vim pelo site da MedHelpSpace e gostaria de saber mais sobre a preparação para o Revalida.",
  clinact: "Olá! Vim pelo site da MedHelpSpace e gostaria de saber mais sobre o ClinAct.",
};

/** `site_pages.page` key that gates each product's button. */
export const WHATSAPP_GATE_KEY: Record<WhatsAppProduct, string> = {
  revalida: "whatsapp-revalida",
  clinact: "whatsapp-clinact",
};

/**
 * wa.me handles the device split itself: on a phone it opens the WhatsApp app,
 * on a computer it opens WhatsApp Web (or the desktop app when installed).
 */
export function whatsappUrl(product: WhatsAppProduct): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGES[product])}`;
}

export const WHATSAPP_ARIA_LABEL = "Falar com a MedHelpSpace no WhatsApp";
