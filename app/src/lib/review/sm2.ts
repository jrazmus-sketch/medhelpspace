/**
 * Pure SM-2 spaced-repetition step (binary correct/incorrect input).
 *
 * Shared by every review item type via `gradeReviewItem`. Kept as a plain
 * (non-"use server") helper so it can be imported into server actions AND unit
 * tested without a DB. Mirrors the original flashcard algorithm exactly:
 *
 *   Correct   → repetitions++; interval 1 → 6 → round(prev × ease); ease unchanged
 *   Incorrect → repetitions = 0; interval = 1; ease -= 0.20 (floor 1.3); lapses++
 */
export type ReviewResult = "correct" | "incorrect";

export interface Sm2State {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
}

export const SM2_DEFAULTS: Sm2State = {
  ease_factor: 2.5,
  interval_days: 1,
  repetitions: 0,
  lapses: 0,
};

export function nextSm2(prev: Sm2State, result: ReviewResult): Sm2State {
  let ease = prev.ease_factor;
  let interval: number;
  let repetitions: number;
  let lapses = prev.lapses;

  if (result === "correct") {
    repetitions = prev.repetitions + 1;
    interval =
      repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(prev.interval_days * ease);
  } else {
    repetitions = 0;
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
    lapses = prev.lapses + 1;
  }

  return { ease_factor: ease, interval_days: interval, repetitions, lapses };
}

/** Days from today → an ISO `YYYY-MM-DD` due date. */
export function dueDateAfter(intervalDays: number): string {
  const due = new Date();
  due.setDate(due.getDate() + intervalDays);
  return due.toISOString().split("T")[0];
}
