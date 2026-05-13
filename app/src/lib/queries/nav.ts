import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { USE_MOCK_DATA, MOCK_NAV_ITEMS } from "@/lib/mock-data";
import type { NavItem, NavItemWithSlug } from "@/types/supabase";

export const navKeys = {
  forPage: (pageId: number) => ["nav-items", pageId] as const,
  withSlugsForPages: (pageIds: number[]) =>
    ["nav-items-with-slugs", [...pageIds].sort()] as const,
};

export async function getNavItemsForPage(pageId: number): Promise<NavItem[]> {
  if (USE_MOCK_DATA) {
    return MOCK_NAV_ITEMS.filter((n) => n.source_page_id === pageId);
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("nav_items")
    .select("*")
    .eq("source_page_id", pageId)
    .order("position");

  if (error) throw error;
  return data ?? [];
}

export async function getNavItemsWithSlugsForPages(
  pageIds: number[],
): Promise<NavItemWithSlug[]> {
  if (USE_MOCK_DATA) {
    return MOCK_NAV_ITEMS.filter((n) => pageIds.includes(n.source_page_id)).map(
      (n) => ({ ...n, target_slug: null, target_view: null, target_track_id: null }),
    );
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("nav_items")
    .select(
      "*, target_page:pages!target_page_id(id, slug, view, track_id)",
    )
    .in("source_page_id", pageIds)
    .not("target_page_id", "is", null)
    .order("position");

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((item: any) => ({
    id: item.id,
    source_page_id: item.source_page_id,
    target_page_id: item.target_page_id,
    position: item.position,
    label: item.label,
    icon: item.icon,
    group_label: item.group_label,
    layout: item.layout,
    target_slug: item.target_page?.slug ?? null,
    target_view: item.target_page?.view ?? null,
    target_track_id: item.target_page?.track_id ?? null,
  }));
}

export function useNavItemsForPage(pageId: number | undefined) {
  return useQuery({
    queryKey: navKeys.forPage(pageId ?? 0),
    queryFn: () => getNavItemsForPage(pageId!),
    enabled: !!pageId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useNavItemsWithSlugsForPages(pageIds: number[]) {
  return useQuery({
    queryKey: navKeys.withSlugsForPages(pageIds),
    queryFn: () => getNavItemsWithSlugsForPages(pageIds),
    enabled: pageIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
