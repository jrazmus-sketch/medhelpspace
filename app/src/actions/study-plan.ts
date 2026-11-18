"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { todayKeyBR } from "@/lib/br-date";
import type { ContentType, WeaknessSensitivity } from "@/lib/study-plan/derive";
import { isValidDailyMinutes } from "@/lib/study-plan/availability";
import { isPaceMode, type PaceMode } from "@/lib/study-plan/pace";
import { frequencyToColumn, isSimuladoFrequency, type SimuladoFrequency } from "@/lib/study-plan/simulado";
import { getDerivedPlanForUser } from "@/lib/study-plan/fetch";

// NOTE: A "use server" module may only export async functions. Do NOT re-export
// types from here — the server-actions compiler turns `export type { … }` into a
// runtime value re-export, which crashes with "<Type> is not defined".
// Client code imports these types directly from "@/lib/study-plan/derive".

// ── Generic study_plans upsert helper ────────────────────────────────────────

type StudyPlansPatch = Partial<{
  available_days: number;
  recurring_off_days: number;
  daily_minutes: number;
  temp_daily_minutes: number | null;
  temp_daily_until: string | null;
  weakness_sensitivity: WeaknessSensitivity;
  include_60d: boolean;
  flashcard_daily_cap: number | null;
  preferred_content_types: ContentType[];
  content_type_weights: Record<ContentType, number>;
  intensification_start_days: number;
  email_weekly_summary: boolean;
  email_daily_plan: boolean;
  pace_mode: PaceMode;
  simulados_per_week: number | null;
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

/**
 * "Tempo de estudo por dia" (Karina 2026-11-18): the minutes the student can
 * study on EACH selected day. The weekly total is derived, never stored.
 */
export async function setDailyMinutes(minutes: number): Promise<void> {
  if (!isValidDailyMinutes(minutes)) return;
  const user = await getUser();
  if (!user) return;
  await upsertStudyPlan(user.id, { daily_minutes: minutes });
  revalidatePath("/app", "layout");
}

/** "Ritmo de estudo": auto (the plan learns the student's pace) or a manual step. */
export async function setPaceMode(mode: PaceMode): Promise<void> {
  if (!isPaceMode(mode)) return;
  const user = await getUser();
  if (!user) return;
  await upsertStudyPlan(user.id, { pace_mode: mode });
  revalidatePath("/app", "layout");
}

/**
 * Mini simulados per week: "auto" or the student's own 1 / 2 (Karina 2026-11-17).
 * The screen shows the impact BEFORE this is called; the feasibility is checked
 * again here, against the student's real availability and pace — a frequency
 * whose sessions alone exceed the week's study time is refused, never saved.
 * Returns a value (Server Action errors are redacted in production).
 */
export async function setSimuladoFrequency(
  frequency: SimuladoFrequency,
): Promise<{ ok: true } | { ok: false; error: "invalid" | "infeasible" | "failed" }> {
  if (!isSimuladoFrequency(frequency)) return { ok: false, error: "invalid" };
  const user = await getUser();
  if (!user) return { ok: false, error: "failed" };
  if (frequency !== "auto") {
    const plan = await getDerivedPlanForUser(user.id);
    const option = plan?.simulado.options.find((o) => o.frequency === frequency);
    if (!option) return { ok: false, error: "failed" };
    if (!option.feasible) return { ok: false, error: "infeasible" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("study_plans")
    .upsert(
      { user_id: user.id, simulados_per_week: frequencyToColumn(frequency), updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) return { ok: false, error: "failed" };
  revalidatePath("/app", "layout");
  return { ok: true };
}

// ── "Reduzir o tempo de estudo por um período" ───────────────────────────────

/** A shorter study day up to `untilDate` (inclusive). Both null → back to the regular time. */
export async function setStudyTimeReduction(
  minutes: number | null,
  untilDate: string | null,
): Promise<void> {
  let patch: StudyPlansPatch = { temp_daily_minutes: null, temp_daily_until: null };
  if (minutes != null && untilDate != null) {
    if (!isValidDailyMinutes(minutes) || !/^\d{4}-\d{2}-\d{2}$/.test(untilDate)) return;
    patch = { temp_daily_minutes: minutes, temp_daily_until: untilDate };
  }
  const user = await getUser();
  if (!user) return;
  await upsertStudyPlan(user.id, patch);
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
  // The student's today in Brazil — a UTC key would skip TOMORROW for anyone
  // tapping "pular hoje" after 21:00 BRT.
  const todayKey = todayKeyBR();
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
  dailyMinutes: number;
  availableDays: number;
  focusSpecialtyIds: number[];
  resourceTypes?: ContentType[];
}): Promise<void> {
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();

  // Update study_plans with the daily time + days + welcomed_at. When the wizard
  // sends resource picks, persist them as preferred_content_types — always
  // keeping "memorecards" (a 60D auto-feature, not a picker toggle).
  await supabase
    .from("study_plans")
    .upsert(
      {
        user_id: user.id,
        ...(isValidDailyMinutes(params.dailyMinutes) ? { daily_minutes: params.dailyMinutes } : {}),
        available_days: params.availableDays,
        welcomed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(params.resourceTypes
          ? {
              preferred_content_types: Array.from(
                new Set<ContentType>([...params.resourceTypes, "memorecards"]),
              ),
            }
          : {}),
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
