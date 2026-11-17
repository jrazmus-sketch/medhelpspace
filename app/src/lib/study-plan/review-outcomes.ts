/**
 * Meu Plano — what the Revisão already knows about a question (Karina 2026-11-17).
 *
 * Every answered question is enrolled in `review_schedule`, and a question the
 * student gets wrong comes back there. But an answer given INSIDE a Revisão
 * session updates only that schedule — it writes no `quiz_attempts` row. Left
 * alone, a topic answered below 70% could never recover through the Revisão: the
 * plan would keep asking for the same questions the Revisão is already bringing
 * back (a duplicate), and the topic would stay "abaixo de 70%" forever.
 *
 * PURE module. `withReviewOutcomes` adds, for each question whose LAST grading
 * happened in the Revisão, one synthetic attempt carrying that verdict, so the
 * mastery check (latest attempt wins) sees it. SM-2 keeps `repetitions >= 1`
 * exactly when the last grading was right (lib/review/sm2.ts).
 *
 * Use the result ONLY for mastery/progress. Today's counts, the pace and the
 * specialty accuracy keep using the real attempts.
 */

export type QuestionReviewRow = {
  /** quiz_questions.id */
  item_id: number;
  repetitions: number;
  last_reviewed_at: string | null;
  suspended: boolean;
};

type AttemptLike = { question_id?: number | null; is_correct: boolean; created_at: string };

/**
 * Answering a question in the normal player also grades it in the schedule a
 * moment later, so a review counts as "later than the attempt" only past this gap.
 */
const SAME_ANSWER_MS = 2 * 60 * 1000;

export function withReviewOutcomes<T extends AttemptLike>(attempts: T[], rows: QuestionReviewRow[] | null | undefined): T[] {
  if (!rows || rows.length === 0) return attempts;
  const latest = new Map<number, T>();
  for (const a of attempts) {
    if (a.question_id == null) continue;
    const prev = latest.get(Number(a.question_id));
    if (!prev || a.created_at >= prev.created_at) latest.set(Number(a.question_id), a);
  }
  const extra: T[] = [];
  for (const r of rows) {
    if (!r.last_reviewed_at) continue;
    const last = latest.get(Number(r.item_id));
    if (!last) continue; // never answered in the player: nothing to correct
    const reviewedAt = Date.parse(r.last_reviewed_at);
    const answeredAt = Date.parse(last.created_at);
    if (!Number.isFinite(reviewedAt) || !Number.isFinite(answeredAt)) continue;
    if (reviewedAt - answeredAt <= SAME_ANSWER_MS) continue;
    const verdict = r.repetitions >= 1;
    if (verdict === last.is_correct) continue; // same verdict: nothing changes
    extra.push({ ...last, is_correct: verdict, created_at: new Date(reviewedAt).toISOString() });
  }
  return extra.length === 0 ? attempts : attempts.concat(extra);
}

/** Questions the Revisão is currently bringing back (scheduled and not suspended). */
export function questionsInReview(rows: QuestionReviewRow[] | null | undefined): Set<number> | null {
  if (!rows) return null;
  return new Set(rows.filter((r) => !r.suspended).map((r) => Number(r.item_id)));
}
