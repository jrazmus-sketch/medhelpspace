"use server";

// The optional WhatsApp step's three writes. Every one is keyed by the signed lead
// reference the capture action issued (lib/magnet/lead-ref) — never by e-mail — so
// a phone number can only be attached to a lead by the browser session that just
// created or re-entered it. All three are idempotent and never touch anything
// but the whatsapp_* columns and lead_events.

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyLeadRef } from "@/lib/magnet/lead-ref";
import {
  WHATSAPP_CONSENT_VERSION,
  WHATSAPP_EVENTS,
  normalizeBrMobile,
  type WhatsappFunnel,
} from "@/lib/whatsapp-optin";

type Result = { ok: true } | { ok: false; reason: "expired" | "invalid_phone" | "consent_required" | "failed" };

const FUNNELS: ReadonlySet<string> = new Set<WhatsappFunnel>(["flashcards", "simulado"]);

function resolve(ref: string | null | undefined): { leadId: string; funnel: WhatsappFunnel } | null {
  const v = verifyLeadRef(ref);
  if (!v || !FUNNELS.has(v.funnel)) return null;
  return { leadId: v.leadId, funnel: v.funnel as WhatsappFunnel };
}

async function event(leadId: string, type: string, metadata: Record<string, unknown>) {
  const { error } = await createAdminClient()
    .from("lead_events")
    .insert({ lead_id: leadId, event_type: type, metadata });
  if (error) console.error("whatsapp event failed", type, error);
}

/** The step was rendered. Stamped once; later views never move the date. */
export async function whatsappStepShown(input: { ref: string }): Promise<Result> {
  const who = resolve(input?.ref);
  if (!who) return { ok: false, reason: "expired" };
  const admin = createAdminClient();
  const { data } = await admin
    .from("leads")
    .select("whatsapp_step_shown_at")
    .eq("id", who.leadId)
    .maybeSingle();
  if (!data) return { ok: false, reason: "failed" };
  if (data.whatsapp_step_shown_at == null) {
    const { error } = await admin
      .from("leads")
      .update({ whatsapp_step_shown_at: new Date().toISOString() })
      .eq("id", who.leadId)
      .is("whatsapp_step_shown_at", null);
    if (error) return { ok: false, reason: "failed" };
    await event(who.leadId, WHATSAPP_EVENTS.shown, { funnel: who.funnel });
  }
  return { ok: true };
}

/** "Receber também pelo WhatsApp": number + ticked box → Autorizou. */
export async function submitWhatsappOptIn(input: { ref: string; phone: string; consent: boolean }): Promise<Result> {
  const who = resolve(input?.ref);
  if (!who) return { ok: false, reason: "expired" };
  if (input.consent !== true) return { ok: false, reason: "consent_required" };
  const e164 = normalizeBrMobile(input.phone);
  if (!e164) return { ok: false, reason: "invalid_phone" };

  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("leads")
    .update({
      whatsapp: e164,
      whatsapp_opt_in: true,
      whatsapp_opt_in_at: now,
      whatsapp_opt_in_source: who.funnel,
      whatsapp_consent_version: WHATSAPP_CONSENT_VERSION,
      whatsapp_revoked_at: null,
      whatsapp_step_shown_at: now, // in case the "shown" beacon never landed
    })
    .eq("id", who.leadId);
  if (error) {
    console.error("submitWhatsappOptIn failed", error);
    return { ok: false, reason: "failed" };
  }
  await event(who.leadId, WHATSAPP_EVENTS.accepted, { funnel: who.funnel, version: WHATSAPP_CONSENT_VERSION });
  return { ok: true };
}

/** "Continuar sem WhatsApp" → Não. Never downgrades an existing Autorizou. */
export async function skipWhatsappOptIn(input: { ref: string }): Promise<Result> {
  const who = resolve(input?.ref);
  if (!who) return { ok: false, reason: "expired" };
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("leads")
    .update({ whatsapp_opt_in: false, whatsapp_opt_in_source: who.funnel, whatsapp_step_shown_at: now })
    .eq("id", who.leadId)
    .is("whatsapp_opt_in", null)
    .select("id");
  if (error) return { ok: false, reason: "failed" };
  if ((data ?? []).length > 0) await event(who.leadId, WHATSAPP_EVENTS.skipped, { funnel: who.funnel });
  return { ok: true };
}
