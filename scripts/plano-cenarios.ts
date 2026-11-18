/**
 * Meu Plano — validation scenarios (Karina 2026-11-17, "antes de publicar, valide com cenários de vários meses,
 * poucas semanas e tempo insuficiente, incluindo um aluno que perdeu dias de estudo").
 *
 * Runs the REAL plan engine (app/src/lib/study-plan) on the REAL content of a database (topics, links, sizes),
 * with synthetic students. Read-only: it never writes anything.
 *
 * For each scenario it (1) takes the forecast on day 0, (2) checks that no day — today or any future day — holds
 * more minutes than the student's time, and (3) makes the student FOLLOW the plan day by day until the exam and
 * compares what actually got done with what the forecast said.
 *
 * Run from the repo root (LOCAL database by default):
 *   node --import ./app/tests/helpers/alias-hook.mjs scripts/plano-cenarios.ts [<DATABASE_URL>] [--json out.json]
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import {
  derivePlan, defaultPrefs,
  type DerivedPlan, type Signals, type StudyPlanPrefs, type TopicRow, type PageRow,
  type TopicContentRow, type SpecialtyRow, type ContentType,
} from "@/lib/study-plan/derive";
import { buildTopicQuestionIndex, type TopicQuestionLink } from "@/lib/study-plan/topic-questions";
import { DEFAULT_PLAN_SETTINGS, settingsFromRow, type PlanSettings } from "@/lib/study-plan/settings";
import type { PaceMode } from "@/lib/study-plan/pace";
import type { QuestionReviewRow } from "@/lib/study-plan/review-outcomes";
import { runProgress, type SimuladoPage } from "@/lib/study-plan/simulado";
import { addDaysKey } from "@/lib/br-date";
import { availabilityLine, legacyDailyMinutes, studyDayNames } from "@/lib/study-plan/availability";
import { withFrozenTime } from "../app/tests/helpers/freeze-time";

const require = createRequire(import.meta.url);
const postgres = require("postgres");

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const url = args.find((a) => /^postgres(ql)?:\/\//.test(a)) ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = postgres(url, { max: 1, ssl: /127\.0\.0\.1|localhost/.test(url) ? false : "require" });

const TODAY = "2026-11-17"; // a Tuesday
const noonBRT = (dayKey: string) => `${dayKey}T15:00:00Z`;

type Content = {
  specialties: SpecialtyRow[];
  pages: PageRow[];
  topics: TopicRow[];
  topicContent: TopicContentRow[];
  questionCounts: Map<number, number>;
  links: TopicQuestionLink[];
  catalog: NonNullable<Signals["catalog"]>;
  /** Simulado pages with their questions (view study_plan_simulado_pages). */
  simuladoPages: Map<number, SimuladoPage>;
  settings: PlanSettings;
};

async function loadContent(): Promise<Content> {
  return sql.begin("read only", async (tx: typeof sql) => {
    const num = (v: unknown) => Number(v);
    const specialties = (await tx`select id, name, slug from specialties order by display_order`) as SpecialtyRow[];
    const pages = (await tx`select id, slug, title, type, specialty_id, track_id, content_module_id, view
                              from pages where status = 'publish' and specialty_id is not null order by id`)
      .map((p: Record<string, unknown>) => ({ ...p, id: num(p.id) })) as PageRow[];
    const topics = (await tx`select id, name, slug, specialty_id, source_page_id, incidence_count, priority_tier, is_pinned from topics`)
      .map((t: Record<string, unknown>) => ({ ...t, id: num(t.id), source_page_id: t.source_page_id == null ? null : num(t.source_page_id) })) as TopicRow[];
    const topicContent = (await tx`select topic_id, resource_type, page_id, question_filter, flashcard_group_id from topic_content order by id`)
      .map((c: Record<string, unknown>) => ({
        ...c, topic_id: num(c.topic_id), page_id: c.page_id == null ? null : num(c.page_id),
        flashcard_group_id: c.flashcard_group_id == null ? null : num(c.flashcard_group_id),
      })) as TopicContentRow[];
    const questionCounts = new Map<number, number>(
      (await tx`select page_id, question_count from quiz_page_question_counts`).map((r: Record<string, unknown>) => [num(r.page_id), num(r.question_count)]),
    );
    const links = (await tx`select topic_id, exam_question_id, question_id, page_id, is_primary from topic_question_links`)
      .map((r: Record<string, unknown>) => ({
        topic_id: num(r.topic_id), exam_question_id: num(r.exam_question_id), question_id: num(r.question_id),
        page_id: num(r.page_id), is_primary: Boolean(r.is_primary),
      })) as TopicQuestionLink[];
    const catalog = {
      flashcardGroupSizes: new Map<number, number>(
        (await tx`select group_id, cards from study_plan_flashcard_groups`).map((r: Record<string, unknown>) => [num(r.group_id), num(r.cards)]),
      ),
      revalidaUpPages: new Map<number, { lessonId: number; insights: number }>(
        (await tx`select page_id, lesson_id, insights from study_plan_revalida_up_pages`).map((r: Record<string, unknown>) => [
          num(r.page_id), { lessonId: num(r.lesson_id), insights: num(r.insights) },
        ]),
      ),
      medvoiceLessons: new Map<number, { durationSeconds: number | null }>(
        (await tx`select lesson_id, duration_seconds from study_plan_medvoice_lessons`).map((r: Record<string, unknown>) => [
          num(r.lesson_id), { durationSeconds: r.duration_seconds == null ? null : num(r.duration_seconds) },
        ]),
      ),
    };
    const simuladoPages = new Map<number, SimuladoPage>(
      (await tx`select page_id, slug, title, specialty_slug, is_mini, question_ids from study_plan_simulado_pages order by page_id`)
        .map((r: Record<string, unknown>) => [num(r.page_id), {
          pageId: num(r.page_id), slug: String(r.slug), title: String(r.title), specialtySlug: String(r.specialty_slug),
          isMini: r.is_mini === true, questionIds: (r.question_ids as unknown[]).map(Number),
        }]),
    );
    const row = (await tx`select * from study_plan_settings limit 1`)[0];
    return {
      specialties, pages, topics, topicContent, questionCounts, links, catalog, simuladoPages,
      settings: row ? settingsFromRow(row) : { ...DEFAULT_PLAN_SETTINGS },
    };
  });
}

// ── A synthetic student ───────────────────────────────────────────────────────
type Student = {
  prefs: StudyPlanPrefs;
  examDate: string;
  paceMode: PaceMode;
  /** Seconds this student really takes per question (drives the answer timestamps → learned pace). */
  secondsPerQuestion: number;
  attempts: Signals["quizAttempts"];
  completions: Signals["lessonCompletions"];
  seenByGroup: Map<number, number>;
  flashcardsToday: number;
  pauses: Signals["pauses"];
  /** Share of each study day's time the review queue asks for once the student has studied something. */
  reviewShare: number;
  /** Share of questions answered right on the first try. */
  firstTryAccuracy: number;
  /** The student's questions in the Revisão (every answered question is enrolled there). */
  review: Map<number, QuestionReviewRow>;
  /** Review items graded today (reset every morning). */
  reviewedToday: number;
  /** First-try answers given so far. */
  tries: number;
  /** Diagnostics collected while following the plan. */
  log: {
    zeroMinuteItems: number; duplicateRedo: number; daysOnlyRedo: number;
    /** Mini simulados: sessions begun / finished, the most ever open at once, answers beyond a simulado's 25. */
    simBegun: number; simFinished: number; simMaxOpen: number; simRepeatedAnswers: number;
    /** Days on which a NEW simulado was asked for while one was still in progress. */
    simNewWhileOpen: number;
    /** Days that showed a simulado split ("continue no próximo dia"). */
    simSplitDays: number;
  };
};

function newStudent(over: Partial<Student> & { prefs?: Partial<StudyPlanPrefs> } = {}): Student {
  return {
    examDate: "2027-05-30",
    paceMode: "standard",
    secondsPerQuestion: 150,
    attempts: [], completions: [], seenByGroup: new Map(), flashcardsToday: 0, pauses: [],
    reviewShare: 0.2,
    firstTryAccuracy: 0.8,
    review: new Map(), reviewedToday: 0, tries: 0,
    log: {
      zeroMinuteItems: 0, duplicateRedo: 0, daysOnlyRedo: 0,
      simBegun: 0, simFinished: 0, simMaxOpen: 0, simRepeatedAnswers: 0, simNewWhileOpen: 0, simSplitDays: 0,
    },
    ...over,
    prefs: { ...defaultPrefs(), ...(over.prefs ?? {}) },
  };
}

function planFor(c: Content, s: Student, dayKey: string): DerivedPlan {
  const index = buildTopicQuestionIndex(c.links);
  const studied = s.attempts.length > 0;
  const budgetGuess = s.prefs.daily_minutes;
  // The queue of the day: the usual load of old items + the questions currently wrong.
  const wrongDue = [...s.review.values()].filter((r) => r.repetitions === 0 && !r.suspended).length;
  const baseline = studied ? Math.round((budgetGuess * s.reviewShare * 60) / c.settings.reviewSecondsPerItem) : 0;
  const reviewDue = Math.max(0, baseline + wrongDue - s.reviewedToday);
  const signals: Signals = {
    quizAttempts: s.attempts,
    lessonCompletions: s.completions,
    reviewDueToday: reviewDue,
    lessonsByPageId: new Map(),
    pauses: s.pauses,
    questionCountsByPageId: c.questionCounts,
    topicIndex: index,
    catalog: c.catalog,
    flashcards: { seenByGroup: s.seenByGroup, paceSeconds: null, paceSamples: 0, attemptsToday: s.flashcardsToday },
    simulados: { pages: c.simuladoPages, runStarts: new Map() },
    questionReview: [...s.review.values()],
    reviewedToday: s.reviewedToday,
  };
  return withFrozenTime(noonBRT(dayKey), () =>
    derivePlan({
      prefs: s.prefs, cohort: { test_date: s.examDate }, specialties: c.specialties, pages: c.pages,
      topics: c.topics, topicContent: c.topicContent, signals, settings: c.settings, paceMode: s.paceMode,
    }));
}

const bits = (m: number) => { let n = 0; for (let i = 0; i < 7; i++) if (m & (1 << i)) n++; return n; };

/** The student does exactly what today's list says. */
function study(c: Content, s: Student, plan: DerivedPlan, dayKey: string): void {
  let clock = Date.parse(`${dayKey}T13:00:00Z`);
  const origins = new Map<number, TopicQuestionLink[]>(); // topic → one record per original
  for (const l of c.links) {
    const list = origins.get(l.topic_id) ?? [];
    if (!list.some((x) => x.exam_question_id === l.exam_question_id)) list.push(l);
    origins.set(l.topic_id, list);
  }
  const answered = new Set(s.attempts.map((a) => a.question_id));
  const enroll = (questionId: number, correct: boolean) =>
    s.review.set(questionId, { item_id: questionId, repetitions: correct ? 1 : 0, last_reviewed_at: new Date(clock).toISOString(), suspended: false });
  for (const item of plan.items) {
    if (item.href === "/app/revisao") {
      // The Revisão session: the questions currently wrong come back first and are answered right.
      const n = Number(item.title.match(/^(\d+)/)?.[1] ?? 0);
      clock += n * c.settings.reviewSecondsPerItem * 1000 + 5 * 60 * 1000;
      let fixed = 0;
      for (const r of s.review.values()) {
        if (fixed >= n) break;
        if (r.repetitions === 0 && !r.suspended) {
          r.repetitions = 1;
          r.last_reviewed_at = new Date(clock).toISOString();
          fixed++;
        }
      }
      s.reviewedToday += n;
      continue;
    }
    if (item.kind === "simulado") {
      // The student sits the mini simulado the block points at: the one in progress ("Continuar",
      // straight to its page) or a new one picked in the library. Like the player, it goes on from
      // the first unanswered question. The answers are what the plan reads the next day.
      const n = Math.round(item.estimatedMinutes / plan.pace.minutesPerQuestion);
      const page = item.pageId != null
        ? c.simuladoPages.get(item.pageId)!
        : [...c.simuladoPages.values()].find((p) => p.isMini && !s.attempts.some((a) => a.page_id === p.pageId))!;
      const mine = s.attempts.filter((a) => a.page_id === page.pageId);
      const done = runProgress(mine, page.questionIds, null).results;
      if (item.pageId == null) s.log.simBegun++;
      const left = page.questionIds.filter((q) => !done.has(q));
      if (n > left.length) s.log.simRepeatedAnswers += n - left.length;
      for (const q of left.slice(0, n)) {
        clock += s.secondsPerQuestion * 1000;
        s.attempts.push({
          specialty_id: null, is_correct: true, created_at: new Date(clock).toISOString(),
          page_id: page.pageId, question_id: q,
        });
      }
      if (left.length > 0 && n >= left.length) s.log.simFinished++;
      continue;
    }
    if (item.topicId == null) continue; // review / memorecards: time only
    const topic = c.topics.find((t) => t.id === item.topicId)!;
    if (item.kind === "quiz") {
      const mine = origins.get(topic.id) ?? [];
      const units = Math.round(item.units ?? 0);
      const pending = mine.filter((l) => !answered.has(l.question_id));
      if (pending.length > 0) {
        for (const l of pending.slice(0, units)) {
          clock += s.secondsPerQuestion * 1000;
          s.tries++;
          // Deterministic spread of right/wrong at the student's first-try accuracy.
          const correct = Math.floor(s.tries * s.firstTryAccuracy) > Math.floor((s.tries - 1) * s.firstTryAccuracy);
          s.attempts.push({
            specialty_id: topic.specialty_id, is_correct: correct,
            created_at: new Date(clock).toISOString(), page_id: l.page_id, question_id: l.question_id,
          });
          enroll(l.question_id, correct);
          answered.add(l.question_id);
        }
      } else {
        // Everything answered but below 70%: redo the ones still wrong (right this time).
        const latest = new Map<number, boolean>();
        for (const a of s.attempts) if (a.question_id != null) latest.set(a.question_id, a.is_correct);
        for (const l of mine.filter((x) => latest.get(x.question_id) === false).slice(0, units)) {
          clock += s.secondsPerQuestion * 1000;
          s.attempts.push({
            specialty_id: topic.specialty_id, is_correct: true,
            created_at: new Date(clock).toISOString(), page_id: l.page_id, question_id: l.question_id,
          });
          enroll(l.question_id, true);
        }
      }
    } else if (item.kind === "flashcards") {
      const link = c.topicContent.find((t) => t.topic_id === topic.id && t.resource_type === "flashcards");
      const g = Number(link?.flashcard_group_id);
      const units = Math.round(item.units ?? 0);
      s.seenByGroup.set(g, (s.seenByGroup.get(g) ?? 0) + units);
      s.flashcardsToday += units;
    } else if (item.kind === "revalida_up") {
      const info = c.catalog.revalidaUpPages.get(item.pageId as number);
      if (info) s.completions.push({ lesson_id: info.lessonId, page_id: item.pageId as number, completed_at: new Date(clock).toISOString() });
    } else if (item.kind === "audio") {
      const link = c.topicContent.find((t) => t.topic_id === topic.id && t.resource_type === "medvoice");
      const lessonId = Number((link?.question_filter as { lesson_id?: unknown } | null)?.lesson_id);
      if (lessonId) s.completions.push({ lesson_id: lessonId, page_id: item.pageId as number, completed_at: new Date(clock).toISOString() });
    }
  }
}

/** Mini simulados the student has begun and not finished. */
function openSimulados(c: Content, s: Student): number {
  const perPage = new Map<number, Set<number>>();
  for (const a of s.attempts) {
    const p = c.simuladoPages.get(a.page_id);
    if (!p?.isMini || a.question_id == null) continue;
    const set = perPage.get(a.page_id) ?? new Set<number>();
    set.add(a.question_id);
    perPage.set(a.page_id, set);
  }
  let open = 0;
  for (const [pageId, set] of perPage) if (set.size < c.simuladoPages.get(pageId)!.questionIds.length) open++;
  return open;
}

type Check = { name: string; ok: boolean; detail: string };

/** No day — today or any future one — holds more minutes than the student's time. */
function checkBudget(plan: DerivedPlan): Check {
  let worst = 0;
  let worstDay = "";
  for (const d of plan.scheduleDays) {
    const over = d.review + d.simulado + d.content - d.available;
    if (over > worst) { worst = over; worstDay = d.key; }
  }
  const todayOver = plan.totalEstimatedMinutes - (plan.todayBudgetMinutes - Math.min(plan.todayBudgetMinutes, plan.todayDoneMinutes));
  return {
    name: "Nenhum dia passa do tempo disponível",
    ok: worst <= 0.01 && todayOver <= 1,
    detail: `${plan.scheduleDays.length} dias de estudo conferidos; maior excesso ${worst.toFixed(2)} min${worstDay ? ` (${worstDay})` : ""}; hoje ${plan.totalEstimatedMinutes} de ${plan.todayBudgetMinutes} min`,
  };
}

function summary(plan: DerivedPlan) {
  const f = plan.forecast!;
  return {
    phase: plan.phase, daysToExam: plan.daysToExam,
    todayMinutes: plan.totalEstimatedMinutes, todayBudget: plan.todayBudgetMinutes,
    todayItems: plan.items.map((i) => `${i.kind}: ${i.title} — ${i.subtitle} (~${i.estimatedMinutes} min)`),
    pendingTopics: f.pendingTopics, expectedTopics: f.expectedTopics, notExpected: f.notExpected.length,
    completedTopics: f.completedTopics, partialTopics: f.partialTopics, inReviewTopics: f.inReviewTopics,
    scheduledHours: +(f.scheduledMinutes / 60).toFixed(1),
    studyDaysLeft: f.studyDaysLeft, minutesPerStudyDay: f.minutesPerStudyDay,
    pendingHours: +(f.pendingMinutes / 60).toFixed(1), capacityHours: +(f.capacityMinutes / 60).toFixed(1),
    finishDay: f.finishDay, hints: f.hints,
    notExpectedByTier: f.notExpected.reduce<Record<string, number>>((m, t) => { const k = t.tier ?? "—"; m[k] = (m[k] ?? 0) + 1; return m; }, {}),
    questionsPerHour: plan.pace.questionsPerHour, paceSource: plan.pace.source,
  };
}

/** Follow the plan from `from` until the eve of the exam (or `until`), studying every study day. */
function followPlan(c: Content, s: Student, from: string, until?: string): { last: string; checks: Check[] } {
  const end = until ?? addDaysKey(s.examDate, -1);
  let worst: Check | null = null;
  for (let day = from; day <= end; day = addDaysKey(day, 1)) {
    s.flashcardsToday = 0; // a new day
    s.reviewedToday = 0;
    const plan = planFor(c, s, day);
    // Karina's check (questions below 70%): never a zero-length item, never the same
    // wrong questions asked by the plan AND by the Revisão.
    for (const it of plan.items) {
      if (it.estimatedMinutes <= 0) s.log.zeroMinuteItems++;
      if (it.kind === "quiz" && /revise os erros/.test(it.subtitle)) s.log.duplicateRedo++;
    }
    if (process.env.DEBUG_PLANO === "days") {
      console.log(`  ${day} ${plan.phase} ${plan.totalEstimatedMinutes}/${plan.todayBudgetMinutes} done=${plan.todayDoneMinutes} :: ` +
        plan.items.map((i) => `${i.kind}${i.topicId ? `#${i.topicId}` : ""}(${i.estimatedMinutes})`).join(" "));
    }
    const chk = checkBudget(plan);
    if (!chk.ok && !worst) worst = { ...chk, detail: `${day}: ${chk.detail}` };
    // Mini simulados: how many are open this morning, and what the plan asks about them.
    const open = openSimulados(c, s);
    s.log.simMaxOpen = Math.max(s.log.simMaxOpen, open);
    const sims = plan.items.filter((i) => i.kind === "simulado");
    if (open > 0 && sims.some((i) => i.pageId == null) && !sims.some((i) => i.pageId != null)) s.log.simNewWhileOpen++;
    if (sims.some((i) => (i.lines ?? []).some((l) => /Continue no próximo dia de estudo/.test(l)))) s.log.simSplitDays++;
    if (process.env.DEBUG_PLANO === "sim" && sims.length) {
      console.log(`  ${day} (${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(day + "T12:00:00Z").getUTCDay()]}) abertos=${open} :: ` +
        sims.map((i) => `${i.title} [${(i.lines ?? []).join(" | ")}] ~${i.estimatedMinutes} min`).join("  +  "));
    }
    if (!plan.paused) study(c, s, plan, day);
  }
  return { last: end, checks: worst ? [worst] : [] };
}

const SIX_DAYS = 0b1111110; // Mon–Sat
const THREE_DAYS = (1 << 1) | (1 << 3) | (1 << 5); // Mon, Wed, Fri

/**
 * Hypothesis run (Karina 2026-11-18): the same availability scenarios with a SIMULATED exam date, counted from a given
 * day. Nothing is read from or written to any turma — the date exists only inside this run.
 *   … plano-cenarios.ts [<DATABASE_URL>] --hipotese 2027-04-15 [--hoje 2026-11-18] [--json out.json]
 */
function hipotese(c: Content, exam: string, start: string): Record<string, unknown> {
  const all: ContentType[] = ["quiz", "simulado", "revalida_up", "flashcards", "audio", "memorecards"];
  const noSim = all.filter((t) => t !== "simulado");
  const DAYS: { label: string; mask: number; n: number }[] = [
    { label: "segunda, quarta e sexta", mask: THREE_DAYS, n: 3 },
    { label: "segunda a sexta", mask: 0b0111110, n: 5 },
    { label: "segunda a sábado", mask: SIX_DAYS, n: 6 },
  ];
  const eve = addDaysKey(exam, -1);
  type Row = Record<string, string | number | null>;
  /** Day-0 forecast, then the student follows the plan to the eve of the exam. `steps` may change things on the way. */
  const simulate = (
    prefs: Partial<StudyPlanPrefs>,
    over: Partial<Student> = {},
    steps: { until: string; then?: (s: Student) => void; resume?: string }[] = [],
  ) => {
    const s = newStudent({ examDate: exam, ...over, prefs: { preferred_content_types: all, ...prefs } });
    const day0 = planFor(c, s, start);
    const f0 = day0.forecast!;
    let from = start;
    for (const st of steps) {
      followPlan(c, s, from, st.until);
      st.then?.(s);
      from = st.resume ?? addDaysKey(st.until, 1);
    }
    followPlan(c, s, from);
    s.flashcardsToday = 0; s.reviewedToday = 0;
    const end = planFor(c, s, eve).forecast!;
    const done = end.completedTopics + end.inReviewTopics;
    const leftScope = Math.max(0, f0.pendingTopics - (done + end.pendingTopics));
    return {
      day0, f0,
      row: {
        temas: f0.pendingTopics,
        previstosIntegral: f0.expectedTopics,
        previstosParcial: f0.partialTopics,
        horasPendentes: +(f0.pendingMinutes / 60).toFixed(0),
        horasProgramadas: +(f0.scheduledMinutes / 60).toFixed(0),
        diasDeEstudo: f0.studyDaysLeft,
        concluidos: done,
        pendentesNaVespera: end.pendingTopics,
        foraDoEscopo: leftScope,
        miniSimuladosFeitos: s.log.simFinished,
      } as Row,
    };
  };

  // 1. The grid: hours per day × days per week (new student, every material, automatic mini simulados).
  const grid: Row[] = [];
  for (const d of DAYS) {
    for (const minutes of [30, 60, 90, 120, 180, 240, 300]) {
      const r = simulate({ daily_minutes: minutes, available_days: d.mask });
      grid.push({ horasPorDia: minutes / 60, minutosPorDia: minutes, diasPorSemana: d.n, dias: d.label, ...r.row });
    }
  }

  // 2. The daily time that gives every topic a full conclusion in the forecast, for 5 and 6 days a week.
  const needed: Row[] = [];
  for (const d of DAYS.filter((x) => x.n >= 5)) {
    let found: number | null = null;
    for (let minutes = 60; minutes <= 600; minutes += 15) {
      const s = newStudent({ examDate: exam, prefs: { preferred_content_types: all, daily_minutes: minutes, available_days: d.mask } });
      const f = planFor(c, s, start).forecast!;
      if (f.expectedTopics >= f.pendingTopics) { found = minutes; break; }
    }
    const check = found != null ? simulate({ daily_minutes: found, available_days: d.mask }).row : null;
    needed.push({ diasPorSemana: d.n, dias: d.label, minutosPorDia: found, concluidosNaSimulacao: check ? check.concluidos : null, temas: check ? check.temas : null });
  }

  // 3. Variations on one reference routine where time is the limit (1 h a day, Monday to Friday), so each
  //    factor's effect on the coverage can be seen.
  const ref = { daily_minutes: 60, available_days: 0b0111110 };
  const variations: Row[] = [];
  const add = (grupo: string, variacao: string, r: { row: Row }) => variations.push({ grupo, variacao, ...r.row });
  add("Referência", "1 h por dia, segunda a sexta, mini simulados na frequência automática", simulate(ref));
  add("Revisão", "Revisão ocupando cerca de 10% do dia", simulate(ref, { reviewShare: 0.1 }));
  add("Revisão", "Revisão ocupando cerca de 20% do dia (referência)", simulate(ref, { reviewShare: 0.2 }));
  add("Revisão", "Revisão ocupando cerca de 40% do dia", simulate(ref, { reviewShare: 0.4 }));
  add("Revisão", "Aluno que acerta 55% na primeira tentativa (mais questões voltam pela Revisão)", simulate(ref, { firstTryAccuracy: 0.55 }));
  add("Mini simulados", "Sem mini simulados no plano", simulate({ ...ref, preferred_content_types: noSim }));
  add("Mini simulados", "Frequência automática", simulate({ ...ref, simulado_frequency: "auto" }));
  add("Mini simulados", "1 por semana", simulate({ ...ref, simulado_frequency: 1 }));
  add("Mini simulados", "2 por semana", simulate({ ...ref, simulado_frequency: 2 }));
  const w = (n: number) => addDaysKey(start, n * 7);
  add("Dias perdidos", "2 semanas sem estudar (da 5ª à 6ª semana), sem avisar o plano",
    simulate(ref, {}, [{ until: addDaysKey(w(4), -1), resume: w(6) }]));
  add("Dias perdidos", "4 semanas sem estudar (da 5ª à 8ª semana), sem avisar o plano",
    simulate(ref, {}, [{ until: addDaysKey(w(4), -1), resume: w(8) }]));
  add("Mudança de disponibilidade", "Começa com 1 h por dia e passa a 2 h por dia depois de 4 semanas",
    simulate(ref, {}, [{ until: addDaysKey(w(4), -1), then: (s) => { s.prefs.daily_minutes = 120; } }]));
  add("Mudança de disponibilidade", "Começa com 2 h por dia e cai para 1 h por dia depois de 8 semanas",
    simulate({ ...ref, daily_minutes: 120 }, {}, [{ until: addDaysKey(w(8), -1), then: (s) => { s.prefs.daily_minutes = 60; } }]));
  add("Mudança de disponibilidade", "Começa de segunda a sexta e passa a estudar também aos sábados depois de 4 semanas",
    simulate(ref, {}, [{ until: addDaysKey(w(4), -1), then: (s) => { s.prefs.available_days = SIX_DAYS; } }]));

  return { exam, start, daysToExam: planFor(c, newStudent({ examDate: exam }), start).daysToExam, grid, needed, variations };
}

async function main() {
  const c = await loadContent();
  await sql.end();
  const hAt = args.indexOf("--hipotese");
  if (hAt >= 0) {
    const tAt = args.indexOf("--hoje");
    const out = hipotese(c, args[hAt + 1], tAt >= 0 ? args[tAt + 1] : TODAY);
    const cols = (r: Record<string, unknown>) => Object.entries(r).map(([k, v]) => `${k}=${v}`).join(" · ");
    console.log(`Hipótese: prova em ${out.exam}, contando de ${out.start} (${out.daysToExam} dias)`);
    for (const r of out.grid as Record<string, unknown>[]) console.log("  grade   " + cols(r));
    for (const r of out.needed as Record<string, unknown>[]) console.log("  carga   " + cols(r));
    for (const r of out.variations as Record<string, unknown>[]) console.log("  variação " + cols(r));
    if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
    process.exit(0);
  }
  const report: Record<string, unknown>[] = [];
  const all: ContentType[] = ["quiz", "simulado", "revalida_up", "flashcards", "audio", "memorecards"];

  const run = (title: string, description: string, mk: () => Student, extra?: (s: Student, out: Record<string, unknown>, checks: Check[]) => void) => {
    const s = mk();
    const day0 = planFor(c, s, TODAY);
    const checks: Check[] = [checkBudget(day0)];
    const out: Record<string, unknown> = { title, description, day0: summary(day0) };
    const expectedIds = new Set(
      c.topics.map((t) => t.id).filter((id) => !day0.forecast!.notExpected.some((n) => n.id === id)),
    );
    // Follow the plan to the eve of the exam, then look at what is left.
    const f = followPlan(c, s, TODAY);
    checks.push(...f.checks);
    s.flashcardsToday = 0; s.reviewedToday = 0;
    // Where the student stands on the eve of the exam, after the last study day.
    const end = planFor(c, s, addDaysKey(s.examDate, -1));
    const stillPending = end.forecast!.pendingTopics;
    const missed = end.forecast!.notExpected.filter((t) => expectedIds.has(t.id)).length;
    if (process.env.DEBUG_PLANO) {
      console.log(`DEBUG ${title} — list on the eve of the exam:`);
      const eve = planFor(c, s, addDaysKey(s.examDate, -1));
      for (const it of eve.items) console.log(`   ${it.kind} t=${it.topicId} u=${it.units} ${it.title} — ${it.subtitle} (${it.estimatedMinutes})`);
      console.log(`   done=${eve.todayDoneMinutes} budget=${eve.todayBudgetMinutes} paused=${eve.paused}`);
    }
    out.followed = {
      completedTopicsAtExam: end.forecast!.completedTopics,
      pendingTopicsAtExam: stillPending,
      forecastExpected: day0.forecast!.expectedTopics,
      expectedButNotDone: missed,
    };
    // Forecast vs execution (Karina 2026-11-17): the forecast must not promise more than the
    // student gets done, and must not underestimate it by much either. Topics that left the
    // scope on the way (MedVoice-only topics once the foundation phase ends) are discounted.
    const leftScope = day0.forecast!.pendingTopics - (end.forecast!.completedTopics + end.forecast!.inReviewTopics + stillPending);
    const done = end.forecast!.completedTopics + end.forecast!.inReviewTopics;
    const expected0 = day0.forecast!.expectedTopics - Math.max(0, leftScope);
    out.followed = { ...(out.followed as object), done, expected: expected0 };
    checks.push({
      name: "Previsão × execução: seguindo o plano, o aluno conclui o que foi previsto, sem grande subestimação",
      ok: done >= expected0 - 2 && (expected0 === 0 ? done <= 3 : done <= Math.ceil(expected0 * 1.25) + 2),
      detail: `previstos no dia 0: ${expected0}; concluídos na véspera da prova: ${done} (${stillPending} ainda pendentes)`,
    });
    checks.push({
      name: "Nenhuma atividade de duração zero; questões abaixo de 70% não são pedidas em duplicidade com a Revisão",
      ok: s.log.zeroMinuteItems === 0 && s.log.duplicateRedo === 0,
      detail: `itens de duração zero: ${s.log.zeroMinuteItems}; pedidos duplicados: ${s.log.duplicateRedo}`,
    });
    out.end = summary(end);
    extra?.(mk(), out, checks);
    out.checks = checks;
    report.push(out);
  };

  run("1. Vários meses", "Prova em 30/05/2027 (194 dias). 60 min por dia, segunda a sábado. Todos os materiais. Aluno novo.",
    () => newStudent({ prefs: { available_days: SIX_DAYS, preferred_content_types: all } }));

  run("2. Poucas semanas", "Prova em 08/12/2026 (21 dias). 120 min por dia, todos os dias. Todos os materiais. Aluno novo.",
    () => newStudent({ examDate: "2026-12-08", prefs: { daily_minutes: 120, preferred_content_types: all } }));

  run("3. Tempo insuficiente", "Prova em 17/12/2026 (30 dias). 30 min por dia, segunda, quarta e sexta. Todos os materiais. Aluno novo.",
    () => newStudent({ examDate: "2026-12-17", prefs: { daily_minutes: 30, available_days: THREE_DAYS, preferred_content_types: all } }));

  run("6. Desempenho abaixo de 70%", "Como o cenário 1, mas o aluno acerta só 55% das questões na primeira tentativa. As questões erradas voltam pela Revisão.",
    () => newStudent({ firstTryAccuracy: 0.55, prefs: { available_days: SIX_DAYS, preferred_content_types: all } }));

  // 4. Missed days: study 3 weeks, miss 2 weeks, come back.
  {
    const s = newStudent({ prefs: { available_days: SIX_DAYS, preferred_content_types: all } });
    const checks: Check[] = [];
    const day0 = planFor(c, s, TODAY);
    const f1 = followPlan(c, s, TODAY, addDaysKey(TODAY, 20));
    checks.push(...f1.checks);
    s.flashcardsToday = 0; s.reviewedToday = 0;
    const beforeGap = planFor(c, s, addDaysKey(TODAY, 21));
    const afterGap = planFor(c, s, addDaysKey(TODAY, 35)); // 14 days without studying
    checks.push(checkBudget(afterGap));
    checks.push({
      name: "Dias perdidos não apagam o progresso",
      ok: afterGap.forecast!.completedTopics === beforeGap.forecast!.completedTopics &&
          afterGap.forecast!.pendingMinutes === beforeGap.forecast!.pendingMinutes,
      detail: `temas concluídos ${beforeGap.forecast!.completedTopics} → ${afterGap.forecast!.completedTopics}; horas pendentes ${(beforeGap.forecast!.pendingMinutes / 60).toFixed(1)} → ${(afterGap.forecast!.pendingMinutes / 60).toFixed(1)}`,
    });
    checks.push({
      name: "A previsão é recalculada com os dias que restam",
      ok: afterGap.forecast!.studyDaysLeft < beforeGap.forecast!.studyDaysLeft &&
          afterGap.forecast!.capacityMinutes < beforeGap.forecast!.capacityMinutes,
      detail: `dias de estudo restantes ${beforeGap.forecast!.studyDaysLeft} → ${afterGap.forecast!.studyDaysLeft}; previstos ${beforeGap.forecast!.expectedTopics}/${beforeGap.forecast!.pendingTopics} → ${afterGap.forecast!.expectedTopics}/${afterGap.forecast!.pendingTopics}`,
    });
    // Changing availability / exam date / materials re-forecasts without touching progress.
    const fewerDays = planFor(c, { ...s, prefs: { ...s.prefs, available_days: THREE_DAYS } }, addDaysKey(TODAY, 35));
    const laterExam = planFor(c, { ...s, examDate: "2027-09-12" }, addDaysKey(TODAY, 35));
    const noFlash = planFor(c, { ...s, prefs: { ...s.prefs, preferred_content_types: all.filter((t) => t !== "flashcards") } }, addDaysKey(TODAY, 35));
    checks.push({
      name: "Mudar disponibilidade, data da prova ou materiais recalcula a previsão e preserva o progresso",
      ok: fewerDays.forecast!.expectedTopics <= afterGap.forecast!.expectedTopics &&
          laterExam.forecast!.expectedTopics >= afterGap.forecast!.expectedTopics &&
          noFlash.forecast!.pendingMinutes < afterGap.forecast!.pendingMinutes &&
          fewerDays.forecast!.pendingMinutes === afterGap.forecast!.pendingMinutes,
      detail: `3 dias/semana: ${fewerDays.forecast!.expectedTopics}/${fewerDays.forecast!.pendingTopics}; prova em 12/09/2027: ${laterExam.forecast!.expectedTopics}/${laterExam.forecast!.pendingTopics}; sem Flashcards: ${noFlash.forecast!.expectedTopics}/${noFlash.forecast!.pendingTopics} (${(noFlash.forecast!.pendingMinutes / 60).toFixed(1)} h pendentes)`,
    });
    report.push({
      title: "4. Aluno que perdeu dias de estudo",
      description: "Mesmo aluno do cenário 1: estuda 3 semanas seguindo o plano, fica 14 dias sem estudar e volta.",
      day0: summary(day0), beforeGap: summary(beforeGap), afterGap: summary(afterGap), checks,
    });
  }

  // 5. A fast student on "Automático": the plan learns the pace and fills the same time with more content.
  {
    const base = () => newStudent({ prefs: { available_days: SIX_DAYS, preferred_content_types: all } });
    const standard = base();
    const fast = { ...base(), paceMode: "auto" as PaceMode, secondsPerQuestion: 80 };
    followPlan(c, standard, TODAY, addDaysKey(TODAY, 13));
    followPlan(c, fast, TODAY, addDaysKey(TODAY, 13));
    standard.flashcardsToday = 0; fast.flashcardsToday = 0; standard.reviewedToday = 0; fast.reviewedToday = 0;
    const a = planFor(c, standard, addDaysKey(TODAY, 14));
    const b = planFor(c, fast, addDaysKey(TODAY, 14));
    report.push({
      title: "5. Ritmo automático",
      description: "Dois alunos iguais (60 min por dia, segunda a sábado) por 2 semanas: um no ritmo padrão (2,5 min por questão), outro respondendo em 80 s por questão com o ritmo em Automático.",
      standard: summary(a), fast: summary(b),
      checks: [
        checkBudget(b),
        {
          name: "O plano aprende o ritmo do aluno rápido e coloca mais conteúdo no mesmo tempo",
          ok: b.pace.source === "learned" && b.pace.questionsPerHour > a.pace.questionsPerHour &&
              b.forecast!.completedTopics >= a.forecast!.completedTopics,
          detail: `questões por hora: padrão ${a.pace.questionsPerHour}, aluno rápido ${b.pace.questionsPerHour}; questões respondidas em 2 semanas: ${standard.attempts.length} × ${fast.attempts.length}; temas concluídos: ${a.forecast!.completedTopics} × ${b.forecast!.completedTopics}`,
        },
      ],
    });
  }

  // ── Mini simulados (Karina 2026-11-17, second round) ───────────────────────────────────────
  const FIVE_DAYS = 0b0111110; // Mon–Fri
  const simChecks = (s: Student, f: { checks: Check[] }): Check[] => [
    ...f.checks,
    {
      name: "Todo mini simulado iniciado é continuado de onde parou, sem perder o progresso",
      ok: s.log.simFinished >= s.log.simBegun - 1 && s.log.simMaxOpen <= 1,
      detail: `iniciados: ${s.log.simBegun}; concluídos: ${s.log.simFinished}; máximo em andamento ao mesmo tempo: ${s.log.simMaxOpen}`,
    },
    {
      name: "A mesma atividade não é programada duas vezes",
      ok: s.log.simRepeatedAnswers === 0 && s.log.simNewWhileOpen === 0,
      detail: `questões pedidas além das 25 de um simulado: ${s.log.simRepeatedAnswers}; dias com um novo simulado pedido havendo um em andamento: ${s.log.simNewWhileOpen}`,
    },
  ];

  // 7. A day shorter than the simulado: it is split between study days and continued.
  {
    const mk = () => newStudent({ examDate: "2026-12-29", prefs: { daily_minutes: 30, available_days: FIVE_DAYS, preferred_content_types: all, simulado_frequency: 1 } });
    const s = mk();
    const day0 = planFor(c, s, TODAY);
    const f = followPlan(c, s, TODAY);
    const weeks = 6;
    report.push({
      title: "7. Mini simulado dividido entre dias",
      description: "Prova em 29/12/2026 (42 dias). 30 min por dia, segunda a sexta (150 min por semana). Frequência escolhida: 1 por semana (62 min). Cada sessão é dividida em dias seguidos.",
      day0: summary(day0), simulado: s.log,
      checks: [
        checkBudget(day0),
        ...simChecks(s, f),
        {
          name: "A sessão que não cabe em um dia é dividida e mostra o tempo do dia e a duração total",
          ok: s.log.simSplitDays > 0 && s.log.simFinished >= weeks - 1,
          detail: `dias com o aviso "Continue no próximo dia de estudo": ${s.log.simSplitDays}; mini simulados concluídos em ${weeks} semanas: ${s.log.simFinished}`,
        },
      ],
    });
  }

  // 8. Two a week with short days: a session begun in one week ends in the next.
  {
    const s = newStudent({ examDate: "2026-12-29", prefs: { daily_minutes: 30, available_days: FIVE_DAYS, preferred_content_types: all, simulado_frequency: 2 } });
    const day0 = planFor(c, s, TODAY);
    // Follow day by day, noting every Monday on which a simulado begun the week before is still open.
    let carriedMondays = 0;
    let carriedMondaysWithNew = 0;
    const end = addDaysKey(s.examDate, -1);
    const checks: Check[] = [checkBudget(day0)];
    for (let day = TODAY; day <= end; day = addDaysKey(day, 1)) {
      s.flashcardsToday = 0; s.reviewedToday = 0;
      const isMonday = new Date(day + "T12:00:00Z").getUTCDay() === 1;
      if (isMonday && openSimulados(c, s) > 0) {
        carriedMondays++;
        const p = planFor(c, s, day);
        const sims = p.items.filter((i) => i.kind === "simulado");
        if (sims.length !== 1 || sims[0].pageId == null) carriedMondaysWithNew++;
      }
      const f = followPlan(c, s, day, day);
      checks.push(...f.checks);
    }
    report.push({
      title: "8. Mini simulado que começa em uma semana e termina na seguinte",
      description: "Prova em 29/12/2026 (42 dias). 30 min por dia, segunda a sexta. Frequência escolhida: 2 por semana (125 dos 150 min da semana). A segunda sessão da semana não cabe até sexta e continua na segunda-feira.",
      day0: summary(day0), simulado: s.log,
      checks: [
        ...simChecks(s, { checks }),
        {
          name: "Na semana seguinte o plano pede só as questões que faltam, sem abrir outro simulado no lugar",
          ok: carriedMondays > 0 && carriedMondaysWithNew === 0,
          detail: `segundas-feiras com um simulado da semana anterior em andamento: ${carriedMondays}; nelas, com um simulado novo pedido junto: ${carriedMondaysWithNew}`,
        },
      ],
    });
  }

  // 9. Frequency × availability: what each choice costs, and the one that is not viable.
  {
    const mk = (freq: "auto" | 1 | 2) => newStudent({
      examDate: "2026-12-17", prefs: { daily_minutes: 30, available_days: THREE_DAYS, preferred_content_types: all, simulado_frequency: freq },
    });
    const auto = planFor(c, mk("auto"), TODAY);
    const one = planFor(c, mk(1), TODAY);
    const two = planFor(c, mk(2), TODAY);
    const opt = (f: "auto" | 1 | 2) => auto.simulado.options.find((o) => o.frequency === f)!;
    report.push({
      title: "9. Frequência escolhida × disponibilidade",
      description: "Prova em 17/12/2026 (30 dias). 30 min por dia, segunda, quarta e sexta (90 min por semana). Um mini simulado = 62 min.",
      day0: summary(auto),
      options: auto.simulado.options,
      checks: [
        checkBudget(auto), checkBudget(one), checkBudget(two),
        {
          name: "Automática respeita a referência de 25% do tempo semanal",
          ok: opt("auto").weeklyMinutes <= 0.25 * auto.simulado.weeklyStudyMinutes + 0.01,
          detail: `1 mini simulado a cada ${opt("auto").everyWeeks} semanas = ${opt("auto").weeklyMinutes.toFixed(1)} min por semana de ${auto.simulado.weeklyStudyMinutes} min`,
        },
        {
          name: "1 por semana cabe: o impacto na previsão é calculado antes da confirmação e é o que o plano passa a mostrar",
          ok: opt(1).feasible && opt(1).expectedTopics === one.forecast!.expectedTopics && one.simulado.inForce === 1,
          detail: `ocupa ${opt(1).weeklyMinutes.toFixed(1)} dos ${auto.simulado.weeklyStudyMinutes} min da semana; previstos até a prova: de ${opt("auto").expectedTopics} para ${opt(1).expectedTopics} dos ${auto.simulado.pendingTopics} temas pendentes; horas programadas: ${(auto.forecast!.scheduledMinutes / 60).toFixed(1)} → ${(one.forecast!.scheduledMinutes / 60).toFixed(1)}`,
        },
        {
          name: "2 por semana ultrapassa toda a disponibilidade semanal: não é apresentada como viável nem usada",
          ok: !opt(2).feasible && opt(2).expectedTopics === null && two.simulado.inForce === "auto" && two.simulado.chosen === 2 &&
              two.forecast!.expectedTopics === auto.forecast!.expectedTopics,
          detail: `${opt(2).weeklyMinutes.toFixed(1)} min de mini simulados para ${auto.simulado.weeklyStudyMinutes} min de estudo por semana; se já estava salva, o plano usa a automática e avisa`,
        },
      ],
    });
  }

  // 10. A simulado taken outside the schedule: counted once, nothing lost.
  {
    const s = newStudent({ examDate: "2026-12-29", prefs: { available_days: SIX_DAYS, preferred_content_types: all } });
    followPlan(c, s, TODAY, addDaysKey(TODAY, 7)); // a week of study: this week's simulado is done
    const day = addDaysKey(TODAY, 9); // Thursday of the second week — not a simulado day
    s.flashcardsToday = 0; s.reviewedToday = 0;
    followPlan(c, s, addDaysKey(TODAY, 8), addDaysKey(TODAY, 8));
    s.flashcardsToday = 0; s.reviewedToday = 0;
    const before = planFor(c, s, day);
    // The student opens the library and takes a whole extra mini simulado.
    const extra = [...c.simuladoPages.values()].find((p) => p.isMini && !s.attempts.some((a) => a.page_id === p.pageId))!;
    let clock = Date.parse(`${day}T12:00:00Z`);
    for (const q of extra.questionIds) {
      clock += s.secondsPerQuestion * 1000;
      s.attempts.push({ specialty_id: null, is_correct: true, created_at: new Date(clock).toISOString(), page_id: extra.pageId, question_id: q });
    }
    const after = planFor(c, s, day);
    const simMin = extra.questionIds.length * after.pace.minutesPerQuestion;
    report.push({
      title: "10. Mini simulado feito fora da programação",
      description: "60 min por dia, segunda a sábado. Em um dia sem simulado programado, o aluno faz um mini simulado inteiro por conta própria na biblioteca.",
      before: summary(before), after: summary(after),
      checks: [
        checkBudget(after),
        {
          name: "O tempo do simulado entra uma única vez na carga do dia",
          ok: Math.abs((after.todayDoneMinutes - before.todayDoneMinutes) - simMin) <= 1,
          detail: `tempo do dia já usado: ${before.todayDoneMinutes} → ${after.todayDoneMinutes} min (o simulado: ${simMin} min, estimado pelas ${extra.questionIds.length} respostas × ritmo)`,
        },
        {
          name: "O que deixou de caber continua pendente e é replanejado; o histórico é preservado",
          ok: after.forecast!.pendingMinutes === before.forecast!.pendingMinutes &&
              after.forecast!.completedTopics === before.forecast!.completedTopics &&
              after.totalEstimatedMinutes <= Math.max(0, before.totalEstimatedMinutes - Math.floor(simMin) + 1),
          detail: `horas pendentes ${(before.forecast!.pendingMinutes / 60).toFixed(1)} → ${(after.forecast!.pendingMinutes / 60).toFixed(1)}; temas concluídos ${before.forecast!.completedTopics} → ${after.forecast!.completedTopics}; plano de hoje ${before.totalEstimatedMinutes} → ${after.totalEstimatedMinutes} min`,
        },
        {
          name: "O simulado extra não é pedido de novo nem substitui a liberdade de fazer outros",
          ok: !after.items.some((i) => i.kind === "simulado"),
          detail: `blocos de simulado no plano depois do simulado extra: ${after.items.filter((i) => i.kind === "simulado").length}`,
        },
      ],
    });
  }

  // ── Third round (Karina 2026-11-17, 23h06) ──────────────────────────────────────────────────────
  const dow = (day: string) => new Date(day + "T12:00:00Z").getUTCDay();
  const simBlocks = (p: DerivedPlan) => p.items.filter((i) => i.kind === "simulado");

  // 11. Exam more than 60 days away: the regular mini simulados are in the plan from the start.
  {
    const s = newStudent({ examDate: "2027-05-30", prefs: { available_days: SIX_DAYS, preferred_content_types: all, simulado_frequency: 1 } });
    const day0 = planFor(c, s, TODAY);
    const weeks = 8;
    const until = addDaysKey(TODAY, weeks * 7 - 2); // the Sunday that closes the 8th week
    const f = followPlan(c, s, TODAY, until);
    const end = planFor(c, s, addDaysKey(until, 1));
    const opt = (fq: "auto" | 1 | 2) => day0.simulado.options.find((o) => o.frequency === fq)!;
    // The same student without "Mini simulados" selected: what the sessions cost in forecast.
    const without = planFor(c, newStudent({ examDate: "2027-05-30", prefs: { available_days: SIX_DAYS, preferred_content_types: all.filter((t) => t !== "simulado") } }), TODAY);
    report.push({
      title: "11. Prova a mais de 60 dias: mini simulados desde o início da preparação",
      description: `Prova em 30/05/2027 (${day0.daysToExam} dias). 60 min por dia, segunda a sábado (360 min por semana). Frequência escolhida: 1 por semana. O aluno segue o plano por ${weeks} semanas, todas a mais de 60 dias da prova.`,
      day0: summary(day0), end: summary(end), simulado: s.log,
      checks: [
        checkBudget(day0),
        ...simChecks(s, f),
        {
          name: "A mais de 60 dias da prova o mini simulado já está no plano do dia",
          ok: (day0.daysToExam ?? 0) > 60 && (end.daysToExam ?? 0) > 60 && simBlocks(day0).length === 1,
          detail: `dia 0: ${day0.daysToExam} dias para a prova, ${simBlocks(day0).length} bloco de mini simulado; depois de ${weeks} semanas: ${end.daysToExam} dias para a prova`,
        },
        {
          name: "Uma sessão por semana, todas as semanas, com a frequência escolhida",
          ok: s.log.simBegun === weeks && s.log.simFinished === weeks,
          detail: `mini simulados iniciados em ${weeks} semanas: ${s.log.simBegun}; concluídos: ${s.log.simFinished}`,
        },
        {
          name: "Frequência, limite de disponibilidade e previsão de impacto continuam valendo",
          ok: opt(2).feasible && opt(1).feasible && opt(2).weeklyMinutes > opt(1).weeklyMinutes &&
              opt(1).expectedTopics != null && opt(2).expectedTopics != null && opt(2).expectedTopics! <= opt(1).expectedTopics! &&
              opt(1).expectedTopics === day0.forecast!.expectedTopics,
          detail: `1 por semana: ${opt(1).weeklyMinutes.toFixed(1)} min, ${opt(1).expectedTopics} temas previstos; 2 por semana: ${opt(2).weeklyMinutes.toFixed(1)} min, ${opt(2).expectedTopics} temas previstos; automática: ${opt("auto").weeklyMinutes.toFixed(1)} min por semana; sem mini simulados selecionados: ${without.forecast!.expectedTopics} temas previstos`,
        },
      ],
    });
  }

  // 12. Back after a pause of more than 7 days: the pending mini simulado is still in the plan,
  //     with the choice to continue it or pick another — never two sessions at once.
  {
    const mk = () => newStudent({ examDate: "2027-05-30", prefs: { daily_minutes: 30, available_days: FIVE_DAYS, preferred_content_types: all, simulado_frequency: 1 } });
    // Tuesday: 30 minutes hold 12 of the 25 questions. Then the student disappears for 10 days.
    const begin = (s: Student) => { followPlan(c, s, TODAY, TODAY); return s.attempts.find((a) => c.simuladoPages.get(a.page_id)?.isMini)!.page_id; };
    const back = addDaysKey(TODAY, 10); // Friday of the following week
    const A = mk(); const oldA = begin(A);
    A.flashcardsToday = 0; A.reviewedToday = 0;
    const onReturn = planFor(c, A, back);
    const blocks = simBlocks(onReturn);
    const answeredOld = (s: Student, page: number) => new Set(s.attempts.filter((a) => a.page_id === page).map((a) => a.question_id)).size;
    // Path A — continue: the student follows the plan from the return day on.
    const fA = followPlan(c, A, back, addDaysKey(back, 14));
    const total = c.simuladoPages.get(oldA)!.questionIds.length;
    // Path B — pick another: on the return day the student opens the library and answers 5 questions of another one.
    const B = mk(); const oldB = begin(B);
    const other = [...c.simuladoPages.values()].find((p) => p.isMini && p.pageId !== oldB && !B.attempts.some((a) => a.page_id === p.pageId))!;
    let clock = Date.parse(`${back}T13:00:00Z`);
    for (const q of other.questionIds.slice(0, 5)) {
      clock += B.secondsPerQuestion * 1000;
      B.attempts.push({ specialty_id: null, is_correct: true, created_at: new Date(clock).toISOString(), page_id: other.pageId, question_id: q });
    }
    const nextDay = addDaysKey(back, 3); // Monday
    B.flashcardsToday = 0; B.reviewedToday = 0;
    const afterPick = planFor(c, B, nextDay);
    let oldAskedAgain = 0, twoAtOnce = 0;
    for (let day = nextDay; day <= addDaysKey(nextDay, 18); day = addDaysKey(day, 1)) {
      B.flashcardsToday = 0; B.reviewedToday = 0;
      const p = planFor(c, B, day);
      const sb = simBlocks(p);
      if (sb.some((i) => i.pageId === oldB)) oldAskedAgain++;
      if (sb.length > 1) twoAtOnce++;
      followPlan(c, B, day, day);
    }
    report.push({
      title: "12. Retorno após uma pausa superior a 7 dias",
      description: "30 min por dia, segunda a sexta; 1 mini simulado por semana. O aluno responde 12 das 25 questões na terça-feira e fica 10 dias sem estudar. No retorno, um caminho continua o simulado pendente; o outro escolhe um simulado diferente na biblioteca.",
      afterGap: summary(onReturn), simulado: { continuar: A.log, escolherOutro: B.log },
      checks: [
        checkBudget(onReturn), ...fA.checks,
        {
          name: "Depois de 10 dias sem respostas o mini simulado pendente continua no plano, identificado",
          ok: blocks.length === 1 && blocks[0].pageId === oldA && blocks[0].title === "Continuar mini simulado" &&
              (blocks[0].lines ?? []).some((l) => /Sem respostas há 10 dias\. Continue de onde parou ou escolha outro mini simulado\./.test(l)),
          detail: `blocos de mini simulado no retorno: ${blocks.length}; texto: ${(blocks[0]?.lines ?? []).join(" | ")}`,
        },
        {
          name: "O plano oferece continuar ou escolher outro, e reserva uma única sessão",
          ok: blocks[0]?.cta === "Continuar de onde parou" && blocks[0]?.secondary?.label === "Escolher outro mini simulado" &&
              blocks[0]?.secondary?.href === "/app/estudo-por-questoes?tab=simulados",
          detail: `ações do bloco: "${blocks[0]?.cta}" e "${blocks[0]?.secondary?.label}"`,
        },
        {
          name: "Continuar: o simulado é retomado na primeira questão não respondida e concluído, sem perder respostas",
          ok: answeredOld(A, oldA) === total && A.log.simRepeatedAnswers === 0 && A.log.simMaxOpen <= 1,
          detail: `questões respondidas do simulado pendente: 12 → ${answeredOld(A, oldA)} de ${total}; respostas repetidas: ${A.log.simRepeatedAnswers}; máximo em andamento ao mesmo tempo: ${A.log.simMaxOpen}`,
        },
        {
          name: "Escolher outro: o plano passa a acompanhar o simulado escolhido e não programa os dois",
          ok: simBlocks(afterPick).length === 1 && simBlocks(afterPick)[0].pageId === other.pageId && oldAskedAgain === 0 && twoAtOnce === 0,
          detail: `no dia seguinte o bloco é do simulado escolhido: ${simBlocks(afterPick)[0]?.pageId === other.pageId ? "sim" : "não"}; dias em que o simulado antigo voltou a ser pedido: ${oldAskedAgain}; dias com dois blocos de simulado: ${twoAtOnce}`,
        },
        {
          name: "O histórico do simulado deixado é preservado",
          ok: answeredOld(B, oldB) === 12,
          detail: `respostas do simulado antigo depois de escolher outro e seguir o plano: ${answeredOld(B, oldB)} de 12`,
        },
      ],
    });
  }

  // 13. New sessions close to the exam: a session that cannot be finished is not opened.
  {
    // Exam on a Wednesday: the last week has Monday and Tuesday, 30 min each = 24 of the 25 questions.
    const exam = "2026-12-16";
    const s = newStudent({ examDate: exam, prefs: { daily_minutes: 30, available_days: FIVE_DAYS, preferred_content_types: all, simulado_frequency: 1 } });
    const lastMonday = "2026-12-14";
    let lastWeekBlocks = 0, lastWeekContent = 0;
    const checks: Check[] = [];
    for (let day = TODAY; day < exam; day = addDaysKey(day, 1)) {
      s.flashcardsToday = 0; s.reviewedToday = 0;
      if (day >= lastMonday && dow(day) >= 1 && dow(day) <= 5) {
        const p = planFor(c, s, day);
        lastWeekBlocks += simBlocks(p).length;
        lastWeekContent += p.items.filter((i) => i.kind !== "simulado").reduce((n, i) => n + i.estimatedMinutes, 0);
      }
      checks.push(...followPlan(c, s, day, day).checks);
    }
    // Same calendar, but the student begins a mini simulado on the eve by their own choice: it is still continued.
    const t = newStudent({ examDate: exam, prefs: { daily_minutes: 30, available_days: FIVE_DAYS, preferred_content_types: all, simulado_frequency: 1 } });
    const own = [...c.simuladoPages.values()].find((p) => p.isMini)!;
    let clock = Date.parse(`${lastMonday}T13:00:00Z`);
    for (const q of own.questionIds.slice(0, 20)) {
      clock += t.secondsPerQuestion * 1000;
      t.attempts.push({ specialty_id: null, is_correct: true, created_at: new Date(clock).toISOString(), page_id: own.pageId, question_id: q });
    }
    const eve = planFor(c, t, "2026-12-15");
    report.push({
      title: "13. Novas sessões perto da prova",
      description: "Prova em 16/12/2026 (quarta-feira). 30 min por dia, segunda a sexta; 1 mini simulado por semana (62 min). A última semana tem só segunda e terça: 24 das 25 questões, sem tempo para concluir uma sessão nova.",
      simulado: s.log,
      checks: [
        ...simChecks(s, { checks }),
        {
          name: "Todo mini simulado que o plano abriu foi concluído antes da prova",
          ok: s.log.simBegun > 0 && s.log.simBegun === s.log.simFinished,
          detail: `iniciados pelo plano: ${s.log.simBegun}; concluídos: ${s.log.simFinished}`,
        },
        {
          name: "Sem tempo para concluir, a sessão nova não é aberta e o dia vai para atividades que cabem",
          ok: lastWeekBlocks === 0 && lastWeekContent > 0,
          detail: `blocos de mini simulado na última semana (segunda e terça): ${lastWeekBlocks}; minutos de outras atividades nesses dias: ${lastWeekContent}`,
        },
        {
          name: "Um mini simulado já iniciado continua sendo oferecido, mesmo na véspera",
          ok: simBlocks(eve).length === 1 && simBlocks(eve)[0].pageId === own.pageId && /faltam 5 de 25/.test((simBlocks(eve)[0].lines ?? []).join(" ")),
          detail: `véspera, com 20 de 25 respondidas na segunda-feira: ${simBlocks(eve).map((i) => i.title + " — " + (i.lines ?? [])[0]).join("; ") || "nenhum bloco"}`,
        },
      ],
    });
  }

  // ── Tempo de estudo por dia (Karina 2026-11-18) ────────────────────────────────────────────────────────────
  const placedOn = (d: { review: number; simulado: number; content: number }) => d.review + d.simulado + d.content;

  // 14. The student informs the time of each study day; the weekly total is calculated.
  {
    const monday = "2026-11-23";
    const mk = (minutes: number) => newStudent({ prefs: { daily_minutes: minutes, available_days: THREE_DAYS, preferred_content_types: all } });
    const five = planFor(c, mk(300), monday);
    const one = planFor(c, mk(60), monday);
    const maxDay = Math.max(...five.scheduleDays.map(placedOn));
    const offDays = five.scheduleDays.filter((d) => placedOn(d) > 0 && ![1, 3, 5].includes(dow(d.key))).length;
    report.push({
      title: "14. Tempo de estudo por dia",
      description: "Prova em 30/05/2027. O aluno informa 5 horas e 0 minutos por dia e marca segunda, quarta e sexta. O total semanal é calculado. Comparação com o mesmo aluno informando 1 hora por dia.",
      day0: summary(five),
      checks: [
        checkBudget(five),
        {
          name: "Resumo da disponibilidade: 5 h por dia de estudo · 3 dias por semana · 15 h semanais",
          ok: availabilityLine(five.routine.dailyMinutes, five.routine.studyDayMask) === "5 h por dia de estudo · 3 dias por semana · 15 h semanais"
            && studyDayNames(five.routine.studyDayMask) === "segunda, quarta e sexta" && five.routine.weeklyMinutes === 900,
          detail: `${availabilityLine(five.routine.dailyMinutes, five.routine.studyDayMask)} (${studyDayNames(five.routine.studyDayMask)})`,
        },
        {
          name: "O tempo diário é o tempo de cada dia de estudo: 300 min hoje e nunca mais de 300 min em nenhum dia",
          ok: five.todayBudgetMinutes === 300 && five.totalEstimatedMinutes <= 300 && maxDay <= 300.01 && offDays === 0,
          detail: `hoje: ${five.totalEstimatedMinutes} de ${five.todayBudgetMinutes} min; dia mais cheio até a prova: ${Math.round(maxDay)} min; atividades fora de segunda, quarta e sexta: ${offDays}`,
        },
        {
          name: "A previsão de cobertura usa o tempo diário (5 h por dia prevê mais do que 1 h por dia)",
          ok: five.forecast!.minutesPerStudyDay === 300 && five.forecast!.expectedTopics > one.forecast!.expectedTopics
            && five.forecast!.scheduledMinutes > one.forecast!.scheduledMinutes,
          detail: `5 h por dia: ${five.forecast!.expectedTopics} de ${five.forecast!.pendingTopics} temas, ${Math.round(five.forecast!.scheduledMinutes / 60)} h programadas; 1 h por dia: ${one.forecast!.expectedTopics} temas, ${Math.round(one.forecast!.scheduledMinutes / 60)} h programadas`,
        },
        {
          name: "O orçamento dos mini simulados usa o tempo diário, e a frequência continua semanal",
          ok: five.simulado.weeklyStudyMinutes === 900 && one.simulado.weeklyStudyMinutes === 180
            && five.simulado.options.every((o) => o.sessionsPerWeek <= 2),
          detail: `tempo de estudo por semana: ${five.simulado.weeklyStudyMinutes} min (5 h por dia) e ${one.simulado.weeklyStudyMinutes} min (1 h por dia); opções: ${five.simulado.options.map((o) => `${o.frequency}=${o.everyWeeks > 1 ? `1 a cada ${o.everyWeeks} semanas` : `${o.sessionsPerWeek} por semana`}`).join(", ")}`,
        },
      ],
    });
  }

  // 15. Settings saved before the change keep the load they had.
  {
    const monday = "2026-11-23";
    const converted = legacyDailyMinutes({ weekly_hours: 6, intensity: "intenso", studyDays: 3 });
    const kept = planFor(c, newStudent({ prefs: { daily_minutes: converted, available_days: THREE_DAYS, preferred_content_types: all } }), monday);
    const wrong = planFor(c, newStudent({ prefs: { daily_minutes: 360, available_days: THREE_DAYS, preferred_content_types: all } }), monday);
    const levels = (["leve", "padrao", "intenso"] as const).map((i) => legacyDailyMinutes({ weekly_hours: null, intensity: i, studyDays: 5 }));
    report.push({
      title: "15. Conversão das configurações existentes",
      description: "Uma configuração antiga de 6 horas por semana em 3 dias (segunda, quarta e sexta) passa a 2 horas por dia de estudo — não a 6 horas por dia. Quem não tinha horas semanais mantém os minutos do nível antigo.",
      day0: summary(kept),
      checks: [
        checkBudget(kept),
        {
          name: "6 horas semanais em 3 dias = 2 horas por dia; o total semanal continua 6 horas",
          ok: converted === 120 && kept.todayBudgetMinutes === 120 && kept.routine.weeklyMinutes === 360,
          detail: `convertido: ${converted} min por dia; ${availabilityLine(kept.routine.dailyMinutes, kept.routine.studyDayMask)}`,
        },
        {
          name: "A carga não é multiplicada: a previsão é a de 2 h por dia, não a de 6 h por dia",
          ok: kept.forecast!.scheduledMinutes < wrong.forecast!.scheduledMinutes && Math.max(...kept.scheduleDays.map(placedOn)) <= 120.01,
          detail: `com 2 h por dia: ${Math.round(kept.forecast!.scheduledMinutes / 60)} h programadas até a prova; se virasse 6 h por dia seriam ${Math.round(wrong.forecast!.scheduledMinutes / 60)} h`,
        },
        {
          name: "Sem horas semanais salvas, valem os minutos do nível antigo (Leve 30, Padrão 60, Intenso 120)",
          ok: levels.join(",") === "30,60,120",
          detail: `Leve, Padrão, Intenso → ${levels.join(", ")} min por dia de estudo`,
        },
      ],
    });
  }

  // 16. "Reduzir o tempo de estudo por um período".
  {
    const monday = "2026-11-23";
    const until = "2026-12-06";
    const mk = (reduce: boolean) => newStudent({ prefs: {
      daily_minutes: 120, available_days: FIVE_DAYS, preferred_content_types: all,
      ...(reduce ? { temp_daily_minutes: 30, temp_daily_until: until } : {}),
    } });
    const reduced = planFor(c, mk(true), monday);
    const regular = planFor(c, mk(false), monday);
    const during = reduced.scheduleDays.filter((d) => d.key <= until);
    const after = reduced.scheduleDays.filter((d) => d.key > until);
    const back = planFor(c, mk(true), "2026-12-07");
    report.push({
      title: "16. Redução do tempo de estudo por um período",
      description: "2 horas por dia, segunda a sexta. O aluno reduz para 30 min por dia de estudo até 06/12/2026. Depois do período, o plano volta sozinho às 2 horas.",
      day0: summary(reduced),
      checks: [
        checkBudget(reduced),
        {
          name: "Durante o período, cada dia de estudo tem no máximo o tempo reduzido",
          ok: reduced.todayBudgetMinutes === 30 && reduced.routine.reducedUntil === until && during.length > 0
            && during.every((d) => placedOn(d) <= 30.01),
          detail: `hoje: ${reduced.todayBudgetMinutes} min; dias de estudo no período: ${during.length}; dia mais cheio no período: ${Math.round(Math.max(...during.map(placedOn)))} min`,
        },
        {
          name: "Depois do período, o plano volta ao tempo diário habitual",
          ok: after.some((d) => placedOn(d) > 100) && after.every((d) => placedOn(d) <= 120.01)
            && back.todayBudgetMinutes === 120 && back.routine.reducedUntil === null,
          detail: `dia mais cheio depois de 06/12: ${Math.round(Math.max(...after.map(placedOn)))} min; em 07/12 o dia volta a ${back.todayBudgetMinutes} min`,
        },
        {
          name: "A previsão já considera a redução (menos tempo programado do que sem ela)",
          ok: reduced.forecast!.scheduledMinutes < regular.forecast!.scheduledMinutes,
          detail: `com a redução: ${(reduced.forecast!.scheduledMinutes / 60).toFixed(1)} h programadas até a prova; sem ela: ${(regular.forecast!.scheduledMinutes / 60).toFixed(1)} h`,
        },
      ],
    });
  }

  let failed = 0;
  for (const r of report) {
    console.log(`\n══ ${r.title} ══\n${r.description}`);
    for (const k of ["day0", "beforeGap", "afterGap", "standard", "fast", "end", "before", "after"]) {
      const v = r[k] as ReturnType<typeof summary> | undefined;
      if (!v) continue;
      console.log(`  [${k}] fase ${v.phase} · hoje ${v.todayMinutes}/${v.todayBudget} min · previstos ${v.expectedTopics} de ${v.pendingTopics} pendentes (+${v.partialTopics} com avanço parcial, ${v.scheduledHours} h programadas) · concluídos ${v.completedTopics} · na Revisão ${v.inReviewTopics} · ${v.studyDaysLeft} dias de estudo · ${v.pendingHours} h pendentes × ${v.capacityHours} h de conteúdo novo · término ${v.finishDay ?? "—"} · ${v.questionsPerHour} q/h (${v.paceSource})`);
      if (k === "day0" || k === "afterGap" || k === "after") for (const it of v.todayItems) console.log(`      · ${it}`);
      if (v.hints.length) console.log(`      dicas: ${JSON.stringify(v.hints)}`);
      if (v.notExpected) console.log(`      não previstos por prioridade: ${JSON.stringify(v.notExpectedByTier)}`);
    }
    if (r.followed) console.log(`  [seguindo o plano] ${JSON.stringify(r.followed)}`);
    for (const chk of r.checks as Check[]) {
      if (!chk.ok) failed++;
      console.log(`  ${chk.ok ? "PASSOU" : "FALHOU"} — ${chk.name} (${chk.detail})`);
    }
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 1));
  console.log(`\n${failed === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : `${failed} VERIFICAÇÃO(ÕES) FALHARAM`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
