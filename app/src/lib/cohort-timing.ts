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
  c: Pick<CohortProduct, "testDate" | "unlock60dDate">,
  now: Date = new Date(),
): CohortTiming {
  const today = todayInTZ(now);

  let daysToTest: number | null = null;
  let examDateLabel: string | null = null;
  let examChip: CohortTiming["examChip"] = null;

  if (c.testDate) {
    const t = dateOnly(c.testDate);
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

  if (c.unlock60dDate) {
    const u = dateOnly(c.unlock60dDate);
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

// Default tagline by role. The editable site_content key (keyed per cohort slug)
// overrides this; it's the fallback so the copy works before Karina edits it.
export function defaultCohortTagline(t: CohortTiming): string {
  return t.isNearExam
    ? "Menos tempo até a prova — por isso o valor menor. Comece hoje; cada dia conta."
    : "Mais tempo para construir uma base sólida, no seu ritmo.";
}
