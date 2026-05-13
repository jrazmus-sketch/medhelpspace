import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import type { QuizQuestion } from "@/types/supabase";

export const quizKeys = {
  forPage: (pageId: number) => ["quiz-questions", pageId] as const,
};

export async function getQuizQuestionsForPage(pageId: number): Promise<QuizQuestion[]> {
  if (USE_MOCK_DATA) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("quiz_questions")
    .select("*")
    .eq("page_id", pageId)
    .order("position");

  if (error) throw error;
  return data ?? [];
}

export function useQuizQuestionsForPage(pageId: number | undefined) {
  return useQuery({
    queryKey: quizKeys.forPage(pageId ?? 0),
    queryFn: () => getQuizQuestionsForPage(pageId!),
    enabled: !!pageId,
    staleTime: 10 * 60 * 1000,
  });
}
