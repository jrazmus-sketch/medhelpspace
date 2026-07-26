import type { ExamPhase } from "@/lib/cohort-timing";

// Pure decision layer for the simulado-100 follow-up sequence.
//
// Everything here is a function of plain values — no DB, no email, no clock — so
// the sequence can be reasoned about and tested without a Supabase stack. The
// cron (api/cron/simulado-drip) owns all I/O: it reads the lead, calls
// planSimuladoSend once, and does exactly what it says.
//
// Shape of the sequence (docs/simulado-drip-design.md §3–§5):
//
//   ONE SALES SPINE, DIFFERENT ON-RAMPS. Not parallel finisher/non-finisher
//   tracks — that is how non-finishers get forgotten and it doubles the copy to
//   maintain. Everyone converges on the same sales steps; what differs is how
//   long before they enter and how personalised the opening is.
//
//   Days 1–7ish are FINISH NUDGES. After the pivot we stop asking them to finish
//   and start selling. The attempt itself never closes and never expires.
//
//   Depth of engagement (not finished/unfinished) sets the pivot: someone who
//   answered 70 questions has absorbed nearly as much of the product as a
//   finisher and can be asked much sooner than a 3-question bouncer.
//
// KARINA'S RULE, ABSOLUTE: no partial diagnosis, ever. A non-finisher message
// may carry a bare PROGRESS COUNT and nothing else — never a score, never
// per-área performance, never a comentário. Only `simScore` carries a score and
// it is only ever populated for a submitted attempt. scripts/test-simulado-drip.mjs
// asserts this across every phase × depth combination; keep it passing.

// ── Engagement depth ─────────────────────────────────────────────────────────

export type SimuladoDepth = "cold" | "bounced" | "engaged" | "deep";

export const SIMULADO_DEPTH_LABELS: Record<SimuladoDepth, string> = {
  cold: "Nunca começou",
  bounced: "Menos de 10 questões",
  engaged: "10 a 59 questões",
  deep: "60+ questões (ou entregou)",
};

const DEPTH_BOUNCED_MAX = 9; // 1–9 answered
const DEPTH_ENGAGED_MAX = 59; // 10–59 answered

export function depthFor(answered: number, submitted: boolean): SimuladoDepth {
  if (submitted) return "deep";
  if (answered <= 0) return "cold";
  if (answered <= DEPTH_BOUNCED_MAX) return "bounced";
  if (answered <= DEPTH_ENGAGED_MAX) return "engaged";
  return "deep";
}

// Days from the start of the exam after which we stop nudging and start selling.
// The ~7-day figure in the design is the ceiling for the shallowest segment; a
// deep engager is asked far sooner because they have already experienced the
// product. This is the single most testable number in the funnel — instrument it.
export const PIVOT_DAY: Record<SimuladoDepth, number> = {
  cold: Number.POSITIVE_INFINITY, // never sold to; see the verification gate below
  bounced: 8,
  engaged: 5,
  deep: 2,
};

export const MAX_NUDGES = 3;
export const MAX_SALES = 4;
// While sales are suppressed (turma off sale, or véspera) the lead gets content
// instead of an offer — but only twice, then the sequence holds rather than
// repeating itself into the void.
export const MAX_VALOR = 2;

// Absolute offsets in days from leads.completed_at (which, in v2, is stamped the
// moment the exam STARTS — the funnel no longer waits on an inbox round-trip).
// One rung fires at most one email; a rung that resolves to "hold" is not
// consumed, so a lead who is temporarily suppressed resumes where they left off.
export const LADDER_OFFSET_DAYS = [1, 3, 6, 9, 13, 18, 25, 33] as const;
export const LAST_LADDER_STEP = LADDER_OFFSET_DAYS.length;

// ── The one performance sentence a non-finisher may receive ──────────────────

// Built here rather than in editable copy so the three cases stay correct without
// conditional logic in a template. `total` / `minAnswers` are passed in by the
// caller from lib/magnet/simulado so the reminder can never claim a threshold
// different from the one the exam actually enforces.
export function progressLineFor(
  answered: number,
  opts: { total: number; minAnswers: number },
): string {
  const { total, minAnswers } = opts;
  if (answered >= total) {
    return `Você respondeu todas as ${total} questões — falta só entregar a prova.`;
  }
  if (answered <= 0) {
    return `Você ainda não respondeu nenhuma das ${total} questões.`;
  }
  if (answered < minAnswers) {
    const toUnlock = minAnswers - answered;
    return `Você respondeu ${answered} de ${total} questões — faltam ${toUnlock} para poder entregar a prova.`;
  }
  return `Você respondeu ${answered} de ${total} questões.`;
}

// ── Exam-phase copy ──────────────────────────────────────────────────────────

// A complete sentence (or ""), so a template can drop {{urgencyLine}} into a
// paragraph without any surrounding text that could dangle when it's empty.
//
// An UNCONFIRMED date drives cadence but is never quoted: Revalida dates move,
// and a funnel email that states a date the board has not announced is a
// credibility leak. Same rule getCohortTiming applies on the public site.
export function urgencyLineFor(input: {
  phase: ExamPhase;
  daysUntilTest: number | null;
  examDateLabel: string | null;
  dateConfirmed: boolean;
  cohortName: string | null;
}): string {
  const { phase, daysUntilTest, examDateLabel, dateConfirmed, cohortName } = input;
  const turma = cohortName ? ` da turma ${cohortName}` : "";

  if (phase === "indefinida" || phase === "passada") return "";

  if (!dateConfirmed || daysUntilTest == null || examDateLabel == null) {
    return `A data da prova${turma} ainda não foi confirmada pela banca — mas a preparação não espera o edital.`;
  }

  const dias = daysUntilTest === 1 ? "Falta 1 dia" : `Faltam ${daysUntilTest} dias`;

  switch (phase) {
    case "vespera":
      return `${dias} para a sua prova (${examDateLabel}). Agora é revisão, sono e cabeça no lugar — nada de matéria nova.`;
    case "reta-final":
      return `${dias} para a sua prova (${examDateLabel}). É reta final: o que decide agora é revisar o que mais cai, não começar do zero.`;
    case "preparacao":
      return `${dias} para a sua prova (${examDateLabel}). É a janela em que dá para cobrir tudo com calma — e é ela que costuma ser desperdiçada.`;
    case "distante":
      return `Sua prova é em ${examDateLabel}. Está longe, e é exatamente por isso que dá para construir base sem correria.`;
    default:
      return "";
  }
}

// ── The plan ─────────────────────────────────────────────────────────────────

export type SimuladoStage = "nudge" | "sales" | "valor" | "turma";

export type SimuladoDripInput = {
  /** Ladder rung already sent (leads.drip_step). */
  dripStep: number;
  /** Whole days since leads.completed_at (the moment the exam started). */
  elapsedDays: number;
  answered: number;
  submitted: boolean;
  /** Clicked an emailed link at least once (leads.verified_at). */
  verified: boolean;
  /** Answered at least one question on site (leads.sim_started_at). */
  started: boolean;
  /** True when the lead has not chosen a turma yet ('undecided'). */
  undecided: boolean;
  /** cohorts.is_for_sale for the lead's turma. A closed turma is never sold. */
  cohortForSale: boolean;
  phase: ExamPhase;
  /** Finish nudges already sent (leads.sim_reminder_step). */
  reminderStep: number;
  /** Sales/value emails already sent (leads.sim_sales_step). */
  salesStep: number;
};

export type SimuladoDripPlan =
  | { action: "hold"; reason: string }
  | {
      action: "send";
      /** The rung to claim — written to leads.drip_step reserve-first. */
      step: number;
      stage: SimuladoStage;
      /** Base template kind; the cron may swap in a {kind}--{phase} variant. */
      kind: string;
      /** New value for the stage counter this send consumes (null = none). */
      reminderStep: number | null;
      salesStep: number | null;
    };

function nudgeKind(index: number): string {
  return `lead-sim-finish-${index}`;
}

// Sales spine. Steps 1–2 are the ON-RAMP and differ by whether they have a
// diagnosis to talk about — a finisher gets the existing report-recap copy;
// everyone else gets copy that references nothing but their progress. Steps 3–4
// are converged: identical for the whole list.
function salesKind(index: number, submitted: boolean): string {
  if (index === 1) return submitted ? "lead-sim-d2" : "lead-sim-sales-1";
  if (index === 2) return submitted ? "lead-sim-d5" : "lead-sim-sales-2";
  return `lead-sim-sales-${index}`;
}

export function planSimuladoSend(input: SimuladoDripInput): SimuladoDripPlan {
  const {
    dripStep,
    elapsedDays,
    answered,
    submitted,
    verified,
    started,
    undecided,
    cohortForSale,
    phase,
    reminderStep,
    salesStep,
  } = input;

  // Deliverability guardrail, and it protects every other funnel on the domain:
  // an address that has never clicked anything AND never did anything on site is
  // not a lead yet. It stays with the transactional resume link only.
  if (!verified && !started) return { action: "hold", reason: "unverified_and_unstarted" };

  const step = dripStep + 1;
  if (step > LAST_LADDER_STEP) return { action: "hold", reason: "ladder_exhausted" };
  if (elapsedDays < LADDER_OFFSET_DAYS[step - 1]) return { action: "hold", reason: "not_due" };

  // An "Ainda não decidi" lead has no exam date, so no timing logic applies to
  // them. Two asks — on rungs 1 and 3 — whose only job is to obtain the turma;
  // the moment they answer they merge into the timed track. Deliberately keyed
  // off the rung rather than a counter: if they pick a turma in between, the
  // second ask simply never happens.
  if (undecided && (step === 1 || step === 3)) {
    return { action: "send", step, stage: "turma", kind: "lead-sim-turma", reminderStep: null, salesStep: null };
  }

  const depth = depthFor(answered, submitted);

  // A finisher is never nudged to finish. Everyone else is nudged until the
  // pivot their depth earns them, and never more than MAX_NUDGES times.
  const inNudgeWindow =
    !submitted && elapsedDays < PIVOT_DAY[depth] && reminderStep < MAX_NUDGES;

  if (inNudgeWindow) {
    const index = reminderStep + 1;
    return {
      action: "send",
      step,
      stage: "nudge",
      kind: nudgeKind(index),
      reminderStep: index,
      salesStep: null,
    };
  }

  // A cold lead (verified but never answered a single question) has experienced
  // nothing we could sell on the back of. They keep getting nudges until those
  // run out, then stop — they are a recovery problem, not a sales one.
  if (depth === "cold") return { action: "hold", reason: "cold_no_sales" };

  // Sales suppression. A turma that is closed for sale must never receive an
  // offer, and neither must someone whose exam is days away: both get content
  // only. Véspera leads roll to the next turma once their exam passes, which
  // lifts the suppression on its own.
  const suppressed = !cohortForSale || phase === "vespera";

  if (suppressed) {
    const index = salesStep + 1;
    if (index > MAX_VALOR) return { action: "hold", reason: "sales_suppressed" };
    return {
      action: "send",
      step,
      stage: "valor",
      kind: "lead-sim-valor",
      reminderStep: null,
      salesStep: index,
    };
  }

  const index = salesStep + 1;
  if (index > MAX_SALES) return { action: "hold", reason: "sales_exhausted" };
  return {
    action: "send",
    step,
    stage: "sales",
    kind: salesKind(index, submitted),
    reminderStep: null,
    salesStep: index,
  };
}
