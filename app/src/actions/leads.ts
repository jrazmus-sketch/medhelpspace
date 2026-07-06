"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLeadDetail, type LeadDetail } from "@/lib/admin/lead-detail";
import {
  offerCheckoutUrl,
  resultUrl,
  unsubscribeUrl,
  WELCOME_COUPONS,
  VALID_TARGET_COHORTS,
  FLASHCARDS_SOURCE,
} from "@/lib/magnet/links";

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

  // Canonical whitelist (mirrors the leads_target_cohort_check DB constraint).
  // NB: the 2027.2 slug is 'revalida-20272' — no hyphen before the final 2.
  if (!VALID_TARGET_COHORTS.has(cohort)) {
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

// ── Bulk Unsubscribe / Reactivate ─────────────────────────────────────────────

/**
 * Bulk drip-status change: 'unsubscribe' stops all funnel emails (mirrors the
 * one-click unsubscribe route's write: drip_status + unsubscribed_at stamp);
 * 'reactivate' re-enters unsubscribed/bounced leads into the drip (the manual
 * override for a webhook-suppressed bounce) and clears unsubscribed_at.
 *
 * 'converted' is terminal and never touched — a buyer must not be flipped back
 * into the drip (same .neq guard as the Resend webhook). last_emailed_at is
 * KEPT on both paths: the drip clock runs from verified_at, so clearing it buys
 * nothing and would only destroy send history.
 */
export async function bulkSetDripStatus(
  leadIds: string[],
  action: "unsubscribe" | "reactivate",
): Promise<{ success: boolean; count: number; skipped: number }> {
  await requireLeadsRole();

  if (!leadIds || leadIds.length === 0) {
    throw new Error("No lead IDs provided");
  }
  if (action !== "unsubscribe" && action !== "reactivate") {
    throw new Error("Invalid action");
  }

  const admin = createAdminClient();
  const query =
    action === "unsubscribe"
      ? admin
          .from("leads")
          .update({
            drip_status: "unsubscribed",
            unsubscribed_at: new Date().toISOString(),
          })
          .in("id", leadIds)
          .in("drip_status", ["active", "bounced"])
      : admin
          .from("leads")
          .update({ drip_status: "active", unsubscribed_at: null })
          .in("id", leadIds)
          .in("drip_status", ["unsubscribed", "bounced"]);

  const { data, error } = await query.select("id");

  if (error) {
    console.error("Bulk drip-status error:", error);
    throw new Error("Failed to update leads");
  }

  const count = data?.length ?? 0;
  // skipped = converted leads + leads already in the target state.
  return { success: true, count, skipped: leadIds.length - count };
}

// ── Bulk Archive / Unarchive ──────────────────────────────────────────────────

/**
 * Soft-archive (or restore) leads. Archived leads are hidden from /admin/leads
 * by default ("Mostrar arquivados" reveals them). Deliberately does NOT touch
 * drip_status — archiving is a list-hygiene action, not an email suppression;
 * admins who want both run bulk unsubscribe first.
 */
export async function bulkSetArchived(
  leadIds: string[],
  archived: boolean,
): Promise<{ success: boolean; count: number }> {
  await requireLeadsRole();

  if (!leadIds || leadIds.length === 0) {
    throw new Error("No lead IDs provided");
  }
  if (typeof archived !== "boolean") {
    throw new Error("Invalid archived flag");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leads")
    .update({ is_archived: archived })
    .in("id", leadIds)
    .select("id");

  if (error) {
    console.error("Bulk archive error:", error);
    throw new Error("Failed to update leads");
  }

  return { success: true, count: data?.length ?? 0 };
}

// ── Bulk Resend Drip Email ────────────────────────────────────────────────────

// Manual send/resend template map, aligned with the lead-drip cron's STEPS
// (step = the value drip_step holds AFTER that email went out):
//   0 → lead-d0 (welcome/delivery — normally sent at verification, actions/magnet.ts)
//   1 → lead-d1 · 2 → lead-d2 (turma coupon) · 3 → lead-d4 · 4 → lead-d7
// Step 5 (lead-final, the retired deep-discount push) is deliberately ABSENT —
// listing it here would resurrect an email the team retired on 2026-07-02.
// Keep in sync with app/api/cron/lead-drip/route.ts. (The pre-2026-07-06 version
// of this map was off by one vs. the cron — it sent lead-d0 as "step 1", so a
// manual resend made the cron skip a step afterwards.)
const STEP_TO_KIND: Record<number, string> = {
  0: "lead-d0",
  1: "lead-d1",
  2: "lead-d2",
  3: "lead-d4",
  4: "lead-d7",
};
const MAX_MANUAL_STEP = 4;

type LeadForDrip = {
  id: string;
  email: string;
  dripStep: number;
  dripStatus: string;
  firstName: string | null;
  score: number | null;
  weakSpecialties: number[];
  targetCohort: string | null;
  resultToken: string | null;
  unsubscribeToken: string | null;
  source: string;
};

async function fetchLeadsForDrip(leadIds: string[]): Promise<LeadForDrip[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leads")
    .select(
      "id, email, drip_step, drip_status, first_name, score, weak_specialty_ids, target_cohort, result_token, unsubscribe_token, source",
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
    resultToken: (row.result_token as string | null) ?? null,
    unsubscribeToken: (row.unsubscribe_token as string | null) ?? null,
    source: (row.source as string | null) ?? "simulado-honesto",
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

// Mirrors the var set the cron sends (greeting / score / weakSpecialties /
// examLabel / resultUrl / checkoutUrl / unsubscribeUrl) so a manual send renders
// identically to an automated one. The coupon lands ONLY on the D2 step (the
// turma's WELCOME coupon), exactly like the cron. examLabel comes from the
// cohort's real test_date (fallback: "a sua prova").
async function buildDripVars(lead: LeadForDrip, kind: string, step: number): Promise<Record<string, string>> {
  const firstName = (lead.firstName ?? "").trim();
  const weakSpecs = await specialtyNames(lead.weakSpecialties ?? []);
  const cohort = lead.targetCohort ?? "revalida-2026-2";

  let examLabel = "a sua prova";
  if (lead.targetCohort) {
    const admin = createAdminClient();
    const { data: cohortRow } = await admin
      .from("cohorts")
      .select("test_date")
      .eq("slug", lead.targetCohort)
      .maybeSingle();
    if (cohortRow?.test_date) {
      const testDate = new Date(cohortRow.test_date + "T12:00:00");
      examLabel = testDate.toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "long",
      });
    }
  }

  const coupon = step === 2 ? (WELCOME_COUPONS[cohort]?.code ?? null) : null;

  return {
    greeting: firstName ? `Oi, ${firstName}! ` : "Oi! ",
    score: lead.score != null ? String(lead.score) : "—",
    weakSpecialties: weakSpecs.join(", ") || "suas matérias mais difíceis",
    examLabel,
    resultUrl: resultUrl(lead.resultToken ?? ""),
    checkoutUrl: offerCheckoutUrl({
      email: lead.email.toLowerCase(),
      coupon,
      cohort,
      utmCampaign: kind,
    }),
    // Token-based — the unsubscribe route auths by unsubscribe_token (?t=), not
    // by email; the previous email-based URL here produced dead links.
    unsubscribeUrl: unsubscribeUrl(lead.unsubscribeToken ?? ""),
  };
}

/**
 * Manually send a funnel email to the selected leads.
 *
 * `step` picks the template (0=D0 welcome … 4=D7, see STEP_TO_KIND). Omitted /
 * null = each lead's own next step (dripStep + 1), i.e. "advance the sequence".
 *
 * drip_step is written as max(current, step): resending an EARLIER email never
 * rewinds the sequence (the cron would re-send everything after it), while
 * sending a future step advances it so the cron continues from there.
 */
export async function bulkResendDripEmail(
  leadIds: string[],
  step?: number | null,
): Promise<{
  success: boolean;
  sent: number;
  failed: { id: string; email: string; reason: string }[];
}> {
  await requireLeadsRole();

  if (!leadIds || leadIds.length === 0) {
    throw new Error("No lead IDs provided");
  }
  if (step != null && (!Number.isInteger(step) || step < 0 || step > MAX_MANUAL_STEP)) {
    throw new Error("Invalid drip step");
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

  // Validate: the flashcards funnel has its OWN sequence (lead-fc-*, sent by
  // /api/cron/flashcards-drip) — the quiz templates would be wrong for them.
  const fcLeads = leads.filter((l) => l.source === FLASHCARDS_SOURCE);
  if (fcLeads.length > 0) {
    throw new Error(
      `Flashcards-funnel leads have their own email sequence: ${fcLeads.map((l) => l.email).join(", ")}`,
    );
  }

  // "Next step" mode: nobody may already be past the last manual step.
  if (step == null) {
    const maxedLeads = leads.filter((l) => l.dripStep >= MAX_MANUAL_STEP);
    if (maxedLeads.length > 0) {
      throw new Error(
        `Leads already finished the sequence: ${maxedLeads.map((l) => l.email).join(", ")}`,
      );
    }
  }

  // Send emails and track results
  const { sendTemplateEmail } = await import("@/lib/email");
  const { FUNNEL_SENDER_NAME } = await import("@/lib/email-render");
  const failed: { id: string; email: string; reason: string }[] = [];
  let sent = 0;

  const admin = createAdminClient();

  for (const lead of leads) {
    const targetStep = step ?? lead.dripStep + 1;
    const kind = STEP_TO_KIND[targetStep];

    if (!kind) {
      failed.push({
        id: lead.id,
        email: lead.email,
        reason: "No template for step",
      });
      continue;
    }

    try {
      const vars = await buildDripVars(lead, kind, targetStep);

      const result = await sendTemplateEmail({
        kind,
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

      // Never rewind: a resend of an old step keeps drip_step where it was.
      const { error } = await admin
        .from("leads")
        .update({
          drip_step: Math.max(lead.dripStep, targetStep),
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
