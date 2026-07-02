import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { VIEWAS_COOKIE, parseViewAs } from "@/lib/viewas";
import type { Cohort } from "@/types/supabase";

export const MEDHELP_60D_MODULE_ID = 1;

const ADMIN_ROLES = ["super_admin", "content_admin", "support_admin", "billing_admin"];

export type Medhelp60Access = {
  /** True when the module is open for the current viewing context. */
  unlocked: boolean;
  /** Days remaining until unlock (0 when unlocked, null when access is unknown). */
  daysUntilUnlock: number | null;
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
  if (USE_MOCK_DATA) return { unlocked: true, daysUntilUnlock: 0 };

  const viewas = parseViewAs((await cookies()).get(VIEWAS_COOKIE)?.value);
  if (viewas.type === "unlocked") return { unlocked: true, daysUntilUnlock: 0 };

  const admin = createAdminClient();
  let cohort: Cohort | null = null;

  if (viewas.type === "cohort") {
    const { data } = await admin.from("cohorts").select("*").eq("slug", viewas.slug).single();
    cohort = (data as Cohort) ?? null;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { unlocked: false, daysUntilUnlock: null };

    // Staff see the module open without needing a membership (matches the
    // requireActiveMembership admin bypass). They preview the real member
    // experience with the "Ver como" view-as toggle.
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (ADMIN_ROLES.includes(profile?.role ?? "")) {
      return { unlocked: true, daysUntilUnlock: 0 };
    }

    const { data: memberships } = await admin
      .from("user_cohort_memberships")
      .select("cohort:cohorts(*)")
      .eq("user_id", user.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cohorts: Cohort[] = ((memberships ?? []) as any[]).map((m) => m.cohort as Cohort).filter(Boolean);
    const today = new Date().toISOString();
    cohort =
      cohorts.find((c) => c.membership_starts_at <= today && c.membership_ends_at >= today) ??
      cohorts[cohorts.length - 1] ??
      null;
  }

  if (!cohort) return { unlocked: false, daysUntilUnlock: null };

  const { data: access } = await admin
    .from("cohort_module_access")
    .select("unlock_date")
    .eq("cohort_id", cohort.id)
    .eq("content_module_id", MEDHELP_60D_MODULE_ID)
    .maybeSingle();
  if (!access) return { unlocked: false, daysUntilUnlock: null };

  const days = Math.max(
    0,
    Math.ceil((new Date(access.unlock_date as string).getTime() - Date.now()) / 86_400_000),
  );
  const unlocked = days === 0;
  // "Already open" is safe to state even on an unconfirmed date — it reveals nothing.
  // The pre-open countdown is what leaks the guessed exam date (unlock = exam - 60),
  // so it's withheld until the exam board actually confirms cohort.test_date.
  const daysUntilUnlock = unlocked || cohort.date_confirmed ? days : null;
  return { unlocked, daysUntilUnlock };
}
