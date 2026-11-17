/**
 * Meu Plano — how long THIS student takes (Karina + Justin 2026-11-17).
 *
 * The student picks a "Ritmo de estudo":
 *   auto      (default) the plan learns from the time between the student's own
 *             consecutive answers; until there are enough of them it uses the default.
 *   slow / standard / fast   a fixed multiple of the default, chosen by hand.
 *
 * PURE module. Guards, all deliberate:
 *   - a gap outside [min, max] is ignored (the student walked away, or double-tapped);
 *   - the MEDIAN is used, so a few odd answers do not move the pace;
 *   - the learned pace is clamped to 0.5×–2× the default, so no data can ever
 *     produce an absurd plan;
 *   - the admin master switch off → "auto" behaves exactly like "standard".
 * MedVoice is never scaled: an audio lasts what it lasts.
 */

import type { PlanSettings } from "./settings";

export type PaceMode = "auto" | "slow" | "standard" | "fast";
export const PACE_MODES: readonly PaceMode[] = ["auto", "slow", "standard", "fast"];

export function isPaceMode(v: unknown): v is PaceMode {
  return typeof v === "string" && (PACE_MODES as readonly string[]).includes(v);
}

/** Bounds on the gap between two consecutive question answers that counts as "time on one question". */
export const QUESTION_GAP_MIN_S = 10;
export const QUESTION_GAP_MAX_S = 900;
/** Only the most recent gaps count, so the pace follows how the student studies NOW. */
const RECENT_GAPS = 200;
const CLAMP_LOW = 0.5;
const CLAMP_HIGH = 2;

export type GapSample = { medianSeconds: number | null; samples: number };

/** Median gap (seconds) between consecutive timestamps, ignoring gaps outside [minS, maxS]. */
export function medianGapSeconds(isoTimestamps: string[], minS: number, maxS: number): GapSample {
  const times = isoTimestamps
    .map((t) => Date.parse(t))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const s = (times[i] - times[i - 1]) / 1000;
    if (s >= minS && s <= maxS) gaps.push(s);
  }
  const recent = gaps.slice(-RECENT_GAPS).sort((a, b) => a - b);
  if (recent.length === 0) return { medianSeconds: null, samples: 0 };
  const mid = Math.floor(recent.length / 2);
  const median = recent.length % 2 === 1 ? recent[mid] : (recent[mid - 1] + recent[mid]) / 2;
  return { medianSeconds: median, samples: recent.length };
}

export type ResolvedPace = {
  mode: PaceMode;
  /** What the numbers below come from. */
  source: "learned" | "default" | "manual";
  minutesPerQuestion: number;
  secondsPerFlashcard: number;
  minutesPerRevalidaUpInsight: number;
  /** For the settings screen: "≈ N questões por hora". */
  questionsPerHour: number;
  /** auto only: answers measured so far / needed before the student's own pace is used. */
  questionSamples: number;
  samplesNeeded: number;
};

function clampToDefault(value: number, dflt: number): number {
  return Math.min(dflt * CLAMP_HIGH, Math.max(dflt * CLAMP_LOW, value));
}

export function resolvePace(args: {
  mode: PaceMode;
  settings: PlanSettings;
  question: GapSample;
  flashcard: GapSample;
}): ResolvedPace {
  const { settings, question, flashcard } = args;
  // Master switch off → nobody is on "auto".
  const mode: PaceMode = args.mode === "auto" && !settings.adaptivePaceEnabled ? "standard" : args.mode;

  let minutesPerQuestion = settings.minutesPerQuestion;
  let secondsPerFlashcard = settings.secondsPerFlashcard;
  let minutesPerRevalidaUpInsight = settings.minutesPerRevalidaUpInsight;
  let source: ResolvedPace["source"] = "default";

  if (mode === "slow" || mode === "fast") {
    const f = mode === "slow" ? settings.paceSlowFactor : settings.paceFastFactor;
    minutesPerQuestion *= f;
    secondsPerFlashcard *= f;
    minutesPerRevalidaUpInsight *= f;
    source = "manual";
  } else if (mode === "standard") {
    source = "manual";
  } else {
    // auto: each material learns on its own evidence. Revalida Up has no timing
    // data (it is read, not answered), so it stays on the default.
    if (question.medianSeconds != null && question.samples >= settings.paceMinSamples) {
      minutesPerQuestion = clampToDefault(question.medianSeconds / 60, settings.minutesPerQuestion);
      source = "learned";
    }
    if (flashcard.medianSeconds != null && flashcard.samples >= settings.paceMinSamples) {
      secondsPerFlashcard = clampToDefault(flashcard.medianSeconds, settings.secondsPerFlashcard);
      source = "learned";
    }
  }

  return {
    mode,
    source,
    minutesPerQuestion,
    secondsPerFlashcard,
    minutesPerRevalidaUpInsight,
    questionsPerHour: Math.round(60 / minutesPerQuestion),
    questionSamples: question.samples,
    samplesNeeded: settings.paceMinSamples,
  };
}
