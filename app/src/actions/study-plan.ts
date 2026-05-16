"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type Intensity = "leve" | "padrao" | "intenso";

export type StudyPlanPrefsInput = {
  intensity?: Intensity;
  focus_specialty_id?: number | null;
  email_weekly_summary?: boolean;
  email_daily_plan?: boolean;
};

/**
 * Upserts a study_plans row for the current user.
 * Used both by initial onboarding (creates row) and ongoing edits.
 */
export async function updateStudyPlanPreferences(input: StudyPlanPrefsInput): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Fetch existing row so we can do a partial update via upsert
  const { data: existing } = await supabase
    .from("study_plans")
    .select("intensity, focus_specialty_id, email_weekly_summary, email_daily_plan")
    .eq("user_id", user.id)
    .maybeSingle();

  const payload = {
    user_id: user.id,
    intensity: input.intensity ?? existing?.intensity ?? "padrao",
    focus_specialty_id:
      input.focus_specialty_id !== undefined
        ? input.focus_specialty_id
        : (existing?.focus_specialty_id ?? null),
    email_weekly_summary:
      input.email_weekly_summary !== undefined
        ? input.email_weekly_summary
        : (existing?.email_weekly_summary ?? true),
    email_daily_plan:
      input.email_daily_plan !== undefined
        ? input.email_daily_plan
        : (existing?.email_daily_plan ?? false),
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("study_plans")
    .upsert(payload, { onConflict: "user_id" });

  revalidatePath("/app", "layout");
}

export async function pauseStudyPlan(untilDate: string | null): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("study_plans")
    .upsert(
      {
        user_id: user.id,
        paused_until: untilDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  revalidatePath("/app", "layout");
}

/**
 * Marks the user as "welcomed" — they've seen and dismissed the initial
 * plan welcome state. Called once on first dashboard interaction with the plan card.
 */
export async function markPlanWelcomed(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

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
