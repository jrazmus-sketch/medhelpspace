import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  USE_MOCK_DATA,
  MOCK_USER_WITH_COHORT,
  MOCK_MODULE_ACCESS,
  MOCK_JOINED_AT,
} from "@/lib/mock-data";
import type { Cohort, CohortModuleAccess } from "@/types/supabase";

export const cohortKeys = {
  forUser: (userId: string) => ["cohort", userId] as const,
  membershipForUser: (userId: string) => ["cohort-membership", userId] as const,
  moduleAccess: (cohortId: number) => ["cohort-module-access", cohortId] as const,
};

export async function getCurrentUserCohort(userId: string): Promise<Cohort | null> {
  if (USE_MOCK_DATA) return MOCK_USER_WITH_COHORT.active_cohort;

  const supabase = createClient();
  const today = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_cohort_memberships")
    .select("cohort:cohorts(*)")
    .eq("user_id", userId);

  if (error || !data) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cohorts: Cohort[] = (data as any[])
    .map((m) => m.cohort as Cohort)
    .filter(Boolean);

  return (
    cohorts.find(
      (c) =>
        c.membership_starts_at <= today && c.membership_ends_at >= today,
    ) ??
    cohorts[cohorts.length - 1] ??
    null
  );
}

export async function getUserCohortMembership(
  userId: string,
): Promise<{ cohort_id: number; joined_at: string } | null> {
  if (USE_MOCK_DATA)
    return { cohort_id: MOCK_USER_WITH_COHORT.active_cohort?.id ?? 2, joined_at: MOCK_JOINED_AT };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_cohort_memberships")
    .select("cohort_id, joined_at")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data as { cohort_id: number; joined_at: string };
}

export async function getCohortModuleAccess(cohortId: number): Promise<CohortModuleAccess[]> {
  if (USE_MOCK_DATA) return MOCK_MODULE_ACCESS.filter((a) => a.cohort_id === cohortId);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("cohort_module_access")
    .select("*")
    .eq("cohort_id", cohortId);

  if (error) return [];
  return data ?? [];
}

export function useCurrentUserCohort(userId: string | undefined) {
  return useQuery({
    queryKey: cohortKeys.forUser(userId ?? ""),
    queryFn: () => getCurrentUserCohort(userId!),
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
  });
}

export function useUserCohortMembership(userId: string | undefined) {
  return useQuery({
    queryKey: cohortKeys.membershipForUser(userId ?? ""),
    queryFn: () => getUserCohortMembership(userId!),
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
  });
}

export function useCohortModuleAccess(cohortId: number | undefined) {
  return useQuery({
    queryKey: cohortKeys.moduleAccess(cohortId ?? 0),
    queryFn: () => getCohortModuleAccess(cohortId!),
    enabled: !!cohortId,
    staleTime: 10 * 60 * 1000,
  });
}
