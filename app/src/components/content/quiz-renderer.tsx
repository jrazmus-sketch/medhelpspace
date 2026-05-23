import { createAdminClient } from "@/lib/supabase/admin";
import { getPageSiblings } from "@/lib/page-siblings";
import { QuizPlayer } from "./quiz-player";

export interface QuizQuestionData {
  id: number;
  position: number;
  question: string;
  answers: { text: string; correct: boolean; feedback: string }[];
  media_url: string | null;
  explanation_html: string | null;
}

export async function QuizRenderer({ pageId }: { pageId: number }) {
  const admin = createAdminClient();
  const [{ data: questions }, { data: page }, siblings] = await Promise.all([
    admin
      .from("quiz_questions")
      .select("id, position, question, answers, media_url, explanation_html")
      .eq("page_id", pageId)
      .order("position"),
    admin
      .from("pages")
      .select("specialty_id")
      .eq("id", pageId)
      .single(),
    getPageSiblings(pageId),
  ]);

  if (!questions || questions.length === 0) {
    return <p className="text-muted-foreground text-sm">Conteúdo em preparação.</p>;
  }

  return (
    <QuizPlayer
      questions={questions as QuizQuestionData[]}
      pageId={pageId}
      specialtyId={page?.specialty_id ?? null}
      nextQuizHref={siblings.nextHref}
      nextQuizTitle={siblings.nextTitle}
      specialtyHref={siblings.specialtyHref}
      specialtyName={siblings.specialtyName}
    />
  );
}
