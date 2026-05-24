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
