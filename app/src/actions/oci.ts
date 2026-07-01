"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOciExport, type OciExport } from "@/lib/admin/oci";

// Server actions for the Google Ads Offline Conversion Import panel (attribution
// Phase 2). Gated to the billing tier — same as /admin/leads, since leads are
// commercial data. "use server" files export ONLY async functions.

const OCI_ROLES = ["super_admin", "billing_admin"];

async function requireBillingRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile?.role as string) ?? "member";
  if (!OCI_ROLES.includes(role)) throw new Error("Unauthorized");
}

/** Build the CSV + the exact lead IDs included, so mark-uploaded matches it. */
export async function exportOciConversions(): Promise<OciExport> {
  await requireBillingRole();
  return buildOciExport();
}

/**
 * Stamp the upload markers for the conversions the admin just downloaded + pushed
 * to Google, so they never export again. Takes the exact IDs from the download.
 */
export async function markOciUploaded(input: {
  verifiedIds: string[];
  purchaseIds: string[];
}): Promise<{ ok: true }> {
  await requireBillingRole();
  const admin = createAdminClient();
  const now = new Date().toISOString();
  if (input.verifiedIds?.length) {
    await admin
      .from("leads")
      .update({ oci_verified_uploaded_at: now })
      .in("id", input.verifiedIds);
  }
  if (input.purchaseIds?.length) {
    await admin
      .from("leads")
      .update({ oci_purchase_uploaded_at: now })
      .in("id", input.purchaseIds);
  }
  return { ok: true };
}
