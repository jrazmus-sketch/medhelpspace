"use server";

import { gradeReviewItem } from "@/actions/review";

/**
 * Flashcard SM-2 update — kept for back-compat with the existing flashcard
 * player call site. Now delegates to the unified `gradeReviewItem`, which
 * writes `review_schedule` (the new single source of truth shared by the
 * Revisão feature). The legacy `flashcard_progress` table was backfilled into
 * `review_schedule` and is no longer written to.
 */
export async function updateFlashcardSM2(
  flashcardItemId: number,
  result: "correct" | "incorrect",
): Promise<void> {
  await gradeReviewItem("flashcard", flashcardItemId, result);
}
