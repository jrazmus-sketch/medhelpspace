import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { USE_MOCK_DATA, MOCK_SPECIALTIES } from "@/lib/mock-data";
import type { Specialty } from "@/types/supabase";

export const specialtyKeys = {
  all: ["specialties"] as const,
  bySlug: (slug: string) => ["specialty", slug] as const,
};

export async function getSpecialties(): Promise<Specialty[]> {
  if (USE_MOCK_DATA) return MOCK_SPECIALTIES;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("specialties")
    .select("*")
    .order("display_order");

  if (error) throw error;
  return data ?? [];
}

export function useSpecialties() {
  return useQuery({
    queryKey: specialtyKeys.all,
    queryFn: getSpecialties,
    staleTime: 60 * 60 * 1000,
  });
}
