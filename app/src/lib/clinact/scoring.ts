/**
 * Scoring (§2.2, §2.2.1, §2.3) — the chain is fixed:
 *
 *   decision weight → case score (0–100) → mean of first-completed cases
 *   per format → overall
 *
 * Never a raw mean over decisions or step events. `caseScore` is the ONLY
 * place a decision becomes a number, and `aggregateCases` is the ONLY place
 * cases become a percentage. Pure functions; tested.
 */

import { QUALITY_WEIGHTS, type CaseFormat, type Quality } from "./types";

/** Weight of one chosen option: quality where authored, else 1.0 / 0.0. */
export function optionWeight(opt: { is_correct: boolean; quality?: Quality | null }): number {
  if (opt.quality && opt.quality in QUALITY_WEIGHTS) return QUALITY_WEIGHTS[opt.quality];
  return opt.is_correct ? 1 : 0;
}

/**
 * Ordering step: fraction of items in their correct slot. Binary at the event
 * level (`is_correct` = all in place), graded for the weight so a near-miss
 * is not scored like a blank.
 */
export function orderWeight(submitted: number[], correct: number[]): { weight: number; is_correct: boolean } {
  if (!correct.length || submitted.length !== correct.length) return { weight: 0, is_correct: false };
  let hits = 0;
  for (let i = 0; i < correct.length; i++) if (submitted[i] === correct[i]) hits++;
  return { weight: hits / correct.length, is_correct: hits === correct.length };
}

/** Case score, 0–100, from the weights actually earned in one attempt. */
export function caseScore(weights: number[]): number {
  if (!weights.length) return 0;
  const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
  return Math.round(mean * 10000) / 100;
}

export type ScoredCase = { case_id: number; format: CaseFormat; score: number };

/**
 * Minha Evolução aggregation. Input must already be ONE row per case (the
 * first completed attempt — §2.3); this function refuses to see events.
 */
export function aggregateCases(cases: ScoredCase[]): {
  overall: number | null;
  count: number;
  byFormat: Partial<Record<CaseFormat, { count: number; mean: number }>>;
} {
  const byFormat: Partial<Record<CaseFormat, { count: number; mean: number }>> = {};
  const buckets = new Map<CaseFormat, number[]>();
  for (const c of cases) {
    const arr = buckets.get(c.format) ?? [];
    arr.push(c.score);
    buckets.set(c.format, arr);
  }
  for (const [format, scores] of buckets) {
    byFormat[format] = {
      count: scores.length,
      mean: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
    };
  }
  const overall = cases.length
    ? Math.round((cases.reduce((a, c) => a + c.score, 0) / cases.length) * 100) / 100
    : null;
  return { overall, count: cases.length, byFormat };
}
