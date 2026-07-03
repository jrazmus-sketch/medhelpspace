// Shared "modules unlocking soon" computation — the single source of truth for
// which date-gated content_modules open today or tomorrow for some active cohort.
// Used by the admin bell route and the daily digest cron. Generic over any
// content_modules row (not hardcoded to MedHelp 60D) — unlock_date is already
// trigger-maintained on cohort_module_access from cohorts.test_date, so this is
// a pure read, no derived-date math here.

import { createAdminClient } from "@/lib/supabase/admin";

export type ModuleUnlock = {
  moduleId: number;
  moduleName: string;
  cohortId: number;
  cohortName: string;
  unlockDate: string;
  daysUntil: number;
};

function todayKey() {
  return new Date().toISOString().split("T")[0];
}
function offsetDateKey(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export async function getModulesUnlockingSoon(): Promise<ModuleUnlock[]> {
  const admin = createAdminClient();
  const today = todayKey();
  const tomorrow = offsetDateKey(1);

  const { data, error } = await admin
    .from("cohort_module_access")
    .select(
      "cohort_id, content_module_id, unlock_date, cohorts!inner(id, name, active), content_modules(id, name)",
    )
    .in("unlock_date", [today, tomorrow])
    .eq("cohorts.active", true);

  if (error || !data) {
    if (error) console.error("getModulesUnlockingSoon failed", error);
    return [];
  }

  return (
    data as unknown as {
      cohort_id: number;
      content_module_id: number;
      unlock_date: string;
      cohorts: { id: number; name: string; active: boolean };
      content_modules: { id: number; name: string };
    }[]
  ).map((row) => ({
    moduleId: row.content_module_id,
    moduleName: row.content_modules?.name ?? "Módulo",
    cohortId: row.cohort_id,
    cohortName: row.cohorts?.name ?? "Turma",
    unlockDate: row.unlock_date,
    daysUntil: row.unlock_date === today ? 0 : 1,
  }));
}
