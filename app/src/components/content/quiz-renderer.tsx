import Link from "next/link";
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
  /**
   * The section the record lives in, when it differs from the page being viewed
   * (a topic view gathers its questions from every section — R1). The attempt is
   * recorded against the record's OWN section and specialty.
   */
  page_id?: number;
  specialty_id?: number | null;
}

type TopicQuestions = {
  topic: { id: number; name: string };
  questions: QuizQuestionData[];
};

/**
 * R1: the questions of ONE Meu Plano topic (`?tema=<topic slug>`), wherever they are
 * filed. One record per original question — the copy in the section being viewed
 * when there is one — in exam order (edition, then number). Null when the topic is
 * unknown or has no published questions: the page then shows the whole section.
 */
async function loadTopicQuestions(pageId: number, temaSlug: string): Promise<TopicQuestions | null> {
  const admin = createAdminClient();
  const { data: topic } = await admin.from("topics").select("id, name").eq("slug", temaSlug).maybeSingle();
  if (!topic) return null;
  const { data: links } = await admin
    .from("topic_question_links")
    .select("exam_question_id, question_id, page_id, edition, number")
    .eq("topic_id", topic.id)
    .limit(1000);
  if (!links || links.length === 0) return null;

  // One copy per original: the one on this page, else the lowest record id.
  const chosen = new Map<number, { question_id: number; page_id: number; edition: string; number: number }>();
  for (const l of links) {
    const origin = Number(l.exam_question_id);
    const cand = { question_id: Number(l.question_id), page_id: Number(l.page_id), edition: String(l.edition), number: Number(l.number) };
    const cur = chosen.get(origin);
    const better =
      !cur ||
      (cand.page_id === pageId && cur.page_id !== pageId) ||
      (cand.page_id !== pageId && cur.page_id !== pageId && cand.question_id < cur.question_id);
    if (better) chosen.set(origin, cand);
  }
  const picks = [...chosen.values()];
  const sectionIds = [...new Set(picks.map((p) => p.page_id))];
  const [{ data: rows }, { data: sections }] = await Promise.all([
    admin
      .from("quiz_questions")
      .select("id, position, question, answers, media_url, explanation_html, page_id")
      .in("id", picks.map((p) => p.question_id)),
    admin.from("pages").select("id, specialty_id").in("id", sectionIds),
  ]);
  const specOf = new Map((sections ?? []).map((s) => [Number(s.id), (s.specialty_id as number | null) ?? null]));
  const rank = (ed: string) => {
    const [y, s] = ed.split(".");
    return Number(y) * 10 + Number(s ?? 0);
  };
  const order = new Map(picks.map((p) => [p.question_id, rank(p.edition) * 1000 + p.number]));
  const questions = ((rows ?? []) as (QuizQuestionData & { page_id: number })[])
    .map((q) => ({ ...q, page_id: Number(q.page_id), specialty_id: specOf.get(Number(q.page_id)) ?? null }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  if (questions.length === 0) return null;
  return { topic: { id: Number(topic.id), name: topic.name as string }, questions };
}

export async function QuizRenderer({
  pageId,
  tema,
  sectionHref,
}: {
  pageId: number;
  /** R1: a Meu Plano topic slug — show only that topic's questions. */
  tema?: string;
  /** The section's own address (no `?tema=`), for "ver todas as questões". */
  sectionHref?: string;
}) {
  const admin = createAdminClient();
  const [{ data: questions }, { data: page }, siblings, topicView] = await Promise.all([
    admin
      .from("quiz_questions")
      .select("id, position, question, answers, media_url, explanation_html")
      .eq("page_id", pageId)
      .order("position"),
    admin
      .from("pages")
      .select("specialty_id, title")
      .eq("id", pageId)
      .single(),
    getPageSiblings(pageId),
    tema ? loadTopicQuestions(pageId, tema) : Promise.resolve(null),
  ]);

  const shown = topicView?.questions ?? (questions as QuizQuestionData[] | null);
  if (!shown || shown.length === 0) {
    return <p className="text-muted-foreground text-sm">Conteúdo em preparação.</p>;
  }
  const sectionCount = questions?.length ?? 0;

  return (
    <>
      {topicView && (
        <div className="mb-6 max-w-2xl rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">Tema do Meu Plano: {topicView.topic.name}</p>
          <p className="mt-0.5 text-muted-foreground">
            {topicView.questions.length === 1 ? "1 questão deste tema" : `${topicView.questions.length} questões deste tema`}
          </p>
          {sectionHref && sectionCount > 0 && (
            <Link
              href={sectionHref}
              className="mt-1 inline-flex min-h-11 items-center text-brand-text underline-offset-4 hover:underline"
            >
              Ver todas as {sectionCount} questões de {page?.title ?? "esta seção"}
            </Link>
          )}
        </div>
      )}
      <QuizPlayer
        // Remount when switching between the topic view and the whole section.
        key={topicView ? `tema-${topicView.topic.id}` : "secao"}
        questions={shown}
        pageId={pageId}
        specialtyId={page?.specialty_id ?? null}
        nextQuizHref={siblings.nextHref}
        nextQuizTitle={siblings.nextTitle}
        specialtyHref={siblings.specialtyHref}
        specialtyName={siblings.specialtyName}
      />
    </>
  );
}
