import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { USE_MOCK_DATA, MOCK_LESSONS } from "@/lib/mock-data";
import type { Lesson } from "@/types/supabase";

export const lessonKeys = {
  forPage: (pageId: number) => ["lessons", pageId] as const,
};

export async function getLessonsForPage(pageId: number): Promise<Lesson[]> {
  if (USE_MOCK_DATA) return MOCK_LESSONS.filter((l) => l.page_id === pageId);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .eq("page_id", pageId)
    .order("position");

  if (error) throw error;
  return data ?? [];
}

export function useLessonsForPage(pageId: number | undefined) {
  return useQuery({
    queryKey: lessonKeys.forPage(pageId ?? 0),
    queryFn: () => getLessonsForPage(pageId!),
    enabled: !!pageId,
    staleTime: 5 * 60 * 1000,
  });
}
