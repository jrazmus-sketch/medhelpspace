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

// ── Fórmula MedHelp re-reads (Karina 2026-11-19, 20h21 BRT) ─────────────────────────────────────────────────────
// Same ladder (3 → 7 → 14 → 30), but a step is NEVER moved to the eve of the exam: "Não antecipe essas releituras
// automaticamente para a véspera. Se o próximo intervalo cair depois da prova, não programe essa próxima releitura."
// (so several re-reads do not pile up on the last day). The row keeps the plain step as its date — history and the
// student's choice are untouched — and a re-read is OFFERED only while the student has an exam ahead: a step that
// falls on or after the exam day never comes up before it, and after it only if the student is preparing for a new
// exam (e.g. moved to the next turma). MemoreCards keep memorecardRereadDue above (unchanged).

/** The next Fórmula re-read: the plain ladder step, never moved. */
export function formulaRereadNext(reps: number, today: string): { interval: number; due: string } {
  const step = MEMORECARD_REREAD_INTERVALS[Math.min(Math.max(reps, 0), MEMORECARD_REREAD_INTERVALS.length - 1)];
  return { interval: step, due: addDaysKey(today, step) };
}

/**
 * Whether a Fórmula re-read with this date is offered today. `examAhead` = the student's nearest exam date AFTER
 * today (null = none). Due today or earlier, and an exam still ahead — so a date on/after the exam day, which can
 * only arrive once that exam is no longer ahead, is never offered.
 */
export function formulaRereadOffered(due: string, today: string, examAhead: string | null): boolean {
  return due <= today && examAhead != null && examAhead > today;
}
