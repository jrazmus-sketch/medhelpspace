import { themeSlug, themeTitle } from "@/lib/memorecards-shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayKeyBR } from "@/lib/br-date";
import { REMEDIATION_LABELS, resumoSlugFor, revalidaUpSlugFor, type Remediation } from "@/lib/review/remediation";

/**
 * Server-side review queries. Per the project's data-fetching invariant these
 * are plain async functions called from server components (never the browser
 * client). They read through the admin client filtered by `user_id` — the same
 * service-role pattern the dashboard uses for per-user data.
 */

// The student's day in Brazil. On the server's UTC day, the /app nav review
// badge and /app/revisao released cards a day early every evening — and
// disagreed with the plan card, which counts due items on the Brazilian day.
function todayKey(): string {
  return todayKeyBR();
}

// ── Counts ─────────────────────────────────────────────────────────────────────

/**
 * The Revalida Revisão reads ONLY its own item types. ClinAct shares the
 * review_schedule table (item_type='clinact_case') but has its own queue at
 * /clinact/treinar — the two products must never mix queues.
 */
export const REVALIDA_REVIEW_TYPES = ["flashcard", "quiz_question", "memorecard"] as const;

export interface ReviewCounts {
  /** Non-suspended items due on/before today (all types). */
  dueTotal: number;
  dueFlashcards: number;
  dueQuiz: number;
  /** "Só as que errei" — non-suspended items whose last grade was incorrect
   *  (repetitions reset to 0), regardless of due date. */
  wrongTotal: number;
}

export async function getReviewCounts(userId: string): Promise<ReviewCounts> {
  const admin = createAdminClient();
  const today = todayKey();

  const due = () =>
    admin
      .from("review_schedule")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("item_type", [...REVALIDA_REVIEW_TYPES])
      .eq("suspended", false)
      .lte("due_date", today);

  const [{ count: dueTotal }, { count: dueFlashcards }, { count: dueQuiz }, { count: wrongTotal }] =
    await Promise.all([
      due(),
      due().eq("item_type", "flashcard"),
      due().eq("item_type", "quiz_question"),
      admin
        .from("review_schedule")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("item_type", [...REVALIDA_REVIEW_TYPES])
        .eq("suspended", false)
        .eq("repetitions", 0),
    ]);

  return {
    dueTotal: dueTotal ?? 0,
    dueFlashcards: dueFlashcards ?? 0,
    dueQuiz: dueQuiz ?? 0,
    wrongTotal: wrongTotal ?? 0,
  };
}

/** Single lightweight count for the nav badge: items due on/before today. */
export async function getDueReviewCount(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("review_schedule")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("suspended", false)
    .lte("due_date", todayKey());
  return count ?? 0;
}

// ── Items ──────────────────────────────────────────────────────────────────────

export type ReviewItem =
  | {
      kind: "flashcard";
      id: number;
      specialtyId: number | null;
      text: string;
      answer: string;
      image_url: string | null;
      tip: string | null;
    }
  | {
      kind: "quiz";
      id: number;
      specialtyId: number | null;
      question: string;
      answers: { text: string; correct: boolean; feedback: string }[];
      explanation_html: string | null;
      media_url: string | null;
      /**
       * Where to study the topic after a miss: its Resumo, else its Revalida Up
       * page. Null when it has neither — the link is then hidden (never a link to
       * more questions).
       */
      remediation: Remediation | null;
    };

export type ReviewMode = "due" | "wrong" | "weak";

/**
 * The reviewable items for a session, joined to their content and interleaved by
 * kind (quiz ↔ flashcard) so a session mixes retrieval formats. `mode`:
 *  - "due"   → items due on/before today (the daily queue)
 *  - "wrong" → items last answered incorrectly, any due date ("só as que errei")
 *  - "weak"  → items from the user's weakest specialties, any due date
 */
export async function getReviewItems(
  userId: string,
  mode: ReviewMode = "due",
  limit = 60,
): Promise<ReviewItem[]> {
  const admin = createAdminClient();
  const today = todayKey();

  let weakIds: number[] = [];
  if (mode === "weak") {
    weakIds = (await weakSpecialtyIds(admin, userId)).ids;
    if (weakIds.length === 0) return [];
  }

  let q = admin
    .from("review_schedule")
    .select("item_type, item_id, specialty_id")
    .eq("user_id", userId)
    .in("item_type", [...REVALIDA_REVIEW_TYPES])
    .eq("suspended", false);

  if (mode === "due") {
    q = q.lte("due_date", today).order("due_date", { ascending: true });
  } else if (mode === "wrong") {
    q = q.eq("repetitions", 0).order("last_reviewed_at", { ascending: true, nullsFirst: true });
  } else {
    q = q.in("specialty_id", weakIds).order("due_date", { ascending: true });
  }

  const { data: rows } = await q.limit(limit);
  const sched = rows ?? [];
  if (sched.length === 0) return [];

  const flashIds = sched.filter((r) => r.item_type === "flashcard").map((r) => r.item_id as number);
  const quizIds = sched.filter((r) => r.item_type === "quiz_question").map((r) => r.item_id as number);

  const [flashRes, quizRes] = await Promise.all([
    flashIds.length
      ? admin.from("flashcard_items").select("id, text, answer, image_url, tip").in("id", flashIds)
      : Promise.resolve({ data: [] as unknown[] }),
    quizIds.length
      ? admin
          .from("quiz_questions")
          .select("id, question, answers, explanation_html, media_url, page_id")
          .in("id", quizIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flashById = new Map((flashRes.data ?? []).map((f: any) => [f.id as number, f]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quizById = new Map((quizRes.data ?? []).map((qq: any) => [qq.id as number, qq]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quizPageIds = [...new Set((quizRes.data ?? []).map((qq: any) => qq.page_id as number).filter(Boolean))];
  const remediationByPage = await remediationFor(admin, quizPageIds);

  const items: ReviewItem[] = [];
  for (const r of sched) {
    if (r.item_type === "flashcard") {
      const f = flashById.get(r.item_id as number);
      if (f) {
        items.push({
          kind: "flashcard",
          id: r.item_id as number,
          specialtyId: (r.specialty_id as number | null) ?? null,
          text: f.text ?? "",
          answer: f.answer ?? "",
          image_url: f.image_url ?? null,
          tip: f.tip ?? null,
        });
      }
    } else if (r.item_type === "quiz_question") {
      const qq = quizById.get(r.item_id as number);
      if (qq) {
        items.push({
          kind: "quiz",
          id: r.item_id as number,
          specialtyId: (r.specialty_id as number | null) ?? null,
          question: qq.question ?? "",
          answers: Array.isArray(qq.answers) ? qq.answers : [],
          explanation_html: qq.explanation_html ?? null,
          media_url: qq.media_url ?? null,
          remediation: remediationByPage.get(qq.page_id as number) ?? null,
        });
      }
    }
  }

  return interleaveByKind(items);
}

/**
 * All reviewable items for a single page (quiz questions + flashcards), regardless
 * of due date or enrollment — powers the per-page "Revisar de novo" on-demand
 * session. Grading still updates each item's SM-2 schedule.
 *
 * SECURITY: reads via the service-role client (RLS bypassed) and does NOT itself
 * authorize access to `pageId`. Callers MUST gate first — verify the page is
 * published and the viewer has membership + any module access (e.g. MedHelp 60D),
 * exactly as the [specialty]/[slug] content route does. The /app/revisao/sessao
 * route performs this check before calling.
 */
export async function getPageReviewItems(pageId: number, limit = 60): Promise<ReviewItem[]> {
  const admin = createAdminClient();

  const { data: page } = await admin
    .from("pages")
    .select("id, slug, specialty_id")
    .eq("id", pageId)
    .single();
  if (!page) return [];

  const specialtyId = (page.specialty_id as number | null) ?? null;
  const remediation = (await remediationFor(admin, [pageId])).get(pageId) ?? null;

  const [quizRes, flashRes] = await Promise.all([
    admin
      .from("quiz_questions")
      .select("id, question, answers, explanation_html, media_url")
      .eq("page_id", pageId)
      .order("position")
      .limit(limit),
    admin
      .from("flashcard_items")
      .select("id, text, answer, image_url, tip")
      .eq("page_id", pageId)
      .order("group_position")
      .order("position")
      .limit(limit),
  ]);

  const items: ReviewItem[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const qq of (quizRes.data ?? []) as any[]) {
    items.push({
      kind: "quiz",
      id: qq.id as number,
      specialtyId,
      question: qq.question ?? "",
      answers: Array.isArray(qq.answers) ? qq.answers : [],
      explanation_html: qq.explanation_html ?? null,
      media_url: qq.media_url ?? null,
      remediation,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const f of (flashRes.data ?? []) as any[]) {
    items.push({
      kind: "flashcard",
      id: f.id as number,
      specialtyId,
      text: f.text ?? "",
      answer: f.answer ?? "",
      image_url: f.image_url ?? null,
      tip: f.tip ?? null,
    });
  }

  return interleaveByKind(items);
}

/** Round-robin merge so quiz and flashcard items alternate where possible. */
function interleaveByKind(items: ReviewItem[]): ReviewItem[] {
  const quiz = items.filter((i) => i.kind === "quiz");
  const flash = items.filter((i) => i.kind === "flashcard");
  const out: ReviewItem[] = [];
  let qi = 0;
  let fi = 0;
  while (qi < quiz.length || fi < flash.length) {
    if (qi < quiz.length) out.push(quiz[qi++]);
    if (fi < flash.length) out.push(flash[fi++]);
  }
  return out;
}

// ── Weak areas ──────────────────────────────────────────────────────────────────

/**
 * The user's weakest specialties by quiz accuracy (lowest first), restricted to
 * specialties with enough attempts to be meaningful. Drives the "Pontos fracos"
 * review mode and its hub label.
 */
async function weakSpecialtyIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  topN = 3,
): Promise<{ ids: number[]; names: string[] }> {
  const { data: attempts } = await admin
    .from("quiz_attempts")
    .select("specialty_id, is_correct")
    .eq("user_id", userId)
    .not("specialty_id", "is", null);

  const acc = new Map<number, { t: number; c: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (attempts ?? []) as any[]) {
    const b = acc.get(a.specialty_id) ?? { t: 0, c: 0 };
    b.t++;
    if (a.is_correct) b.c++;
    acc.set(a.specialty_id, b);
  }

  const ranked = [...acc.entries()]
    .filter(([, v]) => v.t >= 3) // need a few attempts before calling a specialty "weak"
    .map(([id, v]) => ({ id, pct: v.c / v.t }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, topN);

  const ids = ranked.map((r) => r.id);
  if (ids.length === 0) return { ids: [], names: [] };

  const { data: specs } = await admin.from("specialties").select("id, name").in("id", ids);
  const nameById = new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (specs ?? []).map((s: any) => [s.id as number, s.name as string]),
  );
  return { ids, names: ids.map((id) => nameById.get(id)).filter(Boolean) as string[] };
}

export interface WeakAreaForReview {
  count: number;
  names: string[];
  specialtyIds: number[];
}

/** Count of reviewable items in the user's weakest specialties, plus their names. */
export async function getWeakAreaForReview(userId: string): Promise<WeakAreaForReview> {
  const admin = createAdminClient();
  const { ids, names } = await weakSpecialtyIds(admin, userId);
  if (ids.length === 0) return { count: 0, names: [], specialtyIds: [] };

  const { count } = await admin
    .from("review_schedule")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("suspended", false)
    .in("specialty_id", ids);

  return { count: count ?? 0, names, specialtyIds: ids };
}

// ── MemoreCards re-read ──────────────────────────────────────────────────────

export interface RereadDeck {
  pageId: number;
  title: string;
  href: string;
}

/** MemoreCard decks due for a re-read (deck-level, passive — links to the deck). */
export async function getMemorecardRereadDue(userId: string): Promise<RereadDeck[]> {
  const admin = createAdminClient();
  const today = todayKey();

  const { data: rows } = await admin
    .from("review_schedule")
    .select("item_id")
    .eq("user_id", userId)
    .eq("item_type", "memorecard")
    .eq("suspended", false)
    .lte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(20);

  const ids = (rows ?? []).map((r) => r.item_id as number);
  if (ids.length === 0) return [];

  const { data: pages } = await admin
    .from("pages")
    .select("id, slug, title, specialty_id, view")
    .in("id", ids);

  const specIds = [...new Set((pages ?? []).map((p) => p.specialty_id).filter(Boolean))] as number[];
  const { data: specs } = specIds.length
    ? await admin.from("specialties").select("id, slug").in("id", specIds)
    : { data: [] as { id: number; slug: string }[] };
  const specSlug = new Map((specs ?? []).map((s) => [s.id as number, s.slug as string]));

  return (pages ?? []).map((p) => {
    const ss = p.specialty_id ? specSlug.get(p.specialty_id as number) : null;
    // MemoreCards v2 enrol a THEME, keyed by its Revalida Up page: re-reading it
    // means reopening the viewer on that theme, not the Revalida Up text.
    if (p.view === "revalida-up" && ss) {
      return {
        pageId: p.id as number,
        title: themeTitle(p.title as string),
        href: `/app/memorecards/${ss}?tema=${themeSlug(p.slug as string)}`,
      };
    }
    return {
      pageId: p.id as number,
      title: (p.title as string) ?? "Memorecards",
      href: ss ? `/app/${ss}/${p.slug}` : `/app/${p.slug}`,
    };
  });
}

// ── Stats (for /relatorio) ───────────────────────────────────────────────────

export interface ReviewStats {
  scheduled: number; // total non-suspended items in the system
  dueToday: number; // due_date <= today
  overdue: number; // due_date < today
  wrong: number; // last grade incorrect (repetitions = 0)
  mastered: number; // well-spaced (interval_days >= 21)
}

export async function getReviewStats(userId: string): Promise<ReviewStats> {
  const admin = createAdminClient();
  const today = todayKey();
  const base = () =>
    admin
      .from("review_schedule")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("suspended", false);

  const [{ count: scheduled }, { count: dueToday }, { count: overdue }, { count: wrong }, { count: mastered }] =
    await Promise.all([
      base(),
      base().lte("due_date", today),
      base().lt("due_date", today),
      base().eq("repetitions", 0),
      base().gte("interval_days", 21),
    ]);

  return {
    scheduled: scheduled ?? 0,
    dueToday: dueToday ?? 0,
    overdue: overdue ?? 0,
    wrong: wrong ?? 0,
    mastered: mastered ?? 0,
  };
}

// ── Remediation: a missed question → the topic's Resumo (else Revalida Up) ─────

/**
 * For each Questões page: its topic's Resumo page (Karina's choice), else its
 * Revalida Up page, as an /app href + the matching label. Pages with neither get
 * no entry and the link is hidden.
 */
async function remediationFor(
  admin: ReturnType<typeof createAdminClient>,
  pageIds: number[],
): Promise<Map<number, Remediation>> {
  const out = new Map<number, Remediation>();
  if (pageIds.length === 0) return out;

  const { data: sources } = await admin.from("pages").select("id, slug").in("id", pageIds);
  const wanted = (sources ?? []).map((p) => resumoSlugFor(p.slug as string));
  const [{ data: resumos }, upHrefs] = await Promise.all([
    wanted.length
      ? admin
          .from("pages")
          .select("slug, specialty_id")
          .eq("view", "resumos")
          .eq("status", "publish")
          .neq("type", "blurb-nav-hub")
          .in("slug", wanted)
      : Promise.resolve({ data: [] as { slug: string; specialty_id: number | null }[] }),
    revalidaUpHrefs(admin, pageIds),
  ]);

  const specIds = [...new Set((resumos ?? []).map((r) => r.specialty_id).filter(Boolean))] as number[];
  const { data: specs } = specIds.length
    ? await admin.from("specialties").select("id, slug").in("id", specIds)
    : { data: [] as { id: number; slug: string }[] };
  const specSlug = new Map((specs ?? []).map((sp) => [sp.id as number, sp.slug as string]));
  const resumoBySlug = new Map((resumos ?? []).map((r) => [r.slug as string, r]));

  for (const p of sources ?? []) {
    const r = resumoBySlug.get(resumoSlugFor(p.slug as string));
    if (r) {
      const ss = r.specialty_id ? specSlug.get(r.specialty_id as number) : null;
      out.set(p.id as number, { href: ss ? `/app/${ss}/${r.slug}` : `/app/${r.slug}`, label: REMEDIATION_LABELS.resumo });
      continue;
    }
    const up = upHrefs.get(p.id as number);
    if (up) out.set(p.id as number, { href: up, label: REMEDIATION_LABELS.revalidaUp });
  }
  return out;
}

/**
 * For each Questões page, the Revalida Up page of the same topic, as an /app href.
 * Karina (2026-09-23): the old link went back to the question page itself, i.e. to
 * more questions — the student needs the topic's study material instead.
 *
 * Resolved through the study-plan map (topic_content: topic → its question page AND
 * its Revalida Up page), then by slug (`<topic>-revalida-up`) for pages the map does
 * not cover. A page with no Revalida Up (e.g. a multi-topic mini simulado) gets no
 * entry, and the link is hidden.
 */
async function revalidaUpHrefs(
  admin: ReturnType<typeof createAdminClient>,
  pageIds: number[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (pageIds.length === 0) return out;

  const [{ data: sources }, { data: links }] = await Promise.all([
    admin.from("pages").select("id, slug").in("id", pageIds),
    admin.from("topic_content").select("topic_id, page_id").in("page_id", pageIds),
  ]);
  const topicIds = [...new Set((links ?? []).map((l) => l.topic_id as number))];
  const candidateSlugs = (sources ?? []).map((p) => revalidaUpSlugFor(p.slug as string));

  const [{ data: siblings }, { data: bySlug }] = await Promise.all([
    topicIds.length
      ? admin.from("topic_content").select("topic_id, page_id").in("topic_id", topicIds)
      : Promise.resolve({ data: [] as { topic_id: number; page_id: number }[] }),
    admin
      .from("pages")
      .select("id, slug, specialty_id")
      .eq("view", "revalida-up")
      .eq("status", "publish")
      .in("slug", candidateSlugs),
  ]);
  const siblingIds = [...new Set((siblings ?? []).map((l) => l.page_id as number))];
  const { data: upByTopic } = siblingIds.length
    ? await admin
        .from("pages")
        .select("id, slug, specialty_id")
        .eq("view", "revalida-up")
        .eq("status", "publish")
        .in("id", siblingIds)
    : { data: [] as { id: number; slug: string; specialty_id: number | null }[] };

  const upPages = [...(upByTopic ?? []), ...(bySlug ?? [])];
  const specIds = [...new Set(upPages.map((p) => p.specialty_id).filter(Boolean))] as number[];
  const { data: specs } = specIds.length
    ? await admin.from("specialties").select("id, slug").in("id", specIds)
    : { data: [] as { id: number; slug: string }[] };
  const specSlug = new Map((specs ?? []).map((sp) => [sp.id as number, sp.slug as string]));
  const hrefOf = (p: { slug: string; specialty_id: number | null }) => {
    const ss = p.specialty_id ? specSlug.get(p.specialty_id) : null;
    return ss ? `/app/${ss}/${p.slug}` : `/app/${p.slug}`;
  };

  // topic → its Revalida Up page
  const upIdSet = new Map((upByTopic ?? []).map((p) => [p.id as number, p]));
  const upByTopicId = new Map<number, (typeof upPages)[number]>();
  for (const l of siblings ?? []) {
    const up = upIdSet.get(l.page_id as number);
    if (up && !upByTopicId.has(l.topic_id as number)) upByTopicId.set(l.topic_id as number, up);
  }
  for (const l of links ?? []) {
    const up = upByTopicId.get(l.topic_id as number);
    if (up && !out.has(l.page_id as number)) out.set(l.page_id as number, hrefOf(up));
  }
  // slug fallback for the rest
  const upBySlug = new Map((bySlug ?? []).map((p) => [p.slug as string, p]));
  for (const p of sources ?? []) {
    if (out.has(p.id as number)) continue;
    const up = upBySlug.get(revalidaUpSlugFor(p.slug as string));
    if (up) out.set(p.id as number, hrefOf(up));
  }
  return out;
}
