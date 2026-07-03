"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { VIEWAS_COOKIE } from "@/lib/viewas";
import { safe } from "@/lib/sanitize";
import { sendPurchaseConfirmation } from "@/lib/email";
import type { MemberDetail } from "@/lib/admin/member-detail";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "member") throw new Error("Unauthorized");
  return { user, role: profile.role as string };
}

async function writeAuditLog(
  actorId: string,
  action: string,
  targetUserId?: string | null,
  details?: Record<string, unknown>,
) {
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    actor_user_id: actorId,
    action,
    target_user_id: targetUserId ?? null,
    details: details ?? {},
  });
}

const BILLING_ROLES = ["super_admin", "billing_admin"];

// Price + storefront visibility are money-facing — restrict to the billing tier.
async function requireBillingRole() {
  const ctx = await requireAdmin();
  if (!BILLING_ROLES.includes(ctx.role)) throw new Error("Unauthorized");
  return ctx;
}

// Granting/stripping cohort membership is member-access management — content_admin
// is excluded per the role matrix (support/billing handle member access, not content).
const MEMBER_ACCESS_ROLES = ["super_admin", "support_admin", "billing_admin"];

async function requireMemberAccessRole() {
  const ctx = await requireAdmin();
  if (!MEMBER_ACCESS_ROLES.includes(ctx.role)) throw new Error("Unauthorized");
  return ctx;
}

// Cohort commerce/catalog fields (price + storefront), shared by create/update.
// sale_price_cents is a manual on/off promo price: NULL = no sale; else the
// discounted price (< price_cents) that becomes the effective price everywhere.
type CohortCommerce = {
  price_cents: number | null;
  sale_price_cents: number | null;
  is_for_sale: boolean;
  display_order: number;
  sale_ends_at: string | null;
};

function validateCommerce(c: CohortCommerce): string | null {
  if (c.is_for_sale && c.price_cents == null) return "PRICE_REQUIRED_FOR_SALE";
  if (c.price_cents != null && (!Number.isInteger(c.price_cents) || c.price_cents < 0))
    return "INVALID_PRICE";
  if (c.sale_price_cents != null) {
    if (!Number.isInteger(c.sale_price_cents) || c.sale_price_cents < 0) return "INVALID_SALE_PRICE";
    if (c.price_cents == null) return "SALE_PRICE_NEEDS_BASE";
    if (c.sale_price_cents >= c.price_cents) return "SALE_PRICE_ABOVE_BASE";
  }
  return null;
}

// membership window must be well-formed and actually contain the exam date —
// otherwise a member could fall outside their own cohort's access window on
// exam day, or the window could be inverted entirely.
function validateCohortDates(testDate: string, startsAt: string, endsAt: string): string | null {
  if (endsAt <= startsAt) return "END_BEFORE_START";
  if (testDate < startsAt.slice(0, 10) || testDate > endsAt.slice(0, 10)) return "TEST_DATE_OUTSIDE_WINDOW";
  return null;
}

// test_date - offsetDays, computed on local date parts (no UTC shift) — mirrors
// the arithmetic in resetModuleUnlockDate and the modules page's `autoDate`.
function subtractDaysFromDate(dateStr: string, offsetDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function commerceFromFormData(f: FormData): CohortCommerce {
  const priceRaw = f.get("price");
  const salePriceRaw = f.get("sale_price");
  const saleEndsRaw = f.get("sale_ends_at");
  return {
    price_cents:
      priceRaw != null && String(priceRaw).trim() !== ""
        ? Math.round(Number(priceRaw) * 100)
        : null,
    sale_price_cents:
      salePriceRaw != null && String(salePriceRaw).trim() !== ""
        ? Math.round(Number(salePriceRaw) * 100)
        : null,
    is_for_sale: f.get("is_for_sale") === "on" || f.get("is_for_sale") === "true",
    display_order: Number(f.get("display_order")) || 0,
    // Stored as end-of-day so "ends on 1 Jul" sells through all of 1 Jul.
    sale_ends_at:
      saleEndsRaw && String(saleEndsRaw).trim()
        ? `${String(saleEndsRaw).trim()}T23:59:59`
        : null,
  };
}

// Storefront pages (/, /loja) read cohorts; revalidate them on any catalog change
// so price / for-sale edits show up without waiting for the hourly ISR window.
function revalidateStorefront() {
  revalidatePath("/");
  revalidatePath("/loja");
}

// ── Cohort actions ────────────────────────────────────────────────────────────

export async function assignMemberToCohort(userId: string, cohortId: number | null) {
  await requireMemberAccessRole();
  const admin = createAdminClient();
  await admin.from("user_cohort_memberships").delete().eq("user_id", userId);
  if (cohortId !== null) {
    await admin.from("user_cohort_memberships").insert({ user_id: userId, cohort_id: cohortId });
  }
  revalidatePath("/admin/members");
}

export async function createCohort(formData: FormData) {
  await requireBillingRole();
  const admin = createAdminClient();

  const commerce = commerceFromFormData(formData);
  const cErr = validateCommerce(commerce);
  if (cErr) throw new Error(cErr);

  const testDate = String(formData.get("test_date"));
  const startsAt = String(formData.get("membership_starts_at"));
  const endsAt = String(formData.get("membership_ends_at"));
  const dErr = validateCohortDates(testDate, startsAt, endsAt);
  if (dErr) throw new Error(dErr);

  const { data: newCohort, error } = await admin
    .from("cohorts")
    .insert({
      slug: String(formData.get("slug")),
      name: String(formData.get("name")),
      test_date: testDate,
      date_confirmed: formData.get("date_confirmed") === "on",
      membership_starts_at: startsAt,
      membership_ends_at: endsAt,
      ...commerce,
    })
    .select("id, test_date")
    .single();
  if (error) throw new Error(error.code === "23505" ? "SLUG_TAKEN" : error.message);

  // Seed cohort_module_access rows for every content module, with unlock_date
  // computed now — the cohorts_sync_unlock_dates trigger only fires on
  // UPDATE OF test_date, so a fresh cohort never gets a recalc otherwise.
  const { data: modules } = await admin.from("content_modules").select("id, unlock_offset_days");
  if (newCohort && modules?.length) {
    await admin.from("cohort_module_access").insert(
      modules.map((m) => ({
        cohort_id: newCohort.id,
        content_module_id: m.id,
        unlock_date: subtractDaysFromDate(newCohort.test_date as string, m.unlock_offset_days as number),
      }))
    );
  }
  revalidatePath("/admin/cohorts");
  revalidateStorefront();
}

export async function updateCohort(
  cohortId: number,
  data: {
    name: string;
    test_date: string;
    date_confirmed: boolean;
    membership_starts_at: string;
    membership_ends_at: string;
  } & CohortCommerce,
) {
  await requireBillingRole();
  const cErr = validateCommerce(data);
  if (cErr) throw new Error(cErr);
  const dErr = validateCohortDates(data.test_date, data.membership_starts_at, data.membership_ends_at);
  if (dErr) throw new Error(dErr);
  const admin = createAdminClient();
  const { error } = await admin.from("cohorts").update(data).eq("id", cohortId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cohorts");
  revalidatePath(`/admin/cohorts/${cohortId}/modules`);
  revalidateStorefront();
}

// Quick storefront on/off toggle. Turning a cohort on requires a price (the DB
// CHECK enforces this too — we pre-check for a friendly error).
export async function setCohortForSale(cohortId: number, isForSale: boolean) {
  await requireBillingRole();
  const admin = createAdminClient();
  if (isForSale) {
    const { data: c } = await admin
      .from("cohorts")
      .select("price_cents")
      .eq("id", cohortId)
      .single();
    if (!c || c.price_cents == null) throw new Error("PRICE_REQUIRED_FOR_SALE");
  }
  const { error } = await admin
    .from("cohorts")
    .update({ is_for_sale: isForSale })
    .eq("id", cohortId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cohorts");
  revalidateStorefront();
}

export async function softDeleteCohort(cohortId: number) {
  const { role } = await requireAdmin();
  if (role !== "super_admin") throw new Error("Super admin required");
  const admin = createAdminClient();
  const { error } = await admin.from("cohorts").update({ active: false }).eq("id", cohortId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cohorts");
  revalidateStorefront();
}

export async function reactivateCohort(cohortId: number) {
  const { role } = await requireAdmin();
  if (role !== "super_admin") throw new Error("Super admin required");
  const admin = createAdminClient();
  const { error } = await admin.from("cohorts").update({ active: true }).eq("id", cohortId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cohorts");
  revalidateStorefront();
}

// ── Module access override ────────────────────────────────────────────────────

export async function overrideModuleUnlockDate(
  cohortId: number,
  moduleId: number,
  unlockDate: string,
) {
  const { user } = await requireBillingRole();
  const admin = createAdminClient();
  const { error } = await admin
    .from("cohort_module_access")
    .update({ unlock_date: unlockDate, is_manual_override: true })
    .eq("cohort_id", cohortId)
    .eq("content_module_id", moduleId);
  if (error) throw new Error(error.message);
  await writeAuditLog(user.id, "module_unlock_override", null, {
    cohort_id: cohortId,
    module_id: moduleId,
    unlock_date: unlockDate,
  });
  revalidatePath(`/admin/cohorts/${cohortId}/modules`);
}

export async function resetModuleUnlockDate(cohortId: number, moduleId: number) {
  const { user } = await requireBillingRole();
  const admin = createAdminClient();
  const [{ data: cohort }, { data: mod }] = await Promise.all([
    admin.from("cohorts").select("test_date").eq("id", cohortId).single(),
    admin.from("content_modules").select("unlock_offset_days").eq("id", moduleId).single(),
  ]);
  if (!cohort || !mod) throw new Error("Not found");
  // Compute without timezone shift: parse date parts, subtract days
  const [y, m, d] = (cohort.test_date as string).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - (mod.unlock_offset_days as number));
  const autoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const { error } = await admin
    .from("cohort_module_access")
    .update({ unlock_date: autoDate, is_manual_override: false })
    .eq("cohort_id", cohortId)
    .eq("content_module_id", moduleId);
  if (error) throw new Error(error.message);
  await writeAuditLog(user.id, "module_unlock_reset", null, {
    cohort_id: cohortId,
    module_id: moduleId,
    unlock_date: autoDate,
  });
  revalidatePath(`/admin/cohorts/${cohortId}/modules`);
}

// ── User management ───────────────────────────────────────────────────────────

const VALID_ROLES = ["member", "super_admin", "content_admin", "support_admin", "billing_admin"];

export async function changeUserRole(targetUserId: string, newRole: string) {
  const { user, role } = await requireAdmin();
  if (role !== "super_admin") throw new Error("Only super admins can change roles");
  if (!VALID_ROLES.includes(newRole)) throw new Error("Invalid role");
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("role, email")
    .eq("id", targetUserId)
    .single();
  const { error } = await admin
    .from("profiles")
    .update({ role: newRole })
    .eq("id", targetUserId);
  if (error) throw new Error(error.message);
  await writeAuditLog(user.id, "role_change", targetUserId, {
    from_role: target?.role,
    to_role: newRole,
    target_email: target?.email,
  });
  revalidatePath("/admin/members");
}

export async function sendPasswordReset(email: string) {
  const { user } = await requireAdmin();
  // Mirror the member-facing flow at app/auth/recover/route.ts: route the
  // recovery link through /auth/confirm so the token is verified and a session
  // is established before the user lands on /reset-password.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://medhelpspace.com.br";
  const admin = createAdminClient();
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm`,
  });
  if (error) throw new Error(`Password reset failed: ${error.message}`);
  const { data: target } = await admin.from("profiles").select("id").eq("email", email).single();
  await writeAuditLog(user.id, "password_reset", target?.id ?? null, { email });
}

export async function revokeUserSessions(targetUserId: string) {
  const { user } = await requireAdmin();
  const admin = createAdminClient();
  // auth.admin.signOut() only accepts a JWT, not a user id, so it can't revoke
  // another user's sessions. Delete the target's sessions directly via a
  // SECURITY DEFINER helper (see schema-patch-delete-member.sql).
  const { error } = await admin.rpc("admin_revoke_user_sessions", {
    target_user: targetUserId,
  });
  if (error) throw new Error(error.message);
  await writeAuditLog(user.id, "revoke_sessions", targetUserId, {});
}

// Re-send the "Acesso liberado / Bem-vindo" purchase-confirmation email a buyer
// should have received on payment — support tooling for when the original never
// arrived (e.g. the Resend domain wasn't verified yet, a transient failure, or the
// buyer simply lost it). Unlike the automated finalize path, this does NOT gate on
// the original `purchase` email_log row (the admin is explicitly asking to send
// again); it records a distinct `welcome-resend` entry — ISO-timestamp context_id
// so repeats don't collide on the UNIQUE(user_id,kind,context_id) guard — so the
// resend shows in the member's Comms history and the audit log. Crucially it
// surfaces a real send failure (e.g. unverified domain) instead of swallowing it.
export async function resendWelcomeEmail(
  targetUserId: string,
): Promise<{ ok: true } | { error: string }> {
  const { user } = await requireMemberAccessRole();
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("email, display_name")
    .eq("id", targetUserId)
    .single();
  if (!profile?.email) return { error: "no_email" };

  // Cohort name for the email body: prefer the most recent paid order, then fall
  // back to the user's current membership so a manually-granted member is welcomed
  // too. A blank name still sends — the template tolerates it.
  let cohortId =
    (
      await admin
        .from("orders")
        .select("cohort_id")
        .eq("user_id", targetUserId)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data?.cohort_id as number | null ?? null;
  if (cohortId == null) {
    cohortId =
      (
        await admin
          .from("user_cohort_memberships")
          .select("cohort_id")
          .eq("user_id", targetUserId)
          .limit(1)
          .maybeSingle()
      ).data?.cohort_id as number | null ?? null;
  }

  let cohortName = "";
  if (cohortId != null) {
    const { data: cohort } = await admin
      .from("cohorts")
      .select("name")
      .eq("id", cohortId)
      .single();
    cohortName = (cohort?.name as string | null) ?? "";
  }

  const result = await sendPurchaseConfirmation({
    to: profile.email as string,
    name: (profile.display_name as string | null) ?? "",
    cohortName,
  });
  if (!result.ok) {
    console.error("resendWelcomeEmail: send failed", targetUserId, result.reason);
    return {
      error: result.reason === "no_api_key" ? "email_not_configured" : "send_failed",
    };
  }

  await admin.from("email_log").insert({
    user_id: targetUserId,
    kind: "welcome-resend",
    context_id: new Date().toISOString(),
  });

  await writeAuditLog(user.id, "welcome_email_resend", targetUserId, {
    email: profile.email,
    cohort: cohortName,
  });

  revalidatePath("/admin/members");
  return { ok: true };
}

// Hard-delete a member. Records are preserved, not destroyed: orders, audit-log
// entries, and created coupons keep their rows with the user reference nulled
// (ON DELETE SET NULL — see schema-patch-delete-member.sql). The auth.users row
// is deleted, which CASCADE-clears the profile, memberships, progress, and all
// active sessions. super_admin only; you cannot delete yourself.
export async function deleteMember(targetUserId: string) {
  const { user, role } = await requireAdmin();
  if (role !== "super_admin") throw new Error("Only super admins can delete members");
  if (targetUserId === user.id) throw new Error("You cannot delete your own account");

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("email, role, display_name")
    .eq("id", targetUserId)
    .single();
  if (!target) throw new Error("Member not found");

  // Snapshot the email onto any of the user's orders before the FK SET NULL
  // fires, so anonymized order rows still show who they belonged to.
  if (target.email) {
    await admin
      .from("orders")
      .update({ customer_email: target.email })
      .eq("user_id", targetUserId)
      .is("customer_email", null);
  }

  const { error } = await admin.auth.admin.deleteUser(targetUserId);
  if (error) throw new Error(error.message);

  // target_user_id is intentionally null — the row no longer exists; the deleted
  // identity is captured in details instead.
  await writeAuditLog(user.id, "member_deleted", null, {
    deleted_user_id: targetUserId,
    deleted_email: target.email,
    deleted_role: target.role,
    deleted_display_name: target.display_name,
  });
  revalidatePath("/admin/members");
}

export async function createMember(input: {
  email: string;
  password: string;
  role: string;
  displayName: string;
  cohortId: number | null;
}) {
  const { user, role } = await requireAdmin();
  if (role !== "super_admin") throw new Error("Only super admins can create members");

  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Invalid email address");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!VALID_ROLES.includes(input.role)) throw new Error("Invalid role");

  const admin = createAdminClient();
  const displayName = input.displayName.trim() || null;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw new Error(error.message);
  const newUserId = created.user.id;

  // handle_new_user() already inserted the profiles row; set role + name + email.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: input.role, display_name: displayName, email })
    .eq("id", newUserId);
  if (profileError) throw new Error(profileError.message);

  if (input.cohortId !== null) {
    await admin
      .from("user_cohort_memberships")
      .insert({ user_id: newUserId, cohort_id: input.cohortId });
  }

  await writeAuditLog(user.id, "member_created", newUserId, {
    email,
    role: input.role,
    cohort_id: input.cohortId,
  });
  revalidatePath("/admin/members");
}

// Lazy-loaded detail for the members drawer. The list page already carries the
// cheap, batched columns (status, last active, lifetime paid); this fetches the
// heavier per-member data only when a row is opened. Billing-sensitive sections
// (orders, lifetime paid, fiscal identity) are gated to billing/super roles — a
// support_admin opening the drawer sees engagement + comms but no money/PII.
export async function getMemberDetail(userId: string): Promise<MemberDetail> {
  const { role } = await requireAdmin();
  const canSeeBilling = BILLING_ROLES.includes(role);
  const canManageAccess = MEMBER_ACCESS_ROLES.includes(role);
  const admin = createAdminClient();

  const [profileRes, completionRes, reviewRes, emailRes, cohortRes] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "billing_first_name, billing_last_name, billing_cpf, billing_phone, billing_city, billing_state",
      )
      .eq("id", userId)
      .single(),
    admin.rpc("get_site_completion", { p_user: userId }),
    admin.from("review_schedule").select("due_date, suspended").eq("user_id", userId),
    admin
      .from("email_log")
      .select("id, kind, sent_at")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(25),
    admin.from("cohorts").select("id, name"),
  ]);

  // get_site_completion is a table-returning function → array with one row. It now
  // reports per-SECTION counts (questoes/resumos/medvoice/audiocards/revalida/
  // flashcards/formula — see schema-patch-site-completion-sections.sql). The drawer
  // shows three coarse buckets, so fold every lesson-based section into "Lessons";
  // Questões → Quiz, Flashcards → Flashcards. n() coerces bigint-as-string / null /
  // missing column → a finite number (never NaN, which Flight would carry to the UI).
  const cRow = Array.isArray(completionRes.data) ? completionRes.data[0] : completionRes.data;
  const n = (v: unknown) => {
    const x = Number(v ?? 0);
    return Number.isFinite(x) ? x : 0;
  };
  const completion = cRow
    ? {
        lessonsTotal:
          n(cRow.resumos_total) + n(cRow.medvoice_total) + n(cRow.audiocards_total) +
          n(cRow.revalida_total) + n(cRow.formula_total),
        lessonsDone:
          n(cRow.resumos_done) + n(cRow.medvoice_done) + n(cRow.audiocards_done) +
          n(cRow.revalida_done) + n(cRow.formula_done),
        quizTotal: n(cRow.questoes_total),
        quizDone: n(cRow.questoes_done),
        flashTotal: n(cRow.flashcards_total),
        flashDone: n(cRow.flashcards_done),
      }
    : null;

  const reviewRows = reviewRes.data ?? [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const activeReviews = reviewRows.filter((r) => !r.suspended);
  const reviews = {
    total: activeReviews.length,
    due: activeReviews.filter((r) => (r.due_date as string) <= todayStr).length,
  };

  const emails = (emailRes.data ?? []).map((e) => ({
    id: e.id as number,
    kind: e.kind as string,
    sentAt: e.sent_at as string,
  }));

  let orders: MemberDetail["orders"] = [];
  let lifetimePaidCents = 0;
  let fiscal: MemberDetail["fiscal"] = null;
  if (canSeeBilling) {
    const cohortMap = new Map(
      (cohortRes.data ?? []).map((c) => [c.id as number, c.name as string]),
    );
    const { data: orderRows } = await admin
      .from("orders")
      .select(
        "id, amount_cents, status, payment_method, cc_brand, cc_installments, created_at, cohort_id",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    orders = (orderRows ?? []).map((o) => ({
      id: o.id as string,
      amountCents: o.amount_cents as number,
      status: o.status as string,
      paymentMethod: o.payment_method as string,
      ccBrand: o.cc_brand as string | null,
      ccInstallments: o.cc_installments as number | null,
      createdAt: o.created_at as string,
      cohortName: cohortMap.get(o.cohort_id as number) ?? "",
    }));
    lifetimePaidCents = orders
      .filter((o) => o.status === "paid")
      .reduce((s, o) => s + o.amountCents, 0);

    const p = profileRes.data;
    if (p && (p.billing_cpf || p.billing_first_name || p.billing_phone || p.billing_city)) {
      fiscal = {
        firstName: (p.billing_first_name as string) ?? null,
        lastName: (p.billing_last_name as string) ?? null,
        cpf: (p.billing_cpf as string) ?? null,
        phone: (p.billing_phone as string) ?? null,
        city: (p.billing_city as string) ?? null,
        state: (p.billing_state as string) ?? null,
      };
    }
  }

  return {
    userId,
    canSeeBilling,
    canManageAccess,
    completion,
    reviews,
    lifetimePaidCents,
    orders,
    emails,
    fiscal,
  };
}

// ── Page metadata ─────────────────────────────────────────────────────────────

export type PageMetadataInput = {
  title: string;
  slug: string;
  status: "publish" | "draft";
  specialty_id: number | null;
  track_id: number | null;
  view: string | null;
  content_module_id: number | null;
  notes: string | null;
};

export async function updatePageMetadata(pageId: number, data: PageMetadataInput) {
  await requireAdmin();
  const admin = createAdminClient();

  // Ensure slug is unique (ignore current page's own row)
  const { count } = await admin
    .from("pages")
    .select("id", { count: "exact", head: true })
    .eq("slug", data.slug)
    .neq("id", pageId);

  if ((count ?? 0) > 0) {
    throw new Error("SLUG_TAKEN");
  }

  const { error } = await admin
    .from("pages")
    .update({
      title: data.title.trim(),
      slug: data.slug.trim(),
      status: data.status,
      specialty_id: data.specialty_id,
      track_id: data.track_id,
      view: data.view,
      content_module_id: data.content_module_id,
      notes: data.notes?.trim() || null,
    })
    .eq("id", pageId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/pages");
  revalidatePath(`/admin/pages/${pageId}/edit`);
}

// ── Lessons ───────────────────────────────────────────────────────────────────

export type LessonInput = {
  id: number | null;
  title: string;
  body_html: string;
  audio_url: string | null;
  position: number;
};

export async function updateLessons(pageId: number, lessons: LessonInput[]) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("lessons")
    .select("id")
    .eq("page_id", pageId);

  const existingIds = new Set((existing ?? []).map((r) => r.id as number));
  const incomingIds = new Set(
    lessons.filter((l) => l.id !== null).map((l) => l.id as number),
  );

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    await admin.from("lessons").delete().in("id", toDelete);
  }

  for (const lesson of lessons) {
    if (lesson.id !== null) {
      await admin
        .from("lessons")
        .update({
          title: lesson.title,
          body_html: lesson.body_html || null,
          audio_url: lesson.audio_url || null,
          position: lesson.position,
        })
        .eq("id", lesson.id);
    } else {
      await admin.from("lessons").insert({
        page_id: pageId,
        title: lesson.title,
        body_html: lesson.body_html || null,
        audio_url: lesson.audio_url || null,
        position: lesson.position,
      });
    }
  }

  revalidatePath(`/admin/pages/${pageId}/edit`);
}

// ── Plain-content body ──────────────────────────────────────────────────────────
//
// Plain-content pages keep their single body in one `lessons` row (position 1) —
// the same row PlainContentRenderer reads. Unlike `updateLessons`, this is keyed
// on the page's existing first row discovered server-side (not a client-held id),
// so repeat saves edit that row in place rather than churning it (which would
// orphan any `lesson_completions` pointing at the old lesson). It never touches
// sibling rows, so an anomalous multi-row page is left otherwise intact.

export async function savePageBody(pageId: number, bodyHtml: string, title: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("lessons")
    .select("id")
    .eq("page_id", pageId)
    .order("position")
    .limit(1)
    .maybeSingle();

  if (existing) {
    await admin
      .from("lessons")
      .update({ title, body_html: bodyHtml || null })
      .eq("id", existing.id);
  } else {
    await admin.from("lessons").insert({
      page_id: pageId,
      title,
      body_html: bodyHtml || null,
      audio_url: null,
      position: 1,
    });
  }

  revalidatePath(`/admin/pages/${pageId}/edit`);
}

// ── Quiz questions ────────────────────────────────────────────────────────────

export type QuizAnswerInput = {
  text: string;
  correct: boolean;
  feedback: string;
};

export type QuizQuestionInput = {
  id: number | null;
  question: string;
  answers: QuizAnswerInput[];
  media_url: string | null;
  explanation_html: string | null;
  position: number;
};

export async function updateQuizQuestions(pageId: number, questions: QuizQuestionInput[]) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("quiz_questions")
    .select("id")
    .eq("page_id", pageId);
  const existingIds = new Set((existing ?? []).map((r) => r.id as number));
  const incomingIds = new Set(
    questions.filter((q) => q.id !== null).map((q) => q.id as number),
  );

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    await admin.from("quiz_questions").delete().in("id", toDelete);
  }

  for (const q of questions) {
    if (!q.question.trim()) continue;
    const payload = {
      question: q.question,
      answers: q.answers,
      media_url: q.media_url || null,
      explanation_html: q.explanation_html || null,
      position: q.position,
    };
    if (q.id !== null) {
      await admin.from("quiz_questions").update(payload).eq("id", q.id);
    } else {
      await admin.from("quiz_questions").insert({ page_id: pageId, ...payload });
    }
  }

  revalidatePath(`/admin/pages/${pageId}/edit`);
}

// ── Flashcards ────────────────────────────────────────────────────────────────

export type FlashcardInput = {
  id: number | null;
  group_position: number;
  group_label: string | null;
  position: number;
  text: string;
  answer: string;
  image_url: string | null;
  tip: string | null;
};

export async function updateFlashcards(pageId: number, cards: FlashcardInput[]) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("flashcard_items")
    .select("id")
    .eq("page_id", pageId);
  const existingIds = new Set((existing ?? []).map((r) => r.id as number));
  const incomingIds = new Set(cards.filter((c) => c.id !== null).map((c) => c.id as number));

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    await admin.from("flashcard_items").delete().in("id", toDelete);
  }

  for (const c of cards) {
    if (!c.text.trim() || !c.answer.trim()) continue;
    const payload = {
      group_position: c.group_position,
      group_label: c.group_label,
      position: c.position,
      text: c.text,
      answer: c.answer,
      image_url: c.image_url || null,
      tip: c.tip || null,
    };
    if (c.id !== null) {
      await admin.from("flashcard_items").update(payload).eq("id", c.id);
    } else {
      await admin.from("flashcard_items").insert({ page_id: pageId, ...payload });
    }
  }

  revalidatePath(`/admin/pages/${pageId}/edit`);
}

// ── View As ───────────────────────────────────────────────────────────────────

export async function setViewAs(mode: string) {
  await requireAdmin();
  const store = await cookies();
  if (mode === "admin") {
    store.delete(VIEWAS_COOKIE);
  } else {
    store.set(VIEWAS_COOKIE, mode, { path: "/", httpOnly: true, sameSite: "lax" });
  }
  revalidatePath("/app", "layout");
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type AnnouncementInput = {
  title: string;
  body_html: string | null;
  category_id: number;
  priority: "normal" | "urgent";
  status: "draft" | "published" | "scheduled";
  pinned: boolean;
  is_welcome: boolean;
  publish_at: string;
  cohort_id: number | null;
};

// Only one welcome message may exist at a time (enforced by a partial unique
// index). Before marking one as the welcome, clear the flag on every other row
// so the constraint never trips. `exceptId` skips the row being updated.
async function clearOtherWelcomes(admin: ReturnType<typeof createAdminClient>, exceptId?: number) {
  let q = admin.from("announcements").update({ is_welcome: false }).eq("is_welcome", true);
  if (exceptId != null) q = q.neq("id", exceptId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function createAnnouncement(data: AnnouncementInput) {
  const { user } = await requireAdmin();
  const admin = createAdminClient();
  if (data.is_welcome) await clearOtherWelcomes(admin);
  const { error } = await admin.from("announcements").insert({
    ...data,
    body_html: data.body_html != null ? safe(data.body_html) : null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
  revalidatePath("/app", "layout");
}

export async function updateAnnouncement(id: number, data: AnnouncementInput) {
  await requireAdmin();
  const admin = createAdminClient();
  if (data.is_welcome) await clearOtherWelcomes(admin, id);
  const { error } = await admin
    .from("announcements")
    .update({
      ...data,
      body_html: data.body_html != null ? safe(data.body_html) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
  revalidatePath("/app", "layout");
}

export async function deleteAnnouncement(id: number) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("announcements").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
  revalidatePath("/app", "layout");
}

export async function createAnnouncementCategory(data: { slug: string; label: string; color: string }) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("announcement_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  const { error } = await admin.from("announcement_categories").insert({
    ...data,
    sort_order: (existing?.sort_order ?? -1) + 1,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
}

export async function deleteAnnouncementCategory(id: number) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("announcement_categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
}

export async function updateSiteSetting(key: string, value: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("site_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  revalidatePath("/app", "layout");
}

// Member-facing — no admin guard; auth check only
export async function markAnnouncementsRead(ids: number[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || ids.length === 0) return;
  const admin = createAdminClient();
  await admin.from("announcement_reads").upsert(
    ids.map((announcement_id) => ({ announcement_id, user_id: user.id })),
    { onConflict: "announcement_id,user_id" },
  );
}

// Member-facing — dismiss a welcome announcement for the current user. Distinct
// from "read": opening the strip marks items read but must not dismiss the
// welcome, which stays pinned to the top until the member explicitly closes it.
export async function dismissAnnouncement(id: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const admin = createAdminClient();
  await admin.from("announcement_dismissals").upsert(
    { announcement_id: id, user_id: user.id },
    { onConflict: "announcement_id,user_id" },
  );
  revalidatePath("/app", "layout");
}

// ── Nav items (hub page cards) ────────────────────────────────────────────────

const NAV_ITEM_ALLOWED_ROLES = new Set(["super_admin", "content_admin"]);

export type NavItemInput = {
  id: number | null;
  label: string;
  target_page_id: number;
  group_label: string | null;
  icon: string | null;
  layout: "cards" | "list";
  position: number;
};

export async function updateNavItems(
  pageId: number,
  items: NavItemInput[],
): Promise<{ ok: true } | { error: string }> {
  const { user, role } = await requireAdmin();
  if (!NAV_ITEM_ALLOWED_ROLES.has(role)) {
    return { error: "Unauthorized" };
  }

  // Validation: every item must have a target_page_id
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (typeof it.target_page_id !== "number" || !Number.isFinite(it.target_page_id)) {
      return { error: `Item ${i + 1} is missing a target page.` };
    }
  }

  const admin = createAdminClient();

  // Verify source page exists and is a hub
  const { data: source } = await admin
    .from("pages")
    .select("id, type")
    .eq("id", pageId)
    .single();
  if (!source) return { error: "Source page not found." };
  if (source.type !== "blurb-nav-hub") {
    return { error: "Source page is not a hub page." };
  }

  // Diff against existing rows
  const { data: existing } = await admin
    .from("nav_items")
    .select("id")
    .eq("source_page_id", pageId);
  const existingIds = new Set((existing ?? []).map((r) => r.id as number));
  const incomingIds = new Set(
    items.filter((it) => it.id !== null).map((it) => it.id as number),
  );

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    const { error: delErr } = await admin
      .from("nav_items")
      .delete()
      .in("id", toDelete);
    if (delErr) return { error: delErr.message };
  }

  // Upsert: update existing, insert new. Positions reflect array order.
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const position = i + 1;
    const payload = {
      label: it.label ?? "",
      target_page_id: it.target_page_id,
      group_label: it.group_label,
      icon: it.icon,
      layout: it.layout,
      position,
    };
    if (it.id !== null) {
      const { error: updErr } = await admin
        .from("nav_items")
        .update(payload)
        .eq("id", it.id);
      if (updErr) return { error: updErr.message };
    } else {
      const { error: insErr } = await admin
        .from("nav_items")
        .insert({ source_page_id: pageId, ...payload });
      if (insErr) return { error: insErr.message };
    }
  }

  await writeAuditLog(user.id, "nav_items_update", null, {
    page_id: pageId,
    count: items.length,
    deleted: toDelete.length,
  });

  revalidatePath(`/admin/pages/${pageId}/edit`);
  revalidatePath("/app", "layout");

  return { ok: true };
}

// ── Hub builder (structural edits from the /admin/hubs tree) ───────────────────
//
// Single-card operations used by the interactive hubs tree. Card *reordering*
// and label editing still live in the per-page nav-items editor — these only
// cover the structural moves the tree adds (add / remove / move between hubs).

async function nextNavItemPosition(
  admin: ReturnType<typeof createAdminClient>,
  hubId: number,
): Promise<number> {
  const { data } = await admin
    .from("nav_items")
    .select("position")
    .eq("source_page_id", hubId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.position ?? 0) + 1;
}

export async function addCardToHub(
  hubId: number,
  targetPageId: number,
): Promise<{ ok: true } | { error: string }> {
  const { user, role } = await requireAdmin();
  if (!NAV_ITEM_ALLOWED_ROLES.has(role)) return { error: "unauthorized" };
  const admin = createAdminClient();

  const { data: hub } = await admin
    .from("pages")
    .select("id, type")
    .eq("id", hubId)
    .single();
  if (!hub) return { error: "hub_not_found" };
  if (hub.type !== "blurb-nav-hub") return { error: "not_a_hub" };

  const { data: target } = await admin
    .from("pages")
    .select("id")
    .eq("id", targetPageId)
    .single();
  if (!target) return { error: "target_not_found" };

  const position = await nextNavItemPosition(admin, hubId);
  const { error } = await admin.from("nav_items").insert({
    source_page_id: hubId,
    target_page_id: targetPageId,
    label: "",
    group_label: null,
    icon: null,
    layout: "cards",
    position,
  });
  if (error) return { error: "insert_failed" };

  await writeAuditLog(user.id, "nav_item_add", null, {
    hub_id: hubId,
    target_page_id: targetPageId,
  });
  revalidatePath("/admin/hubs");
  revalidatePath(`/admin/pages/${hubId}/edit`);
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function removeNavItem(
  navItemId: number,
): Promise<{ ok: true } | { error: string }> {
  const { user, role } = await requireAdmin();
  if (!NAV_ITEM_ALLOWED_ROLES.has(role)) return { error: "unauthorized" };
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("nav_items")
    .select("id, source_page_id")
    .eq("id", navItemId)
    .single();
  if (!row) return { error: "not_found" };

  const { error } = await admin.from("nav_items").delete().eq("id", navItemId);
  if (error) return { error: "delete_failed" };

  await writeAuditLog(user.id, "nav_item_remove", null, {
    nav_item_id: navItemId,
    hub_id: row.source_page_id,
  });
  revalidatePath("/admin/hubs");
  revalidatePath(`/admin/pages/${row.source_page_id}/edit`);
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function moveNavItemToHub(
  navItemId: number,
  newHubId: number,
): Promise<{ ok: true } | { error: string }> {
  const { user, role } = await requireAdmin();
  if (!NAV_ITEM_ALLOWED_ROLES.has(role)) return { error: "unauthorized" };
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("nav_items")
    .select("id, source_page_id")
    .eq("id", navItemId)
    .single();
  if (!row) return { error: "not_found" };
  if (row.source_page_id === newHubId) return { ok: true };

  const { data: hub } = await admin
    .from("pages")
    .select("id, type")
    .eq("id", newHubId)
    .single();
  if (!hub) return { error: "hub_not_found" };
  if (hub.type !== "blurb-nav-hub") return { error: "not_a_hub" };

  const position = await nextNavItemPosition(admin, newHubId);
  const { error } = await admin
    .from("nav_items")
    .update({ source_page_id: newHubId, position })
    .eq("id", navItemId);
  if (error) return { error: "update_failed" };

  await writeAuditLog(user.id, "nav_item_move", null, {
    nav_item_id: navItemId,
    from_hub: row.source_page_id,
    to_hub: newHubId,
  });
  revalidatePath("/admin/hubs");
  revalidatePath(`/admin/pages/${row.source_page_id}/edit`);
  revalidatePath(`/admin/pages/${newHubId}/edit`);
  revalidatePath("/app", "layout");
  return { ok: true };
}

// ── Profile ───────────────────────────────────────────────────────────────────

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: String(formData.get("display_name")) })
    .eq("id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/settings");
}

// ── New-page wizard ───────────────────────────────────────────────────────────
//
// `createPage` and `checkSlugAvailable` back the multi-step wizard at
// /admin/pages/new. Allowed roles: super_admin, content_admin. Pages are
// created as drafts; admin is redirected to the existing edit screen to add
// content (lessons / quiz / flashcards / hub items).
//
// pages.id is a bigint primary key with NO sequence — original WP IDs were
// preserved at migration time. New rows compute id = max(id) + 1. The pages
// table has a unique constraint on slug, which races against the explicit
// pre-check; we treat the unique-violation error code (23505) as "slug taken".

const PAGE_NEW_ALLOWED_ROLES = new Set(["super_admin", "content_admin"]);
const PAGE_NEW_ALLOWED_TYPES = new Set([
  "plain-content",
  "text-lesson",
  "audio-lesson",
  "h5p-quiz",
  "blurb-nav-hub",
]);
const NEW_PAGE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Flashcards reuse the h5p-quiz type but always carry this track_id.
const FLASHCARDS_TRACK_ID = 3;

export type CreatePageInput = {
  type: string;
  title: string;
  slug: string;
  specialty_id?: number;
  view?: string;
  track_id?: number;
  content_module_id?: number;
  notes?: string;
};

export type CreatePageResult = { id: number } | { error: string };

export async function createPage(input: CreatePageInput): Promise<CreatePageResult> {
  const { user, role } = await requireAdmin();
  if (!PAGE_NEW_ALLOWED_ROLES.has(role)) {
    return { error: "unauthorized" };
  }

  const title = input.title?.trim() ?? "";
  const slug = input.slug?.trim() ?? "";

  if (!title) return { error: "title_required" };
  if (!slug) return { error: "slug_required" };
  if (!NEW_PAGE_SLUG_REGEX.test(slug)) return { error: "slug_invalid" };
  if (!PAGE_NEW_ALLOWED_TYPES.has(input.type)) return { error: "type_invalid" };

  const admin = createAdminClient();

  // Pre-check slug uniqueness — cheaper than catching the constraint error on
  // every typo. The actual race-safe guard is the unique constraint below.
  const { count: slugCollision } = await admin
    .from("pages")
    .select("id", { count: "exact", head: true })
    .eq("slug", slug);
  if ((slugCollision ?? 0) > 0) return { error: "slug_taken" };

  // Compute next id from current max. New admin-created pages live above the
  // migrated WP ID range, so collisions with future re-imports are unlikely
  // but the unique slug constraint is still our last line of defense.
  const { data: maxRow } = await admin
    .from("pages")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextId = Number(maxRow?.id ?? 0) + 1;

  const { data: inserted, error } = await admin
    .from("pages")
    .insert({
      id: nextId,
      slug,
      title,
      type: input.type,
      status: "draft",
      specialty_id: input.specialty_id ?? null,
      view: input.view ?? null,
      track_id: input.track_id ?? null,
      content_module_id: input.content_module_id ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // Postgres unique violation — slug was taken between pre-check and insert.
    if (error.code === "23505") return { error: "slug_taken" };
    return { error: "insert_failed" };
  }

  const newId = Number(inserted.id);
  await writeAuditLog(user.id, "page_created", null, {
    page_id: newId,
    slug,
    type: input.type,
    title,
  });

  revalidatePath("/admin/pages");
  return { id: newId };
}

export async function checkSlugAvailable(slug: string): Promise<{ available: boolean }> {
  const { role } = await requireAdmin();
  if (!PAGE_NEW_ALLOWED_ROLES.has(role)) return { available: false };

  const trimmed = slug.trim();
  if (!trimmed || !NEW_PAGE_SLUG_REGEX.test(trimmed)) return { available: false };

  const admin = createAdminClient();
  const { count } = await admin
    .from("pages")
    .select("id", { count: "exact", head: true })
    .eq("slug", trimmed);

  return { available: (count ?? 0) === 0 };
}

// ── Quick create (inline page creation from the hub card flow) ─────────────────
//
// Mirrors `createPage` but is built for the "Create new" branch of the
// PagePicker: the caller supplies only a title + template; the slug is derived
// server-side and auto-disambiguated, and specialty/view/track come from the
// parent hub's context. The page is always created as a draft.

function slugifyServer(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type QuickCreateInput = {
  type: string;
  title: string;
  specialtyId?: number | null;
  view?: string | null;
  trackId?: number | null;
};

export type QuickCreateResult =
  | { id: number; slug: string; title: string; type: string }
  | { error: string };

export async function createPageQuick(
  input: QuickCreateInput,
): Promise<QuickCreateResult> {
  const { user, role } = await requireAdmin();
  if (!PAGE_NEW_ALLOWED_ROLES.has(role)) return { error: "unauthorized" };

  const title = input.title?.trim() ?? "";
  if (!title) return { error: "title_required" };
  if (!PAGE_NEW_ALLOWED_TYPES.has(input.type)) return { error: "type_invalid" };

  const base = slugifyServer(title);
  if (!base) return { error: "title_required" };

  const admin = createAdminClient();

  // Derive a free slug from the title: base, then base-2, base-3… The unique
  // constraint on pages.slug is still the race-safe backstop on insert.
  let slug = base;
  for (let n = 2; n <= 50; n++) {
    const { count } = await admin
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("slug", slug);
    if ((count ?? 0) === 0) break;
    slug = `${base}-${n}`;
    if (n === 50) return { error: "slug_taken" };
  }

  const { data: maxRow } = await admin
    .from("pages")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextId = Number(maxRow?.id ?? 0) + 1;

  const { data: inserted, error } = await admin
    .from("pages")
    .insert({
      id: nextId,
      slug,
      title,
      type: input.type,
      status: "draft",
      specialty_id: input.specialtyId ?? null,
      view: input.view ?? null,
      track_id: input.trackId ?? null,
      content_module_id: null,
      notes: null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "slug_taken" };
    return { error: "insert_failed" };
  }

  const newId = Number(inserted.id);
  await writeAuditLog(user.id, "page_created", null, {
    page_id: newId,
    slug,
    type: input.type,
    title,
    via: "quick_create",
  });

  revalidatePath("/admin/pages");
  return { id: newId, slug, title, type: input.type };
}

// ── Duplicate page ────────────────────────────────────────────────────────────
//
// Clones a page (metadata + its child content) into a new draft with a fresh
// slug. Lets editors start from a similar page instead of a blank one.

export type DuplicatePageResult = { id: number } | { error: string };

export async function duplicatePage(pageId: number): Promise<DuplicatePageResult> {
  const { user, role } = await requireAdmin();
  if (!PAGE_NEW_ALLOWED_ROLES.has(role)) return { error: "unauthorized" };
  const admin = createAdminClient();

  const { data: src } = await admin
    .from("pages")
    .select("slug, title, type, view, specialty_id, track_id, content_module_id, notes")
    .eq("id", pageId)
    .single();
  if (!src) return { error: "not_found" };

  // Fresh slug derived from the source: <slug>-copy, then -copy-2, -copy-3…
  const base = `${src.slug}-copy`;
  let slug = base;
  for (let n = 2; n <= 50; n++) {
    const { count } = await admin
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("slug", slug);
    if ((count ?? 0) === 0) break;
    slug = `${base}-${n}`;
    if (n === 50) return { error: "slug_taken" };
  }

  const { data: maxRow } = await admin
    .from("pages")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const newId = Number(maxRow?.id ?? 0) + 1;

  const { error: insErr } = await admin.from("pages").insert({
    id: newId,
    slug,
    title: `${src.title} (cópia)`,
    type: src.type,
    status: "draft",
    specialty_id: src.specialty_id,
    view: src.view,
    track_id: src.track_id,
    content_module_id: src.content_module_id,
    notes: src.notes,
  });
  if (insErr) {
    if (insErr.code === "23505") return { error: "slug_taken" };
    return { error: "insert_failed" };
  }

  // Copy child content according to the page type.
  if (src.type === "text-lesson" || src.type === "audio-lesson") {
    const { data: rows } = await admin
      .from("lessons")
      .select("position, title, body_html, audio_url")
      .eq("page_id", pageId)
      .order("position");
    if (rows?.length) {
      await admin.from("lessons").insert(rows.map((r) => ({ page_id: newId, ...r })));
    }
  } else if (src.type === "h5p-quiz") {
    if (src.track_id === FLASHCARDS_TRACK_ID) {
      const { data: rows } = await admin
        .from("flashcard_items")
        .select("group_position, group_label, position, text, answer, image_url, tip")
        .eq("page_id", pageId);
      if (rows?.length) {
        await admin.from("flashcard_items").insert(rows.map((r) => ({ page_id: newId, ...r })));
      }
    } else {
      const { data: rows } = await admin
        .from("quiz_questions")
        .select("position, question, answers, media_url")
        .eq("page_id", pageId)
        .order("position");
      if (rows?.length) {
        await admin.from("quiz_questions").insert(rows.map((r) => ({ page_id: newId, ...r })));
      }
    }
  } else if (src.type === "blurb-nav-hub") {
    const { data: rows } = await admin
      .from("nav_items")
      .select("position, label, target_page_id, group_label, icon, layout")
      .eq("source_page_id", pageId)
      .order("position");
    if (rows?.length) {
      await admin.from("nav_items").insert(rows.map((r) => ({ source_page_id: newId, ...r })));
    }
  }

  await writeAuditLog(user.id, "page_duplicated", null, {
    source_page_id: pageId,
    new_page_id: newId,
    slug,
  });
  revalidatePath("/admin/pages");
  return { id: newId };
}

// ── Lesson audio upload (Bunny CDN) ──────────────────────────────────────────
//
// Uploads an MP3 (or other audio file) to Bunny Storage under
// `admin-audio/{page-slug}/{timestamp}-{sanitized-name}` and returns the
// public CDN URL the lesson row should point to. The caller (admin UI) writes
// the returned URL into `lessons.audio_url` via `updateLessons`.
//
// Storage zone is read from BUNNY_STORAGE_ENDPOINT (which already includes the
// zone, e.g. https://br.storage.bunnycdn.com/revalida). The AccessKey is
// BUNNY_STORAGE_PASSWORD (storage-zone password — same key used by
// scripts/bunny-list-medvoice.js).

const BUNNY_CDN_BASE = "https://medhelpspace.b-cdn.net";
const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 100 MB — matches next.config bodySizeLimit
const ALLOWED_AUDIO_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);

function sanitizeAudioFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "mp3";
  const cleanStem = stem
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "audio";
  const cleanExt = ext.replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp3";
  return `${cleanStem}.${cleanExt}`;
}

export async function uploadLessonAudio(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireAdmin();

  const file = formData.get("file");
  const pageSlugRaw = formData.get("pageSlug");

  if (!(file instanceof File)) return { error: "no_file" };
  if (typeof pageSlugRaw !== "string" || !pageSlugRaw.trim()) {
    return { error: "no_page_slug" };
  }

  const pageSlug = pageSlugRaw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!pageSlug) return { error: "no_page_slug" };

  if (file.size === 0) return { error: "empty_file" };
  if (file.size > MAX_AUDIO_BYTES) return { error: "too_large" };

  const mime = (file.type || "").toLowerCase();
  if (mime && !ALLOWED_AUDIO_MIME.has(mime)) return { error: "bad_mime" };

  const endpoint = process.env.BUNNY_STORAGE_ENDPOINT;
  const accessKey =
    process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY;
  if (!endpoint || !accessKey) {
    console.error("[uploadLessonAudio] Bunny env vars missing");
    return { error: "bunny_not_configured" };
  }

  const filename = sanitizeAudioFilename(file.name || "audio.mp3");
  const remotePath = `admin-audio/${pageSlug}/${Date.now()}-${filename}`;
  const uploadUrl = `${endpoint.replace(/\/$/, "")}/${remotePath}`;
  const publicUrl = `${BUNNY_CDN_BASE}/${remotePath}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: accessKey,
      "Content-Type": mime || "application/octet-stream",
    },
    body: buffer,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[uploadLessonAudio] Bunny PUT ${res.status}: ${body}`);
    return { error: "upload_failed" };
  }

  return { url: publicUrl };
}
