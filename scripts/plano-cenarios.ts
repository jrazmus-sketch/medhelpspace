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
  const budgetGuess = s.prefs.weekly_hours != null
    ? (s.prefs.weekly_hours * 60) / Math.max(1, bits(s.prefs.available_days & ~s.prefs.recurring_off_days))
    : { leve: 30, padrao: 60, intenso: 120 }[s.prefs.intensity];
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

async function main() {
  const c = await loadContent();
  await sql.end();
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
    () => newStudent({ examDate: "2026-12-08", prefs: { intensity: "intenso", preferred_content_types: all } }));

  run("3. Tempo insuficiente", "Prova em 17/12/2026 (30 dias). 30 min por dia, segunda, quarta e sexta. Todos os materiais. Aluno novo.",
    () => newStudent({ examDate: "2026-12-17", prefs: { intensity: "leve", available_days: THREE_DAYS, preferred_content_types: all } }));

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
    const mk = () => newStudent({ examDate: "2026-12-29", prefs: { intensity: "leve", available_days: FIVE_DAYS, preferred_content_types: all, simulado_frequency: 1 } });
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
    const s = newStudent({ examDate: "2026-12-29", prefs: { intensity: "leve", available_days: FIVE_DAYS, preferred_content_types: all, simulado_frequency: 2 } });
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
      examDate: "2026-12-17", prefs: { intensity: "leve", available_days: THREE_DAYS, preferred_content_types: all, simulado_frequency: freq },
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
