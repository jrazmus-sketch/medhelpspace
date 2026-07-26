import type { CohortProduct } from "@/types/supabase";

// Date-driven cohort copy: countdown to the exam + the MedHelp 60D unlock state.
// Pure functions of (test_date, unlock_date, now) so the loja server card and the
// landing client pricing block render identical, always-current copy with no
// hardcoded per-cohort strings. Day granularity, computed in the audience's
// timezone (Brazil) to avoid off-by-one around midnight.

const TZ = "America/Sao_Paulo";

// Below this many days to the exam, a cohort gets the urgency treatment. With the
// two live turmas (2026.2 ≈ 77d, 2027.1 ≈ 199d) only the near one qualifies; as
// the near exam passes and it leaves the storefront, the next turma inherits
// urgency automatically as ITS exam approaches — no copy edits.
const NEAR_EXAM_DAYS = 120;

// Within this window the 60D line shows a day-countdown ("abre em 15 dias");
// beyond it, a date ("abre em 16/11") reads better than a large number.
const COUNTDOWN_60D_DAYS = 45;

export interface CohortTiming {
  daysToTest: number | null;
  examDateLabel: string | null;            // "15/09/2026"
  isNearExam: boolean;                     // within NEAR_EXAM_DAYS and not past
  /** Header chip text + whether to style it as urgent. null once the exam has passed. */
  examChip: { text: string; urgent: boolean } | null;
  is60dUnlocked: boolean;
  days60d: number | null;                  // days until unlock (0 once unlocked)
  unlock60dLabel: string;                  // ready-to-render 60D status line
}

function todayInTZ(now: Date): string {
  // en-CA renders ISO-style YYYY-MM-DD
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function daysBetween(fromYMD: string, toYMD: string): number {
  const a = Date.parse(`${fromYMD}T00:00:00Z`);
  const b = Date.parse(`${toYMD}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function fmtFull(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function fmtShort(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

export function getCohortTiming(
  c: Pick<CohortProduct, "testDate" | "unlock60dDate" | "dateConfirmed">,
  now: Date = new Date(),
): CohortTiming {
  const today = todayInTZ(now);

  // Revalida exam dates are notoriously unreliable — until the exam board has
  // actually announced one, testDate/unlock60dDate are only an internal planning
  // guess. Treat them as unset here so every downstream field falls back to the
  // same "we don't know yet" copy a cohort with no date at all would get; no
  // countdown, no calendar date is ever shown for an unconfirmed cohort.
  const testDate = c.dateConfirmed ? c.testDate : null;
  const unlock60dDate = c.dateConfirmed ? c.unlock60dDate : null;

  let daysToTest: number | null = null;
  let examDateLabel: string | null = null;
  let examChip: CohortTiming["examChip"] = null;

  if (testDate) {
    const t = dateOnly(testDate);
    daysToTest = daysBetween(today, t);
    examDateLabel = fmtFull(t);
    if (daysToTest > 0) {
      const urgent = daysToTest <= NEAR_EXAM_DAYS;
      examChip = urgent
        ? {
            text: `Faltam ${daysToTest} dias para a prova`.replace(
              "Faltam 1 dias",
              "Falta 1 dia",
            ),
            urgent: true,
          }
        : { text: `Prova em ${examDateLabel}`, urgent: false };
    }
  }

  const isNearExam = examChip?.urgent ?? false;

  let is60dUnlocked = false;
  let days60d: number | null = null;
  let unlock60dLabel = "MedHelp 60D — liberado 60 dias antes da prova";

  if (unlock60dDate) {
    const u = dateOnly(unlock60dDate);
    const d = daysBetween(today, u);
    days60d = Math.max(0, d);
    if (d <= 0) {
      is60dUnlocked = true;
      unlock60dLabel = "MedHelp 60D já está liberado";
    } else if (d <= COUNTDOWN_60D_DAYS) {
      unlock60dLabel = `MedHelp 60D abre em ${d} ${d === 1 ? "dia" : "dias"}`;
    } else {
      unlock60dLabel = `MedHelp 60D abre em ${fmtShort(u)}`;
    }
  }

  return { daysToTest, examDateLabel, isNearExam, examChip, is60dUnlocked, days60d, unlock60dLabel };
}

// ── Exam-date phase engine ───────────────────────────────────────────────────
//
// The coarse "where in the preparation are they" bucket the lead funnels segment
// on (docs/simulado-drip-design.md §5). Same day arithmetic and same timezone as
// getCohortTiming above — deliberately reusing them rather than starting fresh,
// so a lead's phase can never disagree with the countdown chip they see on site.
//
// `passada` and `indefinida` are not in the design table but every caller needs
// them: a lead whose exam has already happened must stop receiving prep mail
// (they get rolled to the next turma), and an "Ainda não decidi" lead has no
// date at all, so no timing logic applies to them.

export type ExamPhase =
  | "distante"
  | "preparacao"
  | "reta-final"
  | "vespera"
  | "passada"
  | "indefinida";

export const EXAM_PHASE_LABELS: Record<ExamPhase, string> = {
  distante: "Distante",
  preparacao: "Preparação",
  "reta-final": "Reta final",
  vespera: "Véspera",
  passada: "Prova já realizada",
  indefinida: "Sem data definida",
};

export interface ExamPhaseInfo {
  phase: ExamPhase;
  /** Days from today to the exam. Negative once it has passed; null with no date. */
  daysUntilTest: number | null;
  /** "15/09/2026" — null when there is no date. Present even if unconfirmed. */
  examDateLabel: string | null;
  /**
   * Whether the exam board has actually announced this date. Revalida dates are
   * notoriously unreliable, so an unconfirmed date drives CADENCE (the phase)
   * but must never be quoted as fact in copy. See getCohortTiming.
   */
  dateConfirmed: boolean;
  isPast: boolean;
}

// Boundaries from the design table: >180 distante · 180–90 preparação ·
// 90–30 reta final · <30 véspera.
const PHASE_DISTANTE_DAYS = 180;
const PHASE_PREPARACAO_DAYS = 90;
const PHASE_RETA_FINAL_DAYS = 30;

export function getExamPhase(
  testDate: string | null | undefined,
  opts: { dateConfirmed?: boolean } = {},
  now: Date = new Date(),
): ExamPhaseInfo {
  const dateConfirmed = opts.dateConfirmed ?? false;

  if (!testDate) {
    return {
      phase: "indefinida",
      daysUntilTest: null,
      examDateLabel: null,
      dateConfirmed,
      isPast: false,
    };
  }

  const t = dateOnly(testDate);
  const daysUntilTest = daysBetween(todayInTZ(now), t);
  const examDateLabel = fmtFull(t);

  let phase: ExamPhase;
  if (daysUntilTest < 0) phase = "passada";
  else if (daysUntilTest < PHASE_RETA_FINAL_DAYS) phase = "vespera";
  else if (daysUntilTest <= PHASE_PREPARACAO_DAYS) phase = "reta-final";
  else if (daysUntilTest <= PHASE_DISTANTE_DAYS) phase = "preparacao";
  else phase = "distante";

  return { phase, daysUntilTest, examDateLabel, dateConfirmed, isPast: daysUntilTest < 0 };
}
