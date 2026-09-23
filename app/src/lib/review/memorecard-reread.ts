import { addDaysKey, diffDaysKey } from "@/lib/br-date";

// Re-read cadence for MemoreCards (Karina, 2026-09-23). They live in MedHelp 60D,
// which opens only 60 days before the exam, so the cadence must fit inside that
// window: re-reads land on days 3, 10, 24 and 54 after the first reading. The old
// 7/21/60/120 gave a student one re-read, maybe two, before the exam.
//
// Passive content — nothing is graded. A theme resurfaces on this expanding
// schedule, indexed by how many times it has been read.
export const MEMORECARD_REREAD_INTERVALS = [3, 7, 14, 30] as const;

/**
 * When the next re-read of a theme is due.
 *
 * `reps` = how many times it has been read before this reading. The step is
 * never scheduled AFTER the exam: if it would land on or past `examDate`, it moves
 * to the day before the exam — a last look, not a reminder nobody needs. When the
 * exam is tomorrow or already past, the plain step is kept (nothing to protect).
 */
export function memorecardRereadDue(
  reps: number,
  today: string,
  examDate: string | null,
): { interval: number; due: string } {
  const step = MEMORECARD_REREAD_INTERVALS[Math.min(Math.max(reps, 0), MEMORECARD_REREAD_INTERVALS.length - 1)];
  const due = addDaysKey(today, step);
  if (!examDate) return { interval: step, due };
  const lastDay = addDaysKey(examDate, -1);
  if (lastDay <= today || due <= lastDay) return { interval: step, due };
  return { interval: diffDaysKey(today, lastDay), due: lastDay };
}
