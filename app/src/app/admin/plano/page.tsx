import { createAdminClient } from "@/lib/supabase/admin";
import { loadPaceStats } from "@/lib/study-plan/settings-server";
import { DEFAULT_PLAN_SETTINGS, settingsFromRow } from "@/lib/study-plan/settings";
import { PlanSettingsClient } from "./plan-settings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meu Plano" };

// The time estimates and shares Meu Plano is built from (Karina 2026-11-17): one row, edited here, read by the
// plan on every load — so a change needs no code change and no deploy.
export default async function PlanSettingsPage() {
  const admin = createAdminClient();
  const [{ data, error }, stats] = await Promise.all([
    admin.from("study_plan_settings").select("*").maybeSingle(),
    loadPaceStats(admin),
  ]);
  return (
    <PlanSettingsClient
      settings={error || !data ? { ...DEFAULT_PLAN_SETTINGS } : settingsFromRow(data as Record<string, unknown>)}
      stats={stats}
      unavailable={!!error}
    />
  );
}
