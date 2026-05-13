"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

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

// ── Cohort actions ────────────────────────────────────────────────────────────

export async function assignMemberToCohort(userId: string, cohortId: number | null) {
  await requireAdmin();
  const admin = createAdminClient();
  await admin.from("user_cohort_memberships").delete().eq("user_id", userId);
  if (cohortId !== null) {
    await admin.from("user_cohort_memberships").insert({ user_id: userId, cohort_id: cohortId });
  }
  revalidatePath("/admin/members");
}

export async function createCohort(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("cohorts").insert({
    slug: String(formData.get("slug")),
    name: String(formData.get("name")),
    test_date: String(formData.get("test_date")),
    membership_starts_at: String(formData.get("membership_starts_at")),
    membership_ends_at: String(formData.get("membership_ends_at")),
  });
  if (error) throw new Error(error.message);
  // Seed cohort_module_access rows for every content module
  const { data: modules } = await admin.from("content_modules").select("id, unlock_offset_days");
  const { data: newCohort } = await admin
    .from("cohorts")
    .select("id, test_date")
    .eq("slug", String(formData.get("slug")))
    .single();
  if (newCohort && modules?.length) {
    await admin.from("cohort_module_access").insert(
      modules.map((m) => ({
        cohort_id: newCohort.id,
        content_module_id: m.id,
        unlock_date: `${newCohort.test_date}`, // trigger will recalc, this is placeholder
      }))
    );
  }
  revalidatePath("/admin/cohorts");
}

export async function updateCohort(
  cohortId: number,
  data: { name: string; test_date: string; membership_starts_at: string; membership_ends_at: string },
) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("cohorts").update(data).eq("id", cohortId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cohorts");
  revalidatePath(`/admin/cohorts/${cohortId}/modules`);
}

export async function softDeleteCohort(cohortId: number) {
  const { role } = await requireAdmin();
  if (role !== "super_admin") throw new Error("Super admin required");
  const admin = createAdminClient();
  const { error } = await admin.from("cohorts").update({ active: false }).eq("id", cohortId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cohorts");
}

export async function reactivateCohort(cohortId: number) {
  const { role } = await requireAdmin();
  if (role !== "super_admin") throw new Error("Super admin required");
  const admin = createAdminClient();
  const { error } = await admin.from("cohorts").update({ active: true }).eq("id", cohortId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cohorts");
}

// ── Module access override ────────────────────────────────────────────────────

export async function overrideModuleUnlockDate(
  cohortId: number,
  moduleId: number,
  unlockDate: string,
) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("cohort_module_access")
    .update({ unlock_date: unlockDate, is_manual_override: true })
    .eq("cohort_id", cohortId)
    .eq("content_module_id", moduleId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/cohorts/${cohortId}/modules`);
}

export async function resetModuleUnlockDate(cohortId: number, moduleId: number) {
  await requireAdmin();
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
  // Call GoTrue /recover endpoint with service role key — sends the reset email
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/recover`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
        Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`,
      },
      body: JSON.stringify({ email }),
    },
  );
  if (!res.ok) throw new Error(`Password reset failed: ${res.status}`);
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id").eq("email", email).single();
  await writeAuditLog(user.id, "password_reset", target?.id ?? null, { email });
}

export async function revokeUserSessions(targetUserId: string) {
  const { user } = await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.signOut(targetUserId, "global");
  if (error) throw new Error(error.message);
  await writeAuditLog(user.id, "revoke_sessions", targetUserId, {});
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
