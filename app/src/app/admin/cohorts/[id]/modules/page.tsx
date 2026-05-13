import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ModulesClient } from "./modules-client";

export const metadata = { title: "Acesso a módulos" };

export default async function CohortModulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cohortId = Number(id);
  if (isNaN(cohortId)) notFound();

  const admin = createAdminClient();

  const [{ data: cohort }, { data: modules }, { data: access }] = await Promise.all([
    admin.from("cohorts").select("id, name, test_date").eq("id", cohortId).single(),
    admin.from("content_modules").select("id, name, unlock_offset_days").order("id"),
    admin.from("cohort_module_access")
      .select("content_module_id, unlock_date, is_manual_override")
      .eq("cohort_id", cohortId),
  ]);

  if (!cohort) notFound();

  const testDate = cohort.test_date as string;

  const rows = (modules ?? []).map((m) => {
    const acc = (access ?? []).find((a) => a.content_module_id === m.id);
    const offsetDays = m.unlock_offset_days as number;
    // auto date: test_date - offset (local arithmetic, no UTC shift)
    const [y, mo, d] = testDate.split("-").map(Number);
    const autoDateObj = new Date(y, mo - 1, d);
    autoDateObj.setDate(autoDateObj.getDate() - offsetDays);
    const autoDate = `${autoDateObj.getFullYear()}-${String(autoDateObj.getMonth() + 1).padStart(2, "0")}-${String(autoDateObj.getDate()).padStart(2, "0")}`;

    return {
      moduleId: m.id as number,
      moduleName: m.name as string,
      unlockOffsetDays: offsetDays,
      unlockDate: (acc?.unlock_date as string) ?? autoDate,
      isManualOverride: (acc?.is_manual_override ?? false) as boolean,
      autoDate,
    };
  });

  return (
    <div className="space-y-4">
      <Link
        href="/admin/cohorts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Turmas
      </Link>
      <ModulesClient cohortId={cohortId} cohortName={cohort.name as string} rows={rows} />
    </div>
  );
}
