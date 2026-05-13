import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import type { FlashcardItem } from "@/types/supabase";

export const flashcardKeys = {
  forPage: (pageId: number) => ["flashcards", pageId] as const,
};

export async function getFlashcardsForPage(pageId: number): Promise<FlashcardItem[]> {
  if (USE_MOCK_DATA) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("flashcard_items")
    .select("*")
    .eq("page_id", pageId)
    .order("group_position")
    .order("position");

  if (error) throw error;
  return data ?? [];
}

export function useFlashcardsForPage(pageId: number | undefined) {
  return useQuery({
    queryKey: flashcardKeys.forPage(pageId ?? 0),
    queryFn: () => getFlashcardsForPage(pageId!),
    enabled: !!pageId,
    staleTime: 10 * 60 * 1000,
  });
}
