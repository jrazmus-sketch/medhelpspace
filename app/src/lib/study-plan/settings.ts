/**
 * Meu Plano — the numbers the schedule is built from (Karina 2026-11-17).
 *
 * PURE module (no server imports) so the engine and its tests can use it; the
 * database loader lives in settings-server.ts. Every value here is editable at
 * /admin/plano (table `study_plan_settings`, one row) — these constants are only
 * the fallback when the row is missing, and are kept identical to the column
 * defaults in schema-patch-plano-cobertura.sql.
 */

export type PlanSettings = {
  /** Minutes per question still to answer (answer + read the commentary). */
  minutesPerQuestion: number;
  /** Seconds per flashcard not yet seen. */
  secondsPerFlashcard: number;
  /** Minutes per Revalida Up insight. */
  minutesPerRevalidaUpInsight: number;
  /** MedVoice lesson whose audio length was not measured. */
  medvoiceFallbackMinutes: number;
  /** Seconds per item due in the Revisão. */
  reviewSecondsPerItem: number;
  /** Largest share of a day the Revisão may take (not applied in the last 14 days). */
  reviewMaxShare: number;
  /**
   * Smallest share of every FUTURE day the forecast holds back for reviews. The
   * forecast uses the student's review load of TODAY when that is bigger (up to
   * reviewMaxShare), so forecast and daily plan follow the same rule.
   */
  reviewReserveShare: number;
  /**
   * Questions in one regular MINI SIMULADO (the 25-question ones under
   * Questões › Simulados — NOT the MedHelp 60D Simulados 100Q, which the plan
   * never schedules). Its time is this × the student's time per question.
   */
  simuladoQuestions: number;
  /** Mini simulados per week in the last 60 days (placed on the first study days of the week). 0 = never. */
  simuladoDaysPerWeek: number;
  /**
   * Largest share of a week's study time the mini simulados may take. When one a
   * week would take more (a student with little time), they come every 2, 3…
   * weeks instead, so new topics and the Revisão always keep most of the time.
   */
  simuladoMaxWeeklyShare: number;
  /** "Mais devagar" multiplies every estimate by this. */
  paceSlowFactor: number;
  /** "Mais rápido" multiplies every estimate by this. */
  paceFastFactor: number;
  /** Master switch: learn each student's pace from their own answers. */
  adaptivePaceEnabled: boolean;
  /** Answers needed before a student's own pace replaces the default. */
  paceMinSamples: number;
};

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  minutesPerQuestion: 2.5,
  secondsPerFlashcard: 30,
  minutesPerRevalidaUpInsight: 1.5,
  medvoiceFallbackMinutes: 12,
  reviewSecondsPerItem: 30,
  reviewMaxShare: 0.5,
  reviewReserveShare: 0.2,
  simuladoQuestions: 25,
  simuladoDaysPerWeek: 1,
  simuladoMaxWeeklyShare: 0.25,
  paceSlowFactor: 1.5,
  paceFastFactor: 0.7,
  adaptivePaceEnabled: true,
  paceMinSamples: 30,
};

/** Column name ↔ field, with the accepted range. The admin form and the loader share this list. */
export const PLAN_SETTING_FIELDS = [
  { key: "minutesPerQuestion",          column: "minutes_per_question",            min: 0.25, max: 15,  step: 0.25, kind: "number" },
  { key: "secondsPerFlashcard",         column: "seconds_per_flashcard",           min: 5,    max: 300, step: 5,    kind: "integer" },
  { key: "minutesPerRevalidaUpInsight", column: "minutes_per_revalida_up_insight", min: 0.25, max: 15,  step: 0.25, kind: "number" },
  { key: "medvoiceFallbackMinutes",     column: "medvoice_fallback_minutes",       min: 1,    max: 120, step: 1,    kind: "integer" },
  { key: "reviewSecondsPerItem",        column: "review_seconds_per_item",         min: 5,    max: 300, step: 5,    kind: "integer" },
  { key: "reviewMaxShare",              column: "review_max_share",                min: 0,    max: 1,   step: 0.05, kind: "share" },
  { key: "reviewReserveShare",          column: "review_reserve_share",            min: 0,    max: 0.9, step: 0.05, kind: "share" },
  { key: "simuladoQuestions",           column: "simulado_questions",              min: 5,    max: 120, step: 1,    kind: "integer" },
  { key: "simuladoDaysPerWeek",         column: "simulado_days_per_week",          min: 0,    max: 7,   step: 1,    kind: "integer" },
  { key: "simuladoMaxWeeklyShare",      column: "simulado_max_weekly_share",       min: 0.05, max: 1,   step: 0.05, kind: "share" },
  { key: "paceSlowFactor",              column: "pace_slow_factor",                min: 1,    max: 3,   step: 0.05, kind: "number" },
  { key: "paceFastFactor",              column: "pace_fast_factor",                min: 0.3,  max: 1,   step: 0.05, kind: "number" },
  { key: "paceMinSamples",              column: "pace_min_samples",                min: 5,    max: 500, step: 5,    kind: "integer" },
] as const satisfies readonly {
  key: Exclude<keyof PlanSettings, "adaptivePaceEnabled">;
  column: string; min: number; max: number; step: number; kind: "number" | "integer" | "share";
}[];

export type PlanSettingNumberKey = (typeof PLAN_SETTING_FIELDS)[number]["key"];

/**
 * A database row (or anything shaped like one) → settings. Every value is
 * range-checked: a NULL, a string that is not a number, or a value outside the
 * accepted range falls back to the default, so a bad row can never produce an
 * absurd plan (a 0-minute question would schedule the whole bank in one day).
 */
export function settingsFromRow(row: Record<string, unknown> | null | undefined): PlanSettings {
  const out: PlanSettings = { ...DEFAULT_PLAN_SETTINGS };
  if (!row) return out;
  for (const f of PLAN_SETTING_FIELDS) {
    const n = Number(row[f.column]);
    if (row[f.column] != null && Number.isFinite(n) && n >= f.min && n <= f.max) {
      out[f.key] = f.kind === "integer" ? Math.round(n) : n;
    }
  }
  if (typeof row.adaptive_pace_enabled === "boolean") out.adaptivePaceEnabled = row.adaptive_pace_enabled;
  return out;
}
