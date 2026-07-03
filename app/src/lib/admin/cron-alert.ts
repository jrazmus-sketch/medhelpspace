// Shared "this cron crashed" alert — one call site per cron route, wrapping its
// try/catch. Fires the existing cron_failure admin_alerts event (email + bell
// feed via recordAdminAlert). Date-scoped contextId means admin_alerts' own
// UNIQUE(event_type, context_id) naturally dedups repeated same-day retries —
// no extra dedup logic needed here.

import { recordAdminAlert } from "@/lib/admin-notify";

export async function alertCronFailure(cronName: string, err: unknown): Promise<void> {
  console.error(`${cronName}: cron run failed`, err);
  await recordAdminAlert({
    event: "cron_failure",
    title: `Falha na rotina ${cronName}`,
    contextId: `${cronName}:${new Date().toISOString().split("T")[0]}`,
    emailVars: {
      cronName,
      runAt: new Date().toLocaleString("pt-BR"),
      errorMessage: err instanceof Error ? err.message : String(err),
    },
  }).catch((e) => console.error("cron_failure alert failed", cronName, e));
}
