import { createAdminClient } from "@/lib/supabase/admin";
import { QuizPlayer } from "./quiz-player";

export interface QuizQuestionData {
  id: number;
  position: number;
  question: string;
  answers: { text: string; correct: boolean; feedback: string }[];
  media_url: string | null;
}

export async function QuizRenderer({ pageId }: { pageId: number }) {
  const admin = createAdminClient();
  const [{ data: questions }, { data: page }] = await Promise.all([
    admin
      .from("quiz_questions")
      .select("id, position, question, answers, media_url")
      .eq("page_id", pageId)
      .order("position"),
    admin
      .from("pages")
      .select("specialty_id")
      .eq("id", pageId)
      .single(),
  ]);

  if (!questions || questions.length === 0) {
    return <p className="text-muted-foreground text-sm">Conteúdo em preparação.</p>;
  }

  return (
    <QuizPlayer
      questions={questions as QuizQuestionData[]}
      pageId={pageId}
      specialtyId={page?.specialty_id ?? null}
    />
  );
}
