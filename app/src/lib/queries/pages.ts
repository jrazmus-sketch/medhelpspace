import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { USE_MOCK_DATA, MOCK_PAGES } from "@/lib/mock-data";
import type { Page, PageView, PageStatus } from "@/types/supabase";

export const pageKeys = {
  bySpecialty: (specialtyId: number, options?: PageQueryOptions) =>
    ["pages", "specialty", specialtyId, options] as const,
  bySlug: (slug: string) => ["page", slug] as const,
};

export interface PageQueryOptions {
  view?: PageView;
  status?: PageStatus;
}

export async function getPagesBySpecialty(
  specialtyId: number,
  options?: PageQueryOptions,
): Promise<Page[]> {
  if (USE_MOCK_DATA) {
    return MOCK_PAGES.filter((p) => {
      if (p.specialty_id !== specialtyId) return false;
      if (options?.view && p.view !== options.view) return false;
      if (options?.status && p.status !== options.status) return false;
      return true;
    });
  }

  const supabase = createClient();
  let query = supabase.from("pages").select("*").eq("specialty_id", specialtyId);

  if (options?.view) query = query.eq("view", options.view);
  if (options?.status) query = query.eq("status", options.status);

  const { data, error } = await query.order("title");
  if (error) throw error;
  return data ?? [];
}

export async function getHubPagesForSpecialty(specialtyId: number): Promise<Page[]> {
  if (USE_MOCK_DATA)
    return MOCK_PAGES.filter(
      (p) => p.specialty_id === specialtyId && p.type === "blurb-nav-hub",
    );

  const supabase = createClient();
  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .eq("specialty_id", specialtyId)
    .eq("status", "publish")
    .eq("type", "blurb-nav-hub");

  if (error) throw error;
  return data ?? [];
}

export function useHubPagesForSpecialty(specialtyId: number | undefined) {
  return useQuery({
    queryKey: ["hub-pages", specialtyId],
    queryFn: () => getHubPagesForSpecialty(specialtyId!),
    enabled: !!specialtyId,
    staleTime: 5 * 60 * 1000,
  });
}

export async function getPageBySlug(slug: string): Promise<Page | null> {
  if (USE_MOCK_DATA) return MOCK_PAGES.find((p) => p.slug === slug) ?? null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) return null;
  return data;
}

export function usePagesBySpecialty(
  specialtyId: number | undefined,
  options?: PageQueryOptions,
) {
  return useQuery({
    queryKey: pageKeys.bySpecialty(specialtyId ?? 0, options),
    queryFn: () => getPagesBySpecialty(specialtyId!, options),
    enabled: !!specialtyId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePageBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: pageKeys.bySlug(slug ?? ""),
    queryFn: () => getPageBySlug(slug!),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
}
