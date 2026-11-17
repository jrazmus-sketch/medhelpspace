/**
 * Meu Plano — mini simulados (Karina 2026-11-17, second round).
 *
 * PURE module (no server imports): the engine, the player's resume and the tests
 * share it.
 *
 *   - The plan RESERVES the time and the frequency; the student picks which
 *     simulado to take in the library and stays free to take more.
 *   - Frequency: "auto" (the settings' sessions per week, spaced so they take at
 *     most `simuladoMaxWeeklyShare` of the week) or 1 / 2 a week chosen by the
 *     student — then the 25% reference does not apply, but a load bigger than the
 *     whole week is never presented as viable.
 *   - A mini simulado left half-way is CONTINUED: `runProgress` says where a run
 *     stands, from the answers themselves. A run is every answer since
 *     `quiz_runs.started_at` (no row = the whole history); "Recomeçar" only moves
 *     that mark forward, so earlier attempts are never deleted.
 */

import { diffDaysKey, toDateKeyBR } from "@/lib/br-date";
import type { PlanSettings } from "./settings";

export type SimuladoFrequency = "auto" | 1 | 2;
export const SIMULADO_FREQUENCIES: readonly SimuladoFrequency[] = ["auto", 1, 2];

/** Database value (study_plans.simulados_per_week: NULL | 1 | 2) → frequency. */
export function frequencyFromColumn(v: unknown): SimuladoFrequency {
  return v === 1 || v === 2 ? v : "auto";
}
export function frequencyToColumn(f: SimuladoFrequency): number | null {
  return f === "auto" ? null : f;
}
export function isSimuladoFrequency(v: unknown): v is SimuladoFrequency {
  return v === "auto" || v === 1 || v === 2;
}

export type SimuladoPage = {
  pageId: number;
  slug: string;
  title: string;
  /** 'geral' for the cross-specialty ones. */
  specialtySlug: string;
  /** A regular mini simulado (false = a MedHelp 60D Simulado 100Q, never scheduled here). */
  isMini: boolean;
  questionIds: number[];
};

export type SimuladoCatalog = {
  pages: Map<number, SimuladoPage>;
  /** page → ISO start of the student's current run (absent = the whole history). */
  runStarts: Map<number, string>;
};

export type AttemptLike = { page_id: number; question_id?: number | null; created_at: string; is_correct?: boolean };

/** A mini simulado the plan asks to finish goes stale after this many days without an answer. */
export const IN_PROGRESS_STALE_DAYS = 7;

export type SimuladoInProgress = {
  pageId: number;
  slug: string;
  title: string;
  specialtySlug: string;
  answered: number;
  total: number;
  remaining: number;
  /** The run was begun in an earlier week than today's. */
  carried: boolean;
};

export type SimuladoFacts = {
  /** The mini simulado the student is in the middle of (the most recently answered one). */
  inProgress: SimuladoInProgress | null;
  /** Simulado pages with at least one answer today. */
  touchedToday: number;
};

/**
 * Where a run stands: the latest answer to each of the page's CURRENT questions
 * since the run began. Answers to questions no longer on the page are ignored.
 */
export function runProgress(
  attempts: AttemptLike[],
  questionIds: number[],
  runStartIso: string | null | undefined,
): { results: Map<number, boolean>; firstAt: number | null; lastAt: number | null } {
  const onPage = new Set(questionIds);
  const startMs = runStartIso ? Date.parse(runStartIso) : -Infinity;
  const results = new Map<number, boolean>();
  const seenAt = new Map<number, number>();
  let firstAt: number | null = null;
  let lastAt: number | null = null;
  for (const a of attempts) {
    const q = a.question_id;
    if (q == null || !onPage.has(q)) continue;
    const at = Date.parse(a.created_at);
    if (!(at >= startMs)) continue;
    if (firstAt == null || at < firstAt) firstAt = at;
    if (lastAt == null || at > lastAt) lastAt = at;
    // Latest attempt wins (ties: the later row in the list).
    if (at >= (seenAt.get(q) ?? -Infinity)) {
      seenAt.set(q, at);
      results.set(q, a.is_correct === true);
    }
  }
  return { results, firstAt, lastAt };
}

/** What the student's answers say about simulados today. */
export function simuladoFacts(
  attempts: AttemptLike[],
  catalog: SimuladoCatalog | null | undefined,
  todayKey: string,
  weekStartKey: string,
): SimuladoFacts {
  if (!catalog || catalog.pages.size === 0) return { inProgress: null, touchedToday: 0 };
  const byPage = new Map<number, AttemptLike[]>();
  for (const a of attempts) {
    if (!catalog.pages.has(a.page_id)) continue;
    const list = byPage.get(a.page_id);
    if (list) list.push(a);
    else byPage.set(a.page_id, [a]);
  }
  let touchedToday = 0;
  let best: { p: SimuladoInProgress; lastAt: number } | null = null;
  for (const [pageId, list] of byPage) {
    if (list.some((a) => toDateKeyBR(a.created_at) === todayKey)) touchedToday++;
    const page = catalog.pages.get(pageId)!;
    if (!page.isMini || page.questionIds.length === 0) continue;
    const run = runProgress(list, page.questionIds, catalog.runStarts.get(pageId));
    const answered = run.results.size;
    const total = page.questionIds.length;
    if (answered === 0 || answered >= total || run.firstAt == null || run.lastAt == null) continue;
    const lastKey = toDateKeyBR(new Date(run.lastAt).toISOString());
    if (diffDaysKey(lastKey, todayKey) > IN_PROGRESS_STALE_DAYS) continue;
    if (best && best.lastAt >= run.lastAt) continue;
    best = {
      lastAt: run.lastAt,
      p: {
        pageId, slug: page.slug, title: page.title, specialtySlug: page.specialtySlug,
        answered, total, remaining: total - answered,
        carried: toDateKeyBR(new Date(run.firstAt).toISOString()) < weekStartKey,
      },
    };
  }
  return { inProgress: best?.p ?? null, touchedToday };
}

export type SimuladoCadence = {
  frequency: SimuladoFrequency;
  /** Sessions in a simulado week, and a simulado week every N weeks (1 = every week). */
  sessionsPerWeek: number;
  everyWeeks: number;
  /** Average minutes of mini simulado per week at this cadence. */
  weeklyMinutes: number;
  /**
   * false → the sessions alone take more than the whole week's study time.
   * Splitting a session between days does not fix a load bigger than the time
   * there is, so such a choice is never offered as viable.
   */
  feasible: boolean;
};

/** The cadence a frequency means for THIS student (session length and weekly time). */
export function simuladoCadence(
  frequency: SimuladoFrequency,
  settings: PlanSettings,
  sessionMinutes: number,
  weeklyStudyMinutes: number,
): SimuladoCadence {
  if (frequency === "auto") {
    const sessionsPerWeek = Math.max(0, settings.simuladoDaysPerWeek);
    // At most `simuladoMaxWeeklyShare` of the week: with little time, a simulado
    // week comes every 2, 3… weeks instead of every week.
    const everyWeeks = weeklyStudyMinutes > 0 && sessionsPerWeek > 0
      ? Math.max(1, Math.ceil((sessionMinutes * sessionsPerWeek) / (settings.simuladoMaxWeeklyShare * weeklyStudyMinutes)))
      : 1;
    return {
      frequency, sessionsPerWeek, everyWeeks,
      weeklyMinutes: (sessionMinutes * sessionsPerWeek) / everyWeeks,
      feasible: true,
    };
  }
  const weeklyMinutes = sessionMinutes * frequency;
  return {
    frequency, sessionsPerWeek: frequency, everyWeeks: 1, weeklyMinutes,
    feasible: weeklyStudyMinutes > 0 && weeklyMinutes <= weeklyStudyMinutes + 0.01,
  };
}
