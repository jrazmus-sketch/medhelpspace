import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_PLAN_SETTINGS, settingsFromRow, type PlanSettings } from "./settings";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The one `study_plan_settings` row → PlanSettings. A missing table or row
 * (patch not applied yet) is NOT an error: the plan simply runs on the code
 * defaults, which are the same numbers.
 */
export async function loadPlanSettings(admin: Admin = createAdminClient()): Promise<PlanSettings> {
  const { data, error } = await admin.from("study_plan_settings").select("*").maybeSingle();
  if (error || !data) return { ...DEFAULT_PLAN_SETTINGS };
  return settingsFromRow(data as Record<string, unknown>);
}

export type PaceStats = {
  questionSeconds: number | null;
  questionSamples: number;
  questionStudents: number;
  flashcardSeconds: number | null;
  flashcardSamples: number;
  flashcardStudents: number;
};

/** Typical time between answers across ALL students (admin screen, next to each default). */
export async function loadPaceStats(admin: Admin = createAdminClient()): Promise<PaceStats | null> {
  const { data, error } = await admin.rpc("study_plan_pace_stats");
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    questionSeconds: num(d.question_seconds),
    questionSamples: Number(d.question_samples ?? 0),
    questionStudents: Number(d.question_students ?? 0),
    flashcardSeconds: num(d.flashcard_seconds),
    flashcardSamples: Number(d.flashcard_samples ?? 0),
    flashcardStudents: Number(d.flashcard_students ?? 0),
  };
}
