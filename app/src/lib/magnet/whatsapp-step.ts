// Server-side helper for the capture actions: after the e-mail step has written
// (or found) the lead row, decide what the browser needs to run the optional
// WhatsApp step — a signed reference to the row, whether the step is live for
// the public, and whether this lead is already settled (authorised / revoked).
//
// Not a "use server" file on purpose: that would turn this helper into a public
// action. It is called from inside captureFlashcardsLead / captureLeadAndUnlock.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSitePagePublished } from "@/lib/queries/site-sections";
import { signLeadRef } from "@/lib/magnet/lead-ref";
import { WHATSAPP_OPTIN_GATE_KEY, type WhatsappFunnel, type WhatsappStepInfo } from "@/lib/whatsapp-optin";

export async function buildWhatsappStepInfo(
  admin: SupabaseClient,
  email: string,
  funnel: WhatsappFunnel,
): Promise<WhatsappStepInfo | undefined> {
  try {
    const { data } = await admin
      .from("leads")
      .select("id, whatsapp_opt_in, whatsapp_revoked_at")
      .eq("email", email)
      .maybeSingle();
    if (!data) return undefined;
    const enabled = await getSitePagePublished(WHATSAPP_OPTIN_GATE_KEY);
    return {
      ref: signLeadRef(data.id as string, funnel),
      enabled,
      done: data.whatsapp_opt_in === true || data.whatsapp_revoked_at != null,
    };
  } catch {
    // The step is optional by definition: any failure here means "don't ask".
    return undefined;
  }
}
