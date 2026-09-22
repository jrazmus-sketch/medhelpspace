import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { VIEWAS_COOKIE, parseViewAs } from "@/lib/viewas";
import type { Cohort } from "@/types/supabase";
import { formatDateKeyBR } from "@/lib/cohort-promotions-shared";

export const MEDHELP_60D_MODULE_ID = 1;

const ADMIN_ROLES = ["super_admin", "content_admin", "support_admin", "billing_admin"];

export type Medhelp60Access = {
  /** True when the module is open for the current viewing context. */
  unlocked: boolean;
  /** Days remaining until unlock (0 when unlocked, null when access is unknown). */
  daysUntilUnlock: number | null;
  /**
   * Set only for a launch-condition student who was moved onto their next turma
   * (user_cohort_memberships.rolled_over_from_cohort_id) while that turma's 60D is
   * still closed — the gap between the two cycles. Drives the "o restante do
   * conteúdo continua disponível; o próximo MedHelp 60D será liberado em …" notice
   * (Karina, 2026-09-21). `unlockDateLabel` follows the same leak rule as the
   * countdown: withheld until the exam date is confirmed.
   */
  nextCycle: { cohortName: string; unlockDateLabel: string | null } | null;
};

/**
 * Single source of truth for "is MedHelp 60D open for whoever is viewing right
 * now?". Used by the dashboard card, the top-nav item, and the 60D page so the
 * three always agree. View-as aware (mirrors the dashboard):
 *   - view-as "unlocked"   → open (admin previewing the unlocked experience)
 *   - view-as "cohort:X"   → that cohort's real unlock date (realistic preview)
 *   - default ("admin"):
 *       · admin roles       → open (staff have full content access)
 *       · everyone else     → their own active cohort's unlock date
 */
export async function get60dAccess(): Promise<Medhelp60Access> {
  if (USE_MOCK_DATA) return { unlocked: true, daysUntilUnlock: 0, nextCycle: null };

  const viewas = parseViewAs((await cookies()).get(VIEWAS_COOKIE)?.value);
  if (viewas.type === "unlocked") return { unlocked: true, daysUntilUnlock: 0, nextCycle: null };

  const admin = createAdminClient();
  let cohort: Cohort | null = null;
  let rolledOver = false;

  if (viewas.type === "cohort") {
    const { data } = await admin.from("cohorts").select("*").eq("slug", viewas.slug).single();
    cohort = (data as Cohort) ?? null;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { unlocked: false, daysUntilUnlock: null, nextCycle: null };

    // Staff see the module open without needing a membership (matches the
    // requireActiveMembership admin bypass). They preview the real member
    // experience with the "Ver como" view-as toggle.
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (ADMIN_ROLES.includes(profile?.role ?? "")) {
      return { unlocked: true, daysUntilUnlock: 0, nextCycle: null };
    }

    const { data: memberships } = await admin
      .from("user_cohort_memberships")
      .select("rolled_over_from_cohort_id, cohort:cohorts(*)")
      .eq("user_id", user.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((memberships ?? []) as any[]).filter((m) => m.cohort) as {
      rolled_over_from_cohort_id: number | null;
      cohort: Cohort;
    }[];
    const today = new Date().toISOString();
    const row =
      rows.find((m) => m.cohort.membership_starts_at <= today && m.cohort.membership_ends_at >= today) ??
      rows[rows.length - 1] ??
      null;
    cohort = row?.cohort ?? null;
    rolledOver = row?.rolled_over_from_cohort_id != null;
  }

  if (!cohort) return { unlocked: false, daysUntilUnlock: null, nextCycle: null };

  const { data: access } = await admin
    .from("cohort_module_access")
    .select("unlock_date")
    .eq("cohort_id", cohort.id)
    .eq("content_module_id", MEDHELP_60D_MODULE_ID)
    .maybeSingle();
  if (!access) return { unlocked: false, daysUntilUnlock: null, nextCycle: null };

  const days = Math.max(
    0,
    Math.ceil((new Date(access.unlock_date as string).getTime() - Date.now()) / 86_400_000),
  );
  const unlocked = days === 0;
  // "Already open" is safe to state even on an unconfirmed date — it reveals nothing.
  // The pre-open countdown is what leaks the guessed exam date (unlock = exam - 60),
  // so it's withheld until the exam board actually confirms cohort.test_date.
  const daysUntilUnlock = unlocked || cohort.date_confirmed ? days : null;
  const nextCycle =
    rolledOver && !unlocked
      ? {
          cohortName: cohort.name,
          unlockDateLabel: cohort.date_confirmed
            ? formatDateKeyBR(String(access.unlock_date).slice(0, 10))
            : null,
        }
      : null;
  return { unlocked, daysUntilUnlock, nextCycle };
}
