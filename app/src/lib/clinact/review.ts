/**
 * ClinAct spaced review — rule FROZEN by Karina 2026-08-31 (e-mails
 * "Re: REVISÃO ESPAÇADA"). Do not tune these numbers: changing them after
 * launch reschedules every student.
 *
 *   trilha (decided by the FIRST completed attempt, §2.3 canonical):
 *     · erro com alta confiança  → review 1 at +3d,  review 2 at +14d AFTER review 1
 *     · score < 60%              → +7d,  then +21d
 *     · otherwise                → +14d, then +30d
 *   Max 2 automatic reviews; after review 2 the row is suspended forever.
 *   A voluntary "Refazer" BEFORE the due date never advances or restarts the
 *   sequence. Reviews are ordinary attempts; the canonical first attempt is
 *   the only one Minha Evolução reads.
 *
 * Storage: review_schedule with item_type='clinact_case', item_id=case id.
 * interval_days holds the CURRENT interval (identifies the trilha),
 * repetitions counts completed reviews (0..2). Dates in BR time (lib/br-date).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { addDaysKey, todayKeyBR } from "@/lib/br-date";

export const CLINACT_REVIEW_ITEM_TYPE = "clinact_case";

/** First review interval, from the first completed attempt's outcome. */
export function firstIntervalDays(highConfidenceErrors: number, score: number): number {
  if (highConfidenceErrors > 0) return 3;
  if (score < 60) return 7;
  return 14;
}

/** Second review interval, counted FROM review 1, paired to the first. */
export function secondIntervalDays(first: number): number {
  if (first === 3) return 14;
  if (first === 7) return 21;
  return 30;
}

export type FinishOutcome = {
  userId: string;
  caseId: number;
  specialtyId: number | null;
  score: number;
  highConfidenceErrors: number;
  /** True when this finish is the FIRST completed non-preview attempt. */
  isFirstCompletion: boolean;
};

/**
 * Called when a non-preview attempt finishes. Creates the schedule on the
 * first completion; on later completions, advances it ONLY if the review was
 * actually due (early voluntary redos change nothing — frozen rule).
 */
export async function onCaseFinished(o: FinishOutcome): Promise<void> {
  const admin = createAdminClient();
  const today = todayKeyBR();

  if (o.isFirstCompletion) {
    const interval = firstIntervalDays(o.highConfidenceErrors, o.score);
    const { error } = await admin.from("review_schedule").upsert(
      {
        user_id: o.userId,
        item_type: CLINACT_REVIEW_ITEM_TYPE,
        item_id: o.caseId,
        specialty_id: o.specialtyId,
        interval_days: interval,
        repetitions: 0,
        due_date: addDaysKey(today, interval),
        last_reviewed_at: new Date().toISOString(),
        suspended: false,
      },
      { onConflict: "user_id,item_type,item_id" },
    );
    if (error) console.error("clinact review schedule create failed", error);
    return;
  }

  const { data: row } = await admin
    .from("review_schedule")
    .select("id, interval_days, repetitions, due_date, suspended")
    .eq("user_id", o.userId)
    .eq("item_type", CLINACT_REVIEW_ITEM_TYPE)
    .eq("item_id", o.caseId)
    .maybeSingle();
  if (!row || row.suspended) return;
  if ((row.repetitions as number) >= 2) return;
  // Not due yet → a voluntary Refazer; the sequence does not move.
  if ((row.due_date as string) > today) return;

  const reps = (row.repetitions as number) + 1;
  const patch: Record<string, unknown> = {
    repetitions: reps,
    last_reviewed_at: new Date().toISOString(),
  };
  if (reps >= 2) {
    // After review 2: never auto-schedule this case again.
    patch.suspended = true;
  } else {
    const next = secondIntervalDays(row.interval_days as number);
    patch.interval_days = next;
    patch.due_date = addDaysKey(today, next);
  }
  const { error } = await admin.from("review_schedule").update(patch).eq("id", row.id);
  if (error) console.error("clinact review schedule advance failed", error);
}

export type DueReview = {
  case_id: number;
  due_date: string;
  repetitions: number;
};

/** "Revisões de hoje": due, not suspended, still inside the 2-review budget. */
export async function getDueClinactReviews(userId: string): Promise<DueReview[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("review_schedule")
    .select("item_id, due_date, repetitions")
    .eq("user_id", userId)
    .eq("item_type", CLINACT_REVIEW_ITEM_TYPE)
    .eq("suspended", false)
    .lt("repetitions", 2)
    .lte("due_date", todayKeyBR())
    .order("due_date", { ascending: true });
  return (data ?? []).map((r) => ({
    case_id: r.item_id as number,
    due_date: r.due_date as string,
    repetitions: r.repetitions as number,
  }));
}
