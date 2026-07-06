"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLeadDetail, type LeadDetail } from "@/lib/admin/lead-detail";

// Server action backing the /admin/leads detail drawer. Leads carry PII + are
// commercial data, so this is gated to the SAME roles as the Leads page + OCI panel
// (billing tier). "use server" files export ONLY async functions.

const LEADS_ROLES = ["super_admin", "billing_admin"];

async function requireLeadsRole() {
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
  if (!LEADS_ROLES.includes(role)) throw new Error("Unauthorized");
}

/** Full per-lead detail (attribution, quiz breakdown, email timeline, journey). */
export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  await requireLeadsRole();
  return fetchLeadDetail(id);
}

/** Bulk-update leads to mark them as test. Service-role operation gated by requireLeadsRole. */
export async function bulkMarkAsTest(leadIds: string[]): Promise<{ success: boolean; count: number }> {
  await requireLeadsRole();

  if (!leadIds || leadIds.length === 0) {
    throw new Error("No lead IDs provided");
  }

  const admin = createAdminClient();
  const { error, count } = await admin
    .from("leads")
    .update({ is_test: true })
    .in("id", leadIds);

  if (error) {
    console.error("Bulk mark as test error:", error);
    throw new Error("Failed to update leads");
  }

  return { success: true, count: count ?? 0 };
}

/** Bulk-update leads to assign target cohort. Service-role operation gated by requireLeadsRole. */
export async function bulkAssignCohort(
  leadIds: string[],
  cohort: string,
): Promise<{ success: boolean; count: number }> {
  await requireLeadsRole();

  if (!leadIds || leadIds.length === 0) {
    throw new Error("No lead IDs provided");
  }

  if (!cohort || typeof cohort !== "string") {
    throw new Error("Invalid cohort");
  }

  // Validate cohort exists (whitelist known cohorts)
  const VALID_COHORTS = ["revalida-2026-2", "revalida-2027-1", "revalida-2027-2"];
  if (!VALID_COHORTS.includes(cohort)) {
    throw new Error("Invalid cohort");
  }

  const admin = createAdminClient();
  const { error, count } = await admin
    .from("leads")
    .update({ target_cohort: cohort })
    .in("id", leadIds);

  if (error) {
    console.error("Bulk assign cohort error:", error);
    throw new Error("Failed to update leads");
  }

  return { success: true, count: count ?? 0 };
}

// ── Bulk Resend Drip Email ────────────────────────────────────────────────────

// Map dripStep to email template kind. The drip sequence is:
// 0 → 1 (send lead-d0)
// 1 → 2 (send lead-d1)
// 2 → 3 (send lead-d2)
// 3 → 4 (send lead-d4)
// 4 → 5 (send lead-d7)
// 5 → 6 (send lead-final, deprecated)
const DRIP_STEP_TO_KIND = {
  1: "lead-d0",
  2: "lead-d1",
  3: "lead-d2",
  4: "lead-d4",
  5: "lead-d7",
  6: "lead-final",
};

type LeadForDrip = {
  id: string;
  email: string;
  dripStep: number;
  dripStatus: string;
  firstName: string | null;
  score: number | null;
  weakSpecialties: number[];
  targetCohort: string | null;
};

async function fetchLeadsForDrip(leadIds: string[]): Promise<LeadForDrip[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leads")
    .select(
      "id, email, drip_step, drip_status, first_name, score, weak_specialty_ids, target_cohort",
    )
    .in("id", leadIds);

  if (error) {
    console.error("Error fetching leads:", error);
    throw new Error("Failed to fetch leads");
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    dripStep: (row.drip_step as number) ?? 0,
    dripStatus: (row.drip_status as string) ?? "active",
    firstName: (row.first_name as string | null) ?? null,
    score: (row.score as number | null) ?? null,
    weakSpecialties: (row.weak_specialty_ids as number[]) ?? [],
    targetCohort: (row.target_cohort as string | null) ?? null,
  }));
}

async function specialtyNames(ids: number[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("specialties")
    .select("id, name")
    .in("id", ids);
  const nameMap = new Map<number, string>(
    (data ?? []).map((s) => [s.id as number, s.name as string]),
  );
  return ids.map((id) => nameMap.get(id) ?? "").filter(Boolean);
}

async function buildDripVars(lead: LeadForDrip, nextKind: string): Promise<Record<string, string>> {
  const displayName = lead.firstName || lead.email.split("@")[0];
  const weakSpecs = await specialtyNames(lead.weakSpecialties ?? []);

  // Get the cohort's test date if available — used for {{examLabel}}
  let examLabel = "sua prova";
  if (lead.targetCohort) {
    const admin = createAdminClient();
    const { data: cohort } = await admin
      .from("cohorts")
      .select("test_date")
      .eq("slug", lead.targetCohort)
      .single();
    if (cohort?.test_date) {
      const testDate = new Date(cohort.test_date + "T12:00:00");
      examLabel = testDate.toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "long",
      });
    }
  }

  const greeting = displayName ? `Oi, ${displayName}! ` : "";
  const vars: Record<string, string> = {
    displayName,
    greeting,
    score: String(lead.score ?? ""),
    weakSpecialties: weakSpecs.join(", "),
    examLabel,
  };

  // Add unsubscribeUrl for list emails
  if (nextKind.startsWith("lead-")) {
    vars.unsubscribeUrl = `https://medhelpspace.com.br/api/leads/unsubscribe?email=${encodeURIComponent(lead.email)}`;
  }

  return vars;
}

export async function bulkResendDripEmail(
  leadIds: string[],
): Promise<{
  success: boolean;
  sent: number;
  failed: { id: string; email: string; reason: string }[];
}> {
  await requireLeadsRole();

  if (!leadIds || leadIds.length === 0) {
    throw new Error("No lead IDs provided");
  }

  // Fetch all leads with their drip state
  const leads = await fetchLeadsForDrip(leadIds);

  // Validate: all must be active status
  const inactiveLeads = leads.filter((l) => l.dripStatus !== "active");
  if (inactiveLeads.length > 0) {
    throw new Error(
      `Cannot send to unsubscribed/bounced leads: ${inactiveLeads.map((l) => l.email).join(", ")}`,
    );
  }

  // Validate: none can be at max drip step (6 = done)
  const maxedLeads = leads.filter((l) => l.dripStep >= 6);
  if (maxedLeads.length > 0) {
    throw new Error(
      `Leads already at max step: ${maxedLeads.map((l) => l.email).join(", ")}`,
    );
  }

  // Send emails and track results
  const { sendTemplateEmail } = await import("@/lib/email");
  const { FUNNEL_SENDER_NAME } = await import("@/lib/email-render");
  const failed: { id: string; email: string; reason: string }[] = [];
  let sent = 0;

  const admin = createAdminClient();

  for (const lead of leads) {
    const nextStep = lead.dripStep + 1;
    const nextKind =
      DRIP_STEP_TO_KIND[nextStep as keyof typeof DRIP_STEP_TO_KIND];

    if (!nextKind) {
      failed.push({
        id: lead.id,
        email: lead.email,
        reason: "No template for next step",
      });
      continue;
    }

    try {
      // Build template vars
      const vars = await buildDripVars(lead, nextKind);

      // Send the email
      const result = await sendTemplateEmail({
        kind: nextKind,
        to: lead.email,
        vars,
        fromName: FUNNEL_SENDER_NAME,
      });

      if (!result.ok) {
        failed.push({
          id: lead.id,
          email: lead.email,
          reason: result.reason ?? "Unknown error",
        });
        continue;
      }

      // Update the lead: increment dripStep, set last_emailed_at, keep drip_status as is
      const { error } = await admin
        .from("leads")
        .update({
          drip_step: nextStep,
          last_emailed_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      if (error) {
        console.error(`Failed to update lead ${lead.id}:`, error);
        failed.push({
          id: lead.id,
          email: lead.email,
          reason: "Failed to update database",
        });
        continue;
      }

      sent++;
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Unknown error";
      failed.push({ id: lead.id, email: lead.email, reason });
    }
  }

  return { success: failed.length === 0, sent, failed };
}
