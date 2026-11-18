/**
 * Meu Plano: the student sets the time PER STUDY DAY (Karina 2026-11-18).
 * Rules under test — each one is hers:
 *   1. the student informs hours and minutes per study day and picks the days; the weekly
 *      total is calculated (5 h × segunda, quarta e sexta = 15 h semanais);
 *   2. the calculations change, not only the label: the daily time drives the day's list,
 *      the forecast and the weekly budget of the mini simulados;
 *   3. what was already saved keeps its load (6 h a week on 3 days = 2 h a day, never 6 h a day);
 *   4. "Intensidade base" is gone; a temporary reduction stays ("Reduzir o tempo de estudo por um período");
 *   5. the page shows the routine actually used, without the phase subtitle;
 *   6. the cards and "Onde focar" say what each number is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { withFrozenTime, MORNING_BRT } from "./helpers/freeze-time";
import {
  derivePlan, defaultPrefs,
  type StudyPlanPrefs, type Signals, type TopicRow, type PageRow, type TopicContentRow, type SpecialtyRow,
} from "@/lib/study-plan/derive";
import {
  availabilityLine, formatDuration, studyDayNames, legacyDailyMinutes, isValidDailyMinutes,
  DEFAULT_DAILY_MINUTES,
} from "@/lib/study-plan/availability";
import { TIPS } from "@/lib/onboarding/tips";

// MORNING_BRT is Tuesday 2026-07-28. Bits: 0 = Sunday … 6 = Saturday.
const MON_WED_FRI = (1 << 1) | (1 << 3) | (1 << 5);
const TUE_THU_SAT = (1 << 2) | (1 << 4) | (1 << 6);
const WEEKDAYS = 0b0111110;

// ── the summary line ─────────────────────────────────────────────────────────

test("availability: Karina's example — 5 h a day on segunda, quarta e sexta is 15 h a week", () => {
  assert.equal(availabilityLine(300, MON_WED_FRI), "5 h por dia de estudo · 3 dias por semana · 15 h semanais");
  assert.equal(studyDayNames(MON_WED_FRI), "segunda, quarta e sexta");
});

test("availability: 30 minutes and 1 hour and 30 minutes are ordinary values", () => {
  assert.equal(formatDuration(30), "30 min");
  assert.equal(formatDuration(90), "1 h 30 min");
  assert.equal(formatDuration(300), "5 h");
  assert.equal(availabilityLine(90, WEEKDAYS), "1 h 30 min por dia de estudo · 5 dias por semana · 7 h 30 min semanais");
  assert.equal(availabilityLine(30, 1 << 6), "30 min por dia de estudo · 1 dia por semana · 30 min semanais");
});

test("availability: the days are named from Monday; every day and no day have their own words", () => {
  assert.equal(studyDayNames(127), "todos os dias");
  assert.equal(studyDayNames(0), "nenhum dia selecionado");
  assert.equal(studyDayNames((1 << 0) | (1 << 6)), "sábado e domingo");
  assert.equal(studyDayNames(1 << 2), "terça");
});

test("availability: the field accepts whole minutes from 10 min to 16 h", () => {
  for (const ok of [10, 30, 90, 300, 960]) assert.equal(isValidDailyMinutes(ok), true, String(ok));
  for (const bad of [0, 9, 961, 30.5, NaN, null, "60"]) assert.equal(isValidDailyMinutes(bad), false, String(bad));
});

// ── conversion of what was saved ─────────────────────────────────────────────

test("conversion: 6 h a week on 3 days is 2 h a day — never 6 h a day", () => {
  assert.equal(legacyDailyMinutes({ weekly_hours: 6, intensity: "intenso", studyDays: 3 }), 120);
});

test("conversion: every old weekly setting becomes exactly the minutes the plan was already using", () => {
  for (let hours = 3; hours <= 40; hours++) {
    for (let days = 1; days <= 7; days++) {
      const before = Math.round((hours * 60) / days); // the old engine: weekly hours spread over the study days
      assert.equal(legacyDailyMinutes({ weekly_hours: hours, intensity: "padrao", studyDays: days }), Math.min(960, before), `${hours} h / ${days} d`);
    }
  }
});

test("conversion: without weekly hours the old level's minutes are kept", () => {
  assert.equal(legacyDailyMinutes({ weekly_hours: null, intensity: "leve", studyDays: 5 }), 30);
  assert.equal(legacyDailyMinutes({ weekly_hours: null, intensity: "padrao", studyDays: 7 }), 60);
  assert.equal(legacyDailyMinutes({ weekly_hours: null, intensity: "intenso", studyDays: 3 }), 120);
  assert.equal(legacyDailyMinutes({ weekly_hours: 10, intensity: "leve", studyDays: 0 }), 30, "no study day: nothing to spread over");
  assert.equal(defaultPrefs().daily_minutes, DEFAULT_DAILY_MINUTES);
  assert.equal(DEFAULT_DAILY_MINUTES, 60);
});

test("conversion: the patch applies the same rule in the database and keeps the old columns", () => {
  const sql = readFileSync(path.join(process.cwd(), "..", "schema-patch-plano-tempo-diario.sql"), "utf8");
  assert.match(sql, /round\(sp\.weekly_hours \* 60\.0 \/ d\.study_days\)/);
  assert.match(sql, /available_days::int & ~recurring_off_days::int/);
  assert.match(sql, /WHEN 'leve' THEN 30 WHEN 'intenso' THEN 120 ELSE 60/);
  assert.match(sql, /AND sp\.daily_minutes IS NULL/, "re-run safe: a time the student already set is never overwritten");
  assert.doesNotMatch(sql, /DROP COLUMN/);
});

// ── the engine ───────────────────────────────────────────────────────────────

const SPECIALTIES: SpecialtyRow[] = [
  { id: 1, name: "Cardiologia", slug: "cardiologia" },
  { id: 2, name: "Gastroenterologia", slug: "gastroenterologia" },
  { id: 3, name: "Pediatria", slug: "pediatria" },
];
const N = 40;
const PAGES: PageRow[] = [];
const TOPICS: TopicRow[] = [];
const CONTENT: TopicContentRow[] = [];
for (let i = 1; i <= N; i++) {
  const spec = ((i - 1) % 3) + 1;
  PAGES.push({ id: 100 + i, slug: `q${i}`, title: `Q${i}`, type: "h5p-quiz", specialty_id: spec, track_id: null, content_module_id: null, view: "quiz" });
  TOPICS.push({ id: i, name: `Tema${i}`, slug: `t${i}`, specialty_id: spec, source_page_id: 100 + i, incidence_count: 100 - i, priority_tier: "A", is_pinned: false });
  CONTENT.push({ topic_id: i, resource_type: "quiz", page_id: 100 + i, question_filter: null });
}
const QUESTIONS_PER_TOPIC = 33;

function plan(over: { prefs?: Partial<StudyPlanPrefs>; signals?: Partial<Signals>; testDate?: string | null } = {}) {
  return withFrozenTime(MORNING_BRT, () => derivePlan({
    prefs: {
      ...defaultPrefs(), pace_mode: "standard",
      preferred_content_types: ["quiz"],
      ...over.prefs,
    },
    cohort: { test_date: over.testDate === undefined ? "2026-10-30" : over.testDate },
    specialties: SPECIALTIES, pages: PAGES, topics: TOPICS, topicContent: CONTENT,
    signals: {
      quizAttempts: [], lessonCompletions: [], reviewDueToday: 0, lessonsByPageId: new Map(), pauses: [],
      questionCountsByPageId: new Map(Array.from({ length: N }, (_, i) => [101 + i, QUESTIONS_PER_TOPIC])),
      ...over.signals,
    },
  }));
}
const placed = (d: { review: number; simulado: number; content: number }) => d.review + d.simulado + d.content;

test("engine: the daily time is the day's time — today, every day of the forecast and the weekly total", () => {
  const p = plan({ prefs: { daily_minutes: 300, available_days: TUE_THU_SAT } });
  assert.equal(p.todayBudgetMinutes, 300);
  assert.ok(p.totalEstimatedMinutes <= 300);
  assert.equal(p.routine.dailyMinutes, 300);
  assert.equal(p.routine.studyDays, 3);
  assert.equal(p.routine.weeklyMinutes, 900, "15 h a week, calculated");
  assert.equal(p.forecast!.minutesPerStudyDay, 300);
  assert.equal(p.simulado.weeklyStudyMinutes, 900, "the mini simulado budget follows the daily time");
  assert.ok(p.scheduleDays.length > 0);
  for (const d of p.scheduleDays) assert.ok(placed(d) <= 300 + 0.01, `${d.key}: ${placed(d)} min`);
});

test("engine: picking more days adds study time — the daily time is never re-divided", () => {
  const three = plan({ prefs: { daily_minutes: 120, available_days: TUE_THU_SAT } });
  const five = plan({ prefs: { daily_minutes: 120, available_days: TUE_THU_SAT | (1 << 1) | (1 << 3) } });
  assert.equal(three.todayBudgetMinutes, 120);
  assert.equal(five.todayBudgetMinutes, 120, "the old weekly model would have made each day shorter");
  assert.equal(three.routine.weeklyMinutes, 360);
  assert.equal(five.routine.weeklyMinutes, 600);
  assert.ok(five.forecast!.expectedTopics >= three.forecast!.expectedTopics);
});

test("engine: recurring days off are not study days (the summary counts the days actually used)", () => {
  const p = plan({ prefs: { daily_minutes: 60, available_days: 127, recurring_off_days: (1 << 0) | (1 << 6) } });
  assert.equal(p.routine.studyDays, 5);
  assert.equal(p.routine.weeklyMinutes, 300);
  assert.equal(studyDayNames(p.routine.studyDayMask), "segunda, terça, quarta, quinta e sexta");
});

test("engine: more time per day widens the forecast (the forecast uses the daily time)", () => {
  const little = plan({ prefs: { daily_minutes: 30 } });
  const more = plan({ prefs: { daily_minutes: 180 } });
  assert.ok(more.forecast!.expectedTopics > little.forecast!.expectedTopics);
  assert.ok(more.forecast!.scheduledMinutes > little.forecast!.scheduledMinutes);
});

test("engine: a reduction shortens the days up to its last day, and the regular time returns after it", () => {
  const p = plan({ prefs: { daily_minutes: 120, temp_daily_minutes: 30, temp_daily_until: "2026-08-03" } });
  assert.equal(p.todayBudgetMinutes, 30);
  assert.equal(p.routine.dailyMinutes, 30);
  assert.equal(p.routine.baseDailyMinutes, 120);
  assert.equal(p.routine.reducedUntil, "2026-08-03");
  const during = p.scheduleDays.filter((d) => d.key <= "2026-08-03");
  const after = p.scheduleDays.filter((d) => d.key > "2026-08-03");
  assert.ok(during.length > 0 && after.length > 0);
  for (const d of during) assert.ok(placed(d) <= 30 + 0.01, `${d.key}: ${placed(d)} min`);
  assert.ok(after.some((d) => placed(d) > 100), "the regular 2 h are back after the period");
  for (const d of after) assert.ok(placed(d) <= 120 + 0.01, `${d.key}: ${placed(d)} min`);
});

// ── what the cards and "Onde focar" say ──────────────────────────────────────

const answers = (topic: number, n: number, right: number) => Array.from({ length: n }, (_, q) => ({
  specialty_id: ((topic - 1) % 3) + 1, is_correct: q < right, created_at: "2026-07-20T10:00:00Z",
  page_id: 100 + topic, question_id: topic * 1000 + q,
}));

test("cards: a topic in progress names both numbers — answered, and programmed for today", () => {
  // 3 of 33 answered; 30 are left (75 min) and the day has 60 min.
  const p = plan({ prefs: { daily_minutes: 60 }, signals: { quizAttempts: answers(1, 3, 3) } });
  const card = p.items.find((i) => i.title === "Tema1")!;
  assert.match(card.subtitle, /3 de 33 questões respondidas · \d+ programadas para hoje/);
  assert.doesNotMatch(card.subtitle, /\d+ hoje$/);
});

test("cards: a topic not started says how many questions are programmed for today", () => {
  const partial = plan({ prefs: { daily_minutes: 30 } }).items.find((i) => i.title === "Tema1")!;
  assert.match(partial.subtitle, /12 de 33 questões programadas para hoje/);
  const whole = plan({ prefs: { daily_minutes: 300 } }).items.find((i) => i.title === "Tema1")!;
  assert.match(whole.subtitle, /33 questões programadas para hoje/);
});

test("Onde focar: the plan hands over the counts, and which areas the student marked", () => {
  const p = plan({
    prefs: { focus_specialty_ids: [3] },
    signals: { quizAttempts: [...answers(2, 1, 0), ...answers(1, 20, 12)] },
  });
  const byName = new Map(p.weakestSpecialties.map((s) => [s.name, s]));
  assert.equal(p.weakestSpecialties[0].name, "Pediatria", "the area the student marked comes first");
  assert.equal(byName.get("Pediatria")!.prioritized, true);
  assert.equal(byName.get("Pediatria")!.attempts, 0);
  const gastro = byName.get("Gastroenterologia")!;
  assert.deepEqual([gastro.correct, gastro.attempts, gastro.prioritized], [0, 1, false]);
  const cardio = byName.get("Cardiologia")!;
  assert.deepEqual([cardio.correct, cardio.attempts], [12, 20]);
});

// ── wiring (source-level) ────────────────────────────────────────────────────

const src = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");

test("page: the phase subtitle is gone and the routine summary comes from the derived plan", () => {
  const page = src("app", "app", "plano", "page.tsx");
  assert.doesNotMatch(page, /Fase:|Fundação|interleaving/);
  assert.match(page, /<RoutineSummary\s+routine=\{plan\.routine\}\s+examDate=\{plan\.examDate\}/);
  const summary = src("app", "app", "plano", "routine-summary.tsx");
  assert.match(summary, /Sua rotina:/);
  assert.match(summary, /Prova considerada:/);
  assert.match(summary, /data estimada, ainda não confirmada/);
  assert.match(summary, /Editar meu plano/);
});

test("settings: one time field — no weekly hours, no 'Intensidade base', the reduction is kept", () => {
  const client = src("app", "app", "plano", "plano-client.tsx");
  assert.match(client, /Quanto tempo você pode estudar por dia\?/);
  assert.match(client, /Sua disponibilidade:/);
  assert.match(client, /Reduzir o tempo de estudo por um período/);
  assert.doesNotMatch(client, /Horas por semana|horas por semana|Intensidade base|type="range"/);
  const wizard = src("app", "app", "plano", "calibrate-wizard.tsx");
  assert.match(wizard, /Quanto tempo você pode estudar por dia\?/);
  assert.doesNotMatch(wizard, /Horas por semana|por semana você consegue|type="range"/);
  const actions = src("actions", "study-plan.ts");
  assert.doesNotMatch(actions, /weekly_hours|temp_intensity/);
});

test("today: what is left and what was done are named, and both are estimates", () => {
  const client = src("app", "app", "plano", "plano-client.tsx");
  assert.match(client, /Restante para hoje: aproximadamente/);
  assert.match(client, /Tempo realizado hoje \(estimativa\)/);
  assert.doesNotMatch(client, /min feitos/);
});

test("areas: Karina's wording for prioritised and excluded areas", () => {
  const client = src("app", "app", "plano", "plano-client.tsx");
  assert.match(client, /Áreas que você deseja priorizar/);
  assert.match(client, /Selecione as áreas em que sente mais dificuldade ou às quais deseja dedicar mais atenção\. As demais continuam participando do plano\./);
  assert.match(client, /Nenhuma área priorizada manualmente\. O plano segue os critérios automáticos de prioridade\./);
  assert.match(client, /Nenhuma área excluída\. Todas as áreas disponíveis serão consideradas no planejamento\./);
  assert.match(client, /não impede seu acesso livre/);
  assert.match(client, /A previsão considera apenas as áreas mantidas\./);
  assert.doesNotMatch(client, /prova R1|Especialidades fracas|plano cobre tudo/);
});

test("Onde focar: few answers are 'dados iniciais', none is 'Ainda sem respostas para avaliar'", () => {
  const client = src("app", "app", "plano", "plano-client.tsx");
  assert.match(client, /Ainda sem respostas para avaliar\./);
  assert.match(client, /— dados iniciais\./);
  assert.match(client, /s\.attempts === 1 \? "questão" : "questões"/);
  assert.doesNotMatch(client, /sem dados/);
});

test("quick tip: Karina's text, with no weekly hours — in the code fallback and in the patch", () => {
  const body = TIPS.plano.body;
  assert.equal(
    body,
    "Configure seus dias de estudo, o tempo disponível por dia e os conteúdos que deseja incluir. O Meu Plano organiza suas atividades por prioridade, inclui revisões e estima o que cabe até a prova. A programação se ajusta conforme seu progresso e as mudanças na sua disponibilidade.",
  );
  const sql = readFileSync(path.join(process.cwd(), "..", "schema-patch-plano-tempo-diario.sql"), "utf8");
  assert.ok(sql.includes(body), "the live row (site_content) gets the same text");
  assert.match(sql, /ON CONFLICT \(key\) DO UPDATE/);
});
