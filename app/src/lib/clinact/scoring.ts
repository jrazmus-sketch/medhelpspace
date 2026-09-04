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
/**
 * The investigation block's weight, approved by Karina 2026-09-03:
 *
 *   nota = Σ quality(chosen) ÷ ( nº of ideal options + nº chosen beyond them )
 *
 * It has to punish two different mistakes at once, which a plain average of
 * what was ordered does not:
 *
 *   · focused and complete   → 1.0
 *   · missed an essential    → numerator falls short, denominator does not
 *   · ordered everything     → denominator grows with each extra
 *   · ordered something harmful → adds 0 AND still grows the denominator
 *
 * HER EDITORIAL RULE, which this formula makes load-bearing: inside an
 * investigation block, two options must not both be marked `ideal` when they
 * are substitutes for each other — the denominator would then demand both to
 * reach 1.0. "A or B" relationships are deliberately deferred, not supported.
 *
 * `is_correct` is NOT a fallback here (unlike optionWeight): an investigation
 * option without an explicit quality is treated as neutral-useless (0.2 via the
 * publish validation requiring quality), so a case cannot accidentally score
 * full marks on unlabelled options.
 */
export function selectionWeight(
  options: { id?: number; position: number; quality?: Quality | null }[],
  selectedIds: number[],
): { weight: number; is_correct: boolean } {
  const chosen = new Set(selectedIds);
  const key = (o: { id?: number; position: number }) => o.id ?? o.position;

  const ideals = options.filter((o) => o.quality === "ideal");
  const picked = options.filter((o) => chosen.has(key(o)));
  const extras = picked.filter((o) => o.quality !== "ideal");

  const denominator = ideals.length + extras.length;
  // No ideal options authored and nothing ordered: nothing to measure.
  if (denominator === 0) return { weight: 0, is_correct: false };

  const earned = picked.reduce((sum, o) => sum + (o.quality ? QUALITY_WEIGHTS[o.quality] : 0), 0);
  const weight = Math.min(earned / denominator, 1);

  // "Correct" means the ideal investigation, exactly: every ideal one ordered
  // and nothing else. Used for the marker, never for the score.
  const pickedIdeals = picked.filter((o) => o.quality === "ideal").length;
  const is_correct = ideals.length > 0 && pickedIdeals === ideals.length && extras.length === 0;

  return { weight: Math.round(weight * 100) / 100, is_correct };
}

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
