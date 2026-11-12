import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildTopicQuestionIndex, type TopicQuestionIndex, type TopicQuestionLink } from "./topic-questions";

/**
 * Every published Questões record of every topic (topic_question_links view, R1),
 * paged past PostgREST's 1000-row cap (≈1,130 rows today and growing with each
 * import). Returns null when the view is unavailable (patch not applied) — callers
 * then keep the section-based behaviour, so the plan never breaks.
 */
export async function loadTopicQuestionIndex(
  admin: ReturnType<typeof createAdminClient> = createAdminClient(),
): Promise<TopicQuestionIndex | null> {
  const SIZE = 1000;
  const rows: TopicQuestionLink[] = [];
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await admin
      .from("topic_question_links")
      .select("topic_id, exam_question_id, question_id, page_id, is_primary")
      .order("question_id")
      .order("topic_id")
      .range(from, from + SIZE - 1);
    if (error) return null;
    const batch = (data ?? []) as TopicQuestionLink[];
    rows.push(...batch);
    if (batch.length < SIZE) break;
  }
  if (rows.length === 0) return null;
  return buildTopicQuestionIndex(rows);
}
