"use server";

/**
 * Meu Plano — the time estimates Karina edits at /admin/plano (table study_plan_settings, one row).
 * Content roles only (super_admin, content_admin). Every change is written to admin_audit_log with before → after.
 *
 * Returns a discriminated value instead of throwing: Server Action errors are redacted in production, so a thrown
 * message would reach the screen as a generic failure.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_SETTING_FIELDS, settingsFromRow } from "@/lib/study-plan/settings";

export type SavePlanSettingsResult = { ok: true } | { ok: false; error: "forbidden" | "invalid" | "failed" };

export async function savePlanSettings(input: {
  values: Record<string, number>;
  adaptivePaceEnabled: boolean;
}): Promise<SavePlanSettingsResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "forbidden" };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["super_admin", "content_admin"].includes(profile.role as string)) {
    return { ok: false, error: "forbidden" };
  }

  // Every field is required and range-checked here, on the server — the form's own limits are a convenience.
  const row: Record<string, number | boolean | string> = {};
  for (const f of PLAN_SETTING_FIELDS) {
    const n = Number(input.values?.[f.key]);
    if (!Number.isFinite(n) || n < f.min || n > f.max) return { ok: false, error: "invalid" };
    row[f.column] = f.kind === "integer" ? Math.round(n) : Math.round(n * 100) / 100;
  }
  if (typeof input.adaptivePaceEnabled !== "boolean") return { ok: false, error: "invalid" };
  row.adaptive_pace_enabled = input.adaptivePaceEnabled;

  const admin = createAdminClient();
  const { data: beforeRow, error: readError } = await admin.from("study_plan_settings").select("*").maybeSingle();
  if (readError) return { ok: false, error: "failed" };
  const before = settingsFromRow(beforeRow as Record<string, unknown> | null);

  const { error } = await admin
    .from("study_plan_settings")
    .upsert({ id: true, ...row, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: "id" });
  if (error) return { ok: false, error: "failed" };

  // Only what actually changed goes to the audit log.
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of PLAN_SETTING_FIELDS) {
    if (before[f.key] !== row[f.column]) changes[f.column] = { from: before[f.key], to: row[f.column] };
  }
  if (before.adaptivePaceEnabled !== input.adaptivePaceEnabled) {
    changes.adaptive_pace_enabled = { from: before.adaptivePaceEnabled, to: input.adaptivePaceEnabled };
  }
  if (Object.keys(changes).length > 0) {
    await admin.from("admin_audit_log").insert({
      actor_user_id: user.id, action: "plan_settings_update", target_user_id: null, details: { changes },
    });
  }

  revalidatePath("/admin/plano");
  revalidatePath("/app", "layout");
  return { ok: true };
}
