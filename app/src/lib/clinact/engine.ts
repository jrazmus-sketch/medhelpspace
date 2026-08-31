/**
 * Runtime engine — turns the step stack into screens and folds decisions into
 * attempt state (§2.4). Pure; the server action owns persistence.
 *
 * A "screen" is what the student sees at once: the passive blocks that lead
 * up to a decision, the decision itself, its modifiers (cronômetro before it,
 * confiança after it), and the post-answer blocks revealed once answered
 * (feedback, custo do atraso, ...). Blocks after the last decision form the
 * closing screen (leve deste caso). One engine, four formats.
 */

import { optionWeight, orderWeight } from "./scoring";
import {
  type AnsweredStep,
  type AttemptState,
  type Confidence,
  type Effect,
  type Media,
  type OptionDoc,
  type StepDoc,
  type StepKind,
} from "./types";

const DECISION = new Set<StepKind>(["pergunta", "reavaliacao", "ordenar", "cena_conduta"]);
const POST = new Set<StepKind>(["feedback", "custo_do_atraso", "seducao"]);

export type Screen = {
  index: number;
  /** Passive blocks shown before the decision (narrativa, novo_dado, midia, pistas...). */
  before: StepDoc[];
  decision: StepDoc | null;
  timerSeconds: number | null;
  askConfidence: boolean;
  /** Blocks revealed after answering (feedback, custo do atraso). */
  after: StepDoc[];
  /** True for the closing screen (leve deste caso + result). */
  closing: boolean;
};

export function buildScreens(steps: StepDoc[]): Screen[] {
  const list = steps.filter((s) => s.enabled).sort((a, b) => a.position - b.position);
  const screens: Screen[] = [];
  let before: StepDoc[] = [];
  let timer: number | null = null;
  let i = 0;
  while (i < list.length) {
    const s = list[i];
    if (s.kind === "cronometro") {
      timer = Number((s.content as { seconds?: number }).seconds ?? 30);
      i++;
      continue;
    }
    if (!DECISION.has(s.kind)) {
      before.push(s);
      i++;
      continue;
    }
    // Decision: absorb confiança + post blocks that follow.
    let j = i + 1;
    let askConfidence = false;
    const after: StepDoc[] = [];
    while (j < list.length) {
      const n = list[j];
      if (n.kind === "confianca") { askConfidence = true; j++; continue; }
      if (POST.has(n.kind)) { after.push(n); j++; continue; }
      break;
    }
    screens.push({ index: screens.length, before, decision: s, timerSeconds: timer, askConfidence, after, closing: false });
    before = [];
    timer = null;
    i = j;
  }
  // Closing screen: everything left (leve deste caso, trailing midia...).
  const closingBefore = before.filter((s) => s.kind !== "confianca");
  screens.push({ index: screens.length, before: closingBefore, decision: null, timerSeconds: null, askConfidence: false, after: [], closing: true });
  return screens;
}

export function emptyState(): AttemptState {
  return { cursor: 0, answered: {}, revealed: [], estado: {}, relogio: 0, scene_key: null };
}

/**
 * Finished = the cursor reached the closing screen. NOT "every decision
 * answered": convergent branching (Clínica em Cena) legitimately skips
 * scenes, and the score is the mean over the decisions actually taken.
 */
export function isFinished(state: AttemptState, screens: Screen[]): boolean {
  return screens[Math.min(state.cursor, screens.length - 1)]?.closing === true;
}

export function stepKey(step: StepDoc): string {
  return String(step.id ?? step.position);
}

export type Decision =
  | { option_id: number; confidence?: Confidence | null; time_ms?: number | null }
  | { order: number[]; confidence?: Confidence | null; time_ms?: number | null };

export type Applied = {
  state: AttemptState;
  answered: AnsweredStep;
  chosen: OptionDoc | null;
  reveals: Effect["revela"];
};

/** Fold one decision into state. Throws on an answer for the wrong step. */
export function applyDecision(state: AttemptState, screen: Screen, decision: Decision): Applied {
  const step = screen.decision;
  if (!step) throw new Error("Esta tela não tem decisão.");
  const key = stepKey(step);
  if (state.answered[key]) throw new Error("Decisão já registrada.");

  let answered: AnsweredStep;
  let chosen: OptionDoc | null = null;
  let reveals: Effect["revela"] = [];
  const next: AttemptState = {
    ...state,
    answered: { ...state.answered },
    revealed: [...state.revealed],
    estado: { ...state.estado },
  };

  if ("order" in decision) {
    const items = ((step.content as { items?: string[] }).items ?? []).map((_, i) => i);
    const r = orderWeight(decision.order, items);
    answered = { order: decision.order, is_correct: r.is_correct, weight: r.weight, confidence: decision.confidence ?? null, time_ms: decision.time_ms ?? null };
  } else {
    chosen = step.options.find((o) => (o.id ?? o.position) === decision.option_id) ?? null;
    if (!chosen) throw new Error("Alternativa inválida.");
    answered = {
      option_id: decision.option_id,
      is_correct: chosen.is_correct,
      weight: optionWeight(chosen),
      confidence: decision.confidence ?? null,
      time_ms: decision.time_ms ?? null,
    };
    reveals = chosen.effect?.revela ?? [];
    if (reveals.length) next.revealed.push(...reveals);
    if (chosen.effect?.estado) Object.assign(next.estado, chosen.effect.estado);
    if (chosen.effect?.relogio) next.relogio += chosen.effect.relogio;
    if (chosen.next_scene_key) next.scene_key = chosen.next_scene_key;
  }
  next.answered[key] = answered;
  return { state: next, answered, chosen, reveals };
}

/**
 * Scenes targeted by any "vai para" are DETOUR scenes: the normal flow never
 * falls into them (the guide's template authors them INLINE — chegada →
 * deterioracao → investigacao — and the good conducts of chegada must land on
 * investigacao). They are only entered by the jump itself; their own blank
 * conducts converge to the next non-detour scene, closing the detour in one
 * scene as the guide promises.
 */
export function detourSceneKeys(screens: Screen[]): Set<string> {
  const targeted = new Set<string>();
  for (const sc of screens) {
    for (const o of sc.decision?.options ?? []) {
      if (o.next_scene_key) targeted.add(o.next_scene_key);
    }
  }
  return targeted;
}

/**
 * Move to the next screen. Convergence is the default: cursor moves to the
 * next screen, SKIPPING detour scenes (see detourSceneKeys). A chosen option
 * with `next_scene_key` diverts to that scene's screen instead — the jump is
 * derived from the ANSWERED option, so a resumed attempt advances identically
 * (§2.4).
 */
export function advance(state: AttemptState, screens: Screen[]): AttemptState {
  const cur = screens[state.cursor];
  if (cur?.decision) {
    const a = state.answered[stepKey(cur.decision)];
    if (a?.option_id != null) {
      const chosen = cur.decision.options.find((o) => (o.id ?? o.position) === a.option_id);
      if (chosen?.next_scene_key) {
        const target = screens.findIndex((sc) => sc.decision?.scene_key === chosen.next_scene_key);
        if (target >= 0 && target !== state.cursor) return { ...state, cursor: target };
      }
    }
  }
  const detours = detourSceneKeys(screens);
  let j = state.cursor + 1;
  while (j < screens.length - 1 && screens[j].decision?.scene_key && detours.has(screens[j].decision!.scene_key!)) {
    j++;
  }
  return { ...state, cursor: Math.min(j, screens.length - 1) };
}

/** Weights of every answered decision, in screen order — input to caseScore(). */
export function earnedWeights(state: AttemptState, screens: Screen[]): number[] {
  const out: number[] = [];
  for (const sc of screens) {
    if (!sc.decision) continue;
    const a = state.answered[stepKey(sc.decision)];
    if (a) out.push(a.weight);
  }
  return out;
}

/** What the client may see of a decision step BEFORE answering. */
export type PublicOption = { id: number; position: number; label: string };
export type PublicStep = Omit<StepDoc, "options"> & { options: PublicOption[] };

export function stripAnswers(step: StepDoc): PublicStep {
  return {
    ...step,
    options: step.options.map((o) => ({ id: o.id ?? o.position, position: o.position, label: o.label })),
  };
}

/** Revealed after answering: every option's verdict, feedback and seduction. */
export type Reveal = {
  correct_option_id: number | null;
  options: { id: number; is_correct: boolean; quality: string | null; feedback: string | null; seduction: string | null }[];
  chosen_option_id: number | null;
  is_correct: boolean;
  weight: number;
  revealed: { cat: string; texto: string; midia?: Media }[];
  after: StepDoc[];
};

export function buildReveal(screen: Screen, applied: Applied): Reveal {
  const step = screen.decision!;
  const correct = step.options.find((o) => o.is_correct);
  return {
    correct_option_id: correct ? (correct.id ?? correct.position) : null,
    options: step.options.map((o) => ({
      id: o.id ?? o.position,
      is_correct: o.is_correct,
      quality: o.quality ?? null,
      feedback: o.feedback ?? null,
      seduction: o.seduction ?? null,
    })),
    chosen_option_id: applied.chosen ? (applied.chosen.id ?? applied.chosen.position) : null,
    is_correct: applied.answered.is_correct,
    weight: applied.answered.weight,
    revealed: applied.reveals ?? [],
    after: screen.after,
  };
}
