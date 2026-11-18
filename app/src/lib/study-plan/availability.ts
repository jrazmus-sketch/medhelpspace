/**
 * The student's availability, in the terms the screen uses (Karina 2026-11-18):
 * the student says how long they can study ON EACH study day and picks the days;
 * the weekly total is calculated and only shown as a summary.
 *
 * Pure and client-safe — the engine (derive.ts), the page and the editors all
 * read the same numbers and the same wording from here.
 */

/** A student who never set a time studies this much per study day. */
export const DEFAULT_DAILY_MINUTES = 60;
/** What the field accepts: from 10 minutes to 16 hours per study day. */
export const DAILY_MINUTES_MIN = 10;
export const DAILY_MINUTES_MAX = 960;

export function isValidDailyMinutes(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= DAILY_MINUTES_MIN && n <= DAILY_MINUTES_MAX;
}

export function clampDailyMinutes(n: number): number {
  return Math.min(DAILY_MINUTES_MAX, Math.max(DAILY_MINUTES_MIN, Math.round(n)));
}

const LEGACY_INTENSITY_MINUTES: Record<string, number> = { leve: 30, padrao: 60, intenso: 120 };

/**
 * A row saved before the daily field existed: the old weekly hours spread over
 * the study days (exactly what the plan used), else the old Leve/Padrão/Intenso
 * minutes. 6 h a week on 3 days is 2 h a day — never 6 h a day.
 */
export function legacyDailyMinutes(row: {
  weekly_hours?: number | null;
  intensity?: string | null;
  studyDays: number;
}): number {
  if (row.weekly_hours != null && row.studyDays > 0) {
    return clampDailyMinutes((row.weekly_hours * 60) / row.studyDays);
  }
  return LEGACY_INTENSITY_MINUTES[row.intensity ?? "padrao"] ?? DEFAULT_DAILY_MINUTES;
}

export function countDays(mask: number): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (mask & (1 << i)) n++;
  return n;
}

/** Minutes → "5 h" / "1 h 30 min" / "30 min". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total - h * 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// bit0 = Sunday … bit6 = Saturday; listed from Monday, the way a week is read.
const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** The study days in words: "segunda, quarta e sexta" / "todos os dias". */
export function studyDayNames(mask: number): string {
  const names = WEEK_ORDER.filter((d) => mask & (1 << d)).map((d) => DAY_NAMES[d]);
  if (names.length === 0) return "nenhum dia selecionado";
  if (names.length === 7) return "todos os dias";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** "5 h por dia de estudo · 3 dias por semana · 15 h semanais". */
export function availabilityLine(dailyMinutes: number, studyDayMask: number): string {
  const days = countDays(studyDayMask);
  if (days === 0) return `${formatDuration(dailyMinutes)} por dia de estudo · nenhum dia selecionado`;
  return [
    `${formatDuration(dailyMinutes)} por dia de estudo`,
    `${days} ${days === 1 ? "dia" : "dias"} por semana`,
    `${formatDuration(dailyMinutes * days)} semanais`,
  ].join(" · ");
}
