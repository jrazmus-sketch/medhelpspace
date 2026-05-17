"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { VIEWAS_COOKIE } from "@/lib/viewas";

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
  const { error } = await admin.auth.admin.signOut(targetUserId, "global");
  if (error) throw new Error(error.message);
  await writeAuditLog(user.id, "revoke_sessions", targetUserId, {});
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
  publish_at: string;
  cohort_id: number | null;
};

export async function createAnnouncement(data: AnnouncementInput) {
  const { user } = await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("announcements").insert({
    ...data,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
}

export async function updateAnnouncement(id: number, data: AnnouncementInput) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("announcements")
    .update({ ...data, updated_at: new Date().toISOString() })
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
