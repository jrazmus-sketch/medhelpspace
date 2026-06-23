import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side review queries. Per the project's data-fetching invariant these
 * are plain async functions called from server components (never the browser
 * client). They read through the admin client filtered by `user_id` — the same
 * service-role pattern the dashboard uses for per-user data.
 */

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Counts ─────────────────────────────────────────────────────────────────────

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
      /** Deep-link to the source page so a missed question links back to the lesson. */
      remediationHref: string | null;
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

  // Remediation hrefs: quiz page → /app/<specialtySlug>/<pageSlug>.
  const hrefByPage = new Map<number, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageIds = [...new Set((quizRes.data ?? []).map((qq: any) => qq.page_id as number).filter(Boolean))];
  if (pageIds.length) {
    const { data: pages } = await admin.from("pages").select("id, slug, specialty_id").in("id", pageIds);
    const specIds = [...new Set((pages ?? []).map((p) => p.specialty_id).filter(Boolean))] as number[];
    const { data: specs } = specIds.length
      ? await admin.from("specialties").select("id, slug").in("id", specIds)
      : { data: [] as { id: number; slug: string }[] };
    const specSlug = new Map((specs ?? []).map((s) => [s.id as number, s.slug as string]));
    for (const p of pages ?? []) {
      const ss = p.specialty_id ? specSlug.get(p.specialty_id as number) : null;
      hrefByPage.set(p.id as number, ss ? `/app/${ss}/${p.slug}` : `/app/${p.slug}`);
    }
  }

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
          remediationHref: hrefByPage.get(qq.page_id as number) ?? null,
        });
      }
    }
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
    .select("id, slug, title, specialty_id")
    .in("id", ids);

  const specIds = [...new Set((pages ?? []).map((p) => p.specialty_id).filter(Boolean))] as number[];
  const { data: specs } = specIds.length
    ? await admin.from("specialties").select("id, slug").in("id", specIds)
    : { data: [] as { id: number; slug: string }[] };
  const specSlug = new Map((specs ?? []).map((s) => [s.id as number, s.slug as string]));

  return (pages ?? []).map((p) => {
    const ss = p.specialty_id ? specSlug.get(p.specialty_id as number) : null;
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
