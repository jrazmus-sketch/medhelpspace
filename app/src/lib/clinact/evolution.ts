/**
 * Minha Evolução — simple version, in the pilot (spec §5; Karina 2026-08-31
 * reaffirmed it ships before the commercial opening).
 *
 * Every number derives live from what is already written from case 1:
 * `clinact_attempts` + `clinact_step_events` + `clinact_cases.format`.
 * Aggregation is per CASE, never per event (§2.2.1): the canonical attempt
 * (first completed, non-preview — §2.3) is scored, then cases are averaged.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getCanonicalAttempts } from "./queries";
import { aggregateCases, type ScoredCase } from "./scoring";
import { type CaseFormat, type Confidence } from "./types";

export type EvolutionCase = {
  case_id: number;
  slug: string;
  title: string;
  format: CaseFormat;
  score: number;
  case_revision: number;
  finished_at: string;
  highConfidenceErrors: number;
};

export type Evolution = {
  /** Cases completed (first completed attempt each — repeats never move this). */
  completed: number;
  /** Mean of case scores, 0–100 (null before the first completed case). */
  overall: number | null;
  byFormat: Partial<Record<CaseFormat, { count: number; mean: number }>>;
  /** Confidence declared on decisions of canonical attempts. */
  confidence: Record<Confidence, number>;
  /** is_correct = false AND confidence = 'alta' — the number that matters most. */
  highConfidenceErrors: number;
  cases: EvolutionCase[];
};

export async function getEvolution(userId: string): Promise<Evolution> {
  const admin = createAdminClient();
  const canonical = await getCanonicalAttempts(userId);
  const attempts = [...canonical.values()];

  const empty: Evolution = {
    completed: 0,
    overall: null,
    byFormat: {},
    confidence: { baixa: 0, media: 0, alta: 0 },
    highConfidenceErrors: 0,
    cases: [],
  };
  if (!attempts.length) return empty;

  const caseIds = attempts.map((a) => a.case_id);
  const attemptIds = attempts.map((a) => a.id);
  const [{ data: cases }, { data: events }] = await Promise.all([
    admin.from("clinact_cases").select("id, slug, title, format").in("id", caseIds),
    admin.from("clinact_step_events").select("attempt_id, is_correct, confidence").in("attempt_id", attemptIds),
  ]);
  const caseById = new Map((cases ?? []).map((c) => [c.id as number, c]));

  const confidence: Record<Confidence, number> = { baixa: 0, media: 0, alta: 0 };
  const hcByAttempt = new Map<number, number>();
  let highConfidenceErrors = 0;
  for (const e of events ?? []) {
    const conf = e.confidence as Confidence | null;
    if (conf) confidence[conf] = (confidence[conf] ?? 0) + 1;
    if (e.is_correct === false && conf === "alta") {
      highConfidenceErrors++;
      const id = e.attempt_id as number;
      hcByAttempt.set(id, (hcByAttempt.get(id) ?? 0) + 1);
    }
  }

  const scored: ScoredCase[] = [];
  const caseRows: EvolutionCase[] = [];
  for (const a of attempts) {
    const c = caseById.get(a.case_id);
    if (!c || a.score == null) continue;
    const score = Number(a.score);
    scored.push({ case_id: a.case_id, format: c.format as CaseFormat, score });
    caseRows.push({
      case_id: a.case_id,
      slug: c.slug as string,
      title: c.title as string,
      format: c.format as CaseFormat,
      score,
      case_revision: a.case_revision,
      finished_at: a.finished_at as string,
      highConfidenceErrors: hcByAttempt.get(a.id) ?? 0,
    });
  }
  caseRows.sort((x, y) => (x.finished_at < y.finished_at ? 1 : -1));

  const agg = aggregateCases(scored);
  return {
    completed: scored.length,
    overall: agg.overall,
    byFormat: agg.byFormat,
    confidence,
    highConfidenceErrors,
    cases: caseRows,
  };
}
