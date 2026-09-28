"use server";

// Publish gates that are not whole pages — today the WhatsApp button per product.
// Same `site_pages` table and the same posture as the ClinAct sales page: false
// means "only admins see it", true means public. super_admin only, audited, and
// the ISR pages that render the gated thing are revalidated so the flip is
// instant instead of "within the hour".

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WHATSAPP_GATE_KEY } from "@/lib/whatsapp";
import { WHATSAPP_OPTIN_GATE_KEY } from "@/lib/whatsapp-optin";

// Gate key → the public paths that render it. A key not listed here cannot be
// flipped from this action, so a typo can never create a stray site_pages row.
const GATES: Record<string, readonly string[]> = {
  [WHATSAPP_GATE_KEY.revalida]: ["/", "/loja"],
  // The ClinAct chat adds WHATSAPP_GATE_KEY.clinact → ["/clinact"] when it mounts
  // the button on that page (see CLINACT-WHATSAPP-BUTTON-SPEC.md).
  // Optional WhatsApp step in the lead funnels (both pages are force-dynamic, so
  // the flip is instant; the revalidate is harmless).
  [WHATSAPP_OPTIN_GATE_KEY]: ["/flashcards-revalida", "/questoes-revalida"],
};

export type GateResult = { ok: true; published: boolean } | { ok: false; error: "forbidden" | "invalid" | "failed" };

async function actor(): Promise<{ userId: string; role: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await createAdminClient().from("profiles").select("role").eq("id", user.id).single();
  return { userId: user.id, role: (profile?.role as string) ?? "member" };
}

/** Current state of a gate, for the admin toggle. Missing row = not published. */
export async function getSiteGate(page: string): Promise<GateResult> {
  const who = await actor();
  if (!who || who.role !== "super_admin") return { ok: false, error: "forbidden" };
  if (!(page in GATES)) return { ok: false, error: "invalid" };
  const { data, error } = await createAdminClient().from("site_pages").select("published").eq("page", page).maybeSingle();
  if (error) return { ok: false, error: "failed" };
  return { ok: true, published: data?.published === true };
}

export async function setSiteGate(page: string, published: boolean): Promise<GateResult> {
  const who = await actor();
  if (!who || who.role !== "super_admin") return { ok: false, error: "forbidden" };
  if (!(page in GATES) || typeof published !== "boolean") return { ok: false, error: "invalid" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("site_pages")
    .upsert({ page, published, updated_at: new Date().toISOString(), updated_by: who.userId }, { onConflict: "page" });
  if (error) {
    console.error("setSiteGate failed", page, error);
    return { ok: false, error: "failed" };
  }

  const { error: auditError } = await admin
    .from("admin_audit_log")
    .insert({ actor_user_id: who.userId, action: published ? "site_gate_publish" : "site_gate_unpublish", details: { page } });
  if (auditError) console.error("site gate audit failed", page, auditError);

  for (const path of GATES[page]) revalidatePath(path);
  return { ok: true, published };
}
