"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Intensity, ContentType, WeaknessSensitivity } from "@/lib/study-plan/derive";

// ── Type re-exports for client imports ───────────────────────────────────────
export type { Intensity, ContentType, WeaknessSensitivity };

// ── Generic study_plans upsert helper ────────────────────────────────────────

type StudyPlansPatch = Partial<{
  intensity: Intensity;
  available_days: number;
  recurring_off_days: number;
  weekly_hours: number | null;
  temp_intensity: Intensity | null;
  temp_intensity_until: string | null;
  weakness_sensitivity: WeaknessSensitivity;
  include_60d: boolean;
  flashcard_daily_cap: number | null;
  preferred_content_types: ContentType[];
  content_type_weights: Record<ContentType, number>;
  intensification_start_days: number;
  email_weekly_summary: boolean;
  email_daily_plan: boolean;
}>;

async function upsertStudyPlan(userId: string, patch: StudyPlansPatch) {
  const supabase = await createClient();
  await supabase
    .from("study_plans")
    .upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── Schedule / Availability actions ──────────────────────────────────────────

export async function setAvailableDays(mask: number): Promise<void> {
  const user = await getUser();
  if (!user) return;
  await upsertStudyPlan(user.id, { available_days: mask });
  revalidatePath("/app", "layout");
}

export async function setRecurringOffDays(mask: number): Promise<void> {
  const user = await getUser();
  if (!user) return;
  await upsertStudyPlan(user.id, { recurring_off_days: mask });
  revalidatePath("/app", "layout");
}

export async function setWeeklyHours(hours: number | null): Promise<void> {
  const user = await getUser();
  if (!user) return;
  await upsertStudyPlan(user.id, { weekly_hours: hours });
  revalidatePath("/app", "layout");
}

export async function setIntensity(intensity: Intensity): Promise<void> {
  const user = await getUser();
  if (!user) return;
  await upsertStudyPlan(user.id, { intensity });
  revalidatePath("/app", "layout");
}

// ── Temporary intensity (reduce intensity for N days) ────────────────────────

export async function setTempIntensity(
  intensity: Intensity | null,
  untilDate: string | null,
): Promise<void> {
  const user = await getUser();
  if (!user) return;
  await upsertStudyPlan(user.id, {
    temp_intensity: intensity,
    temp_intensity_until: untilDate,
  });
  revalidatePath("/app", "layout");
}

// ── Pauses (date ranges + skip today) ────────────────────────────────────────

export async function addPause(
  pauseFrom: string,
  pauseUntil: string,
  reason: string | null,
): Promise<void> {
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase.from("study_plan_pauses").insert({
    user_id: user.id,
    pause_from: pauseFrom,
    pause_until: pauseUntil,
    reason,
  });
  revalidatePath("/app", "layout");
}

export async function removePause(id: number): Promise<void> {
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase
    .from("study_plan_pauses")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);
  revalidatePath("/app", "layout");
}

export async function skipToday(reason?: string): Promise<void> {
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  const todayKey = new Date().toISOString().split("T")[0];
  await supabase.from("study_plan_pauses").insert({
    user_id: user.id,
    pause_from: todayKey,
    pause_until: todayKey,
    reason: reason ?? "Folga de hoje",
  });
  revalidatePath("/app", "layout");
}

// ── Multi-specialty preferences ──────────────────────────────────────────────

export async function setFocusSpecialties(specialtyIds: number[]): Promise<void> {
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  // Delete current set, insert new (simpler than diff)
  await supabase.from("study_plan_focus_specialties").delete().eq("user_id", user.id);
  if (specialtyIds.length > 0) {
    await supabase.from("study_plan_focus_specialties").insert(
      specialtyIds.map((id, idx) => ({
        user_id: user.id,
        specialty_id: id,
        priority: idx + 1, // first item is highest priority
      })),
    );
  }
  revalidatePath("/app", "layout");
}

export async function setExcludedSpecialties(specialtyIds: number[]): Promise<void> {
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase.from("study_plan_excluded_specialties").delete().eq("user_id", user.id);
  if (specialtyIds.length > 0) {
    await supabase.from("study_plan_excluded_specialties").insert(
      specialtyIds.map((id) => ({ user_id: user.id, specialty_id: id })),
    );
  }
  revalidatePath("/app", "layout");
}

// ── Content type preferences ─────────────────────────────────────────────────

export async function setContentTypes(types: ContentType[]): Promise<void> {
  const user = await getUser();
  if (!user) return;
  await upsertStudyPlan(user.id, { preferred_content_types: types });
  revalidatePath("/app", "layout");
}

export async function setContentTypeWeights(
  weights: Record<ContentType, number>,
): Promise<void> {
  const user = await getUser();
  if (!user) return;
  await upsertStudyPlan(user.id, { content_type_weights: weights });
  revalidatePath("/app", "layout");
}

// ── Advanced prefs ───────────────────────────────────────────────────────────

export async function setAdvancedPrefs(prefs: {
  weakness_sensitivity?: WeaknessSensitivity;
  include_60d?: boolean;
  flashcard_daily_cap?: number | null;
  intensification_start_days?: number;
}): Promise<void> {
  const user = await getUser();
  if (!user) return;
  await upsertStudyPlan(user.id, prefs);
  revalidatePath("/app", "layout");
}

// ── Notifications ────────────────────────────────────────────────────────────

export async function setEmailPrefs(prefs: {
  email_weekly_summary?: boolean;
  email_daily_plan?: boolean;
}): Promise<void> {
  const user = await getUser();
  if (!user) return;
  await upsertStudyPlan(user.id, prefs);
  revalidatePath("/app", "layout");
}

// ── Onboarding wizard completion ─────────────────────────────────────────────

export async function completeCalibration(params: {
  weeklyHours: number;
  availableDays: number;
  focusSpecialtyIds: number[];
}): Promise<void> {
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();

  // Update study_plans with weekly hours + days + welcomed_at
  await supabase
    .from("study_plans")
    .upsert(
      {
        user_id: user.id,
        weekly_hours: params.weeklyHours,
        available_days: params.availableDays,
        welcomed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  // Replace focus specialties
  await supabase
    .from("study_plan_focus_specialties")
    .delete()
    .eq("user_id", user.id);
  if (params.focusSpecialtyIds.length > 0) {
    await supabase.from("study_plan_focus_specialties").insert(
      params.focusSpecialtyIds.map((id, idx) => ({
        user_id: user.id,
        specialty_id: id,
        priority: idx + 1,
      })),
    );
  }

  revalidatePath("/app", "layout");
}

/**
 * Just mark the calibration banner as dismissed without going through the wizard.
 * The banner re-appears every 7 days until calibration is complete.
 */
export async function dismissCalibrationBanner(): Promise<void> {
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  // Set welcomed_at to "7 days ago" so the banner re-shows in 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 0); // dismiss = pause for 7 days
  await supabase
    .from("study_plans")
    .upsert(
      {
        user_id: user.id,
        welcomed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
}
