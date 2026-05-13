import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { USE_MOCK_DATA, MOCK_USER_WITH_COHORT } from "@/lib/mock-data";
import type { Cohort, UserWithCohort } from "@/types/supabase";

export const profileKeys = {
  current: ["profile", "current"] as const,
};

export async function getCurrentProfile(userId: string): Promise<UserWithCohort | null> {
  if (USE_MOCK_DATA) return MOCK_USER_WITH_COHORT;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(`
      *,
      user_cohort_memberships (
        cohort:cohorts (*)
      )
    `)
    .eq("id", userId)
    .single();

  if (error || !data) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cohorts: Cohort[] = ((data as any).user_cohort_memberships ?? [])
    .map((m: any) => m.cohort as Cohort)
    .filter(Boolean);

  const today = new Date().toISOString();
  const active_cohort =
    cohorts.find(
      (c) => c.membership_starts_at <= today && c.membership_ends_at >= today,
    ) ??
    cohorts[cohorts.length - 1] ??
    null;

  return { ...data, cohorts, active_cohort };
}

export function useCurrentProfile(userId: string | undefined) {
  return useQuery({
    queryKey: profileKeys.current,
    queryFn: () => getCurrentProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
