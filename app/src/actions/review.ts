"use server";

import { createClient } from "@/lib/supabase/server";
import { nextSm2, dueDateAfter, SM2_DEFAULTS, type ReviewResult } from "@/lib/review/sm2";
import { todayKeyBR, toDateKeyBR, addDaysKey } from "@/lib/br-date";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSimulado100Page } from "@/lib/review/revisao-escolha";
import { memorecardRereadDue, formulaRereadNext, formulaRereadOffered } from "@/lib/review/memorecard-reread";

export type ReviewItemType = "flashcard" | "quiz_question" | "memorecard" | "formula";

/**
 * Unified SM-2 update for ANY reviewable item. Writes `review_schedule` so the
 * item resurfaces at the right interval, and denormalizes `specialty_id` for
 * weak-area filtering. Writes through the user-session client so the
 * `review_schedule_own_all` RLS policy enforces ownership.
 *
 * `specialtyId` is optional: for flashcards we resolve it from the card's page
 * when the caller doesn't already know it; quiz/memorecard callers (which have
 * it on hand) should pass it to skip the lookup.
 */
export async function gradeReviewItem(
  itemType: ReviewItemType,
  itemId: number,
  result: ReviewResult,
  specialtyId: number | null = null,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Resolve specialty for flashcards when not supplied (page → specialty_id).
  let resolvedSpecialty = specialtyId;
  if (resolvedSpecialty == null && itemType === "flashcard") {
    const { data: fi } = await supabase
      .from("flashcard_items")
      .select("page:pages(specialty_id)")
      .eq("id", itemId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolvedSpecialty = (fi as any)?.page?.specialty_id ?? null;
  }

  // Load current scheduling state (may not exist yet → SM2 defaults).
  const { data: current } = await supabase
    .from("review_schedule")
    .select("ease_factor, interval_days, repetitions, lapses")
    .eq("user_id", user.id)
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .maybeSingle();

  const prev = current
    ? {
        ease_factor: current.ease_factor != null ? Number(current.ease_factor) : SM2_DEFAULTS.ease_factor,
        interval_days: current.interval_days ?? SM2_DEFAULTS.interval_days,
        repetitions: current.repetitions ?? SM2_DEFAULTS.repetitions,
        lapses: current.lapses ?? SM2_DEFAULTS.lapses,
      }
    : SM2_DEFAULTS;

  const next = nextSm2(prev, result);

  await supabase.from("review_schedule").upsert(
    {
      user_id: user.id,
      item_type: itemType,
      item_id: itemId,
      // Only set specialty_id when known so we never clobber an existing value with null.
      ...(resolvedSpecialty != null ? { specialty_id: resolvedSpecialty } : {}),
      ease_factor: next.ease_factor,
      interval_days: next.interval_days,
      repetitions: next.repetitions,
      lapses: next.lapses,
      due_date: dueDateAfter(next.interval_days),
      last_reviewed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_type,item_id" },
  );
}

/**
 * Schedule (or reschedule) a MemoreCards deck for re-reading. Called when a
 * student finishes a deck. `itemId` is the deck's PAGE id — memorecards are
 * reviewed deck-at-a-time, not slide-by-slide.
 */
export async function enrollMemorecardReread(
  pageId: number,
  specialtyId: number | null = null,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: current } = await supabase
    .from("review_schedule")
    .select("repetitions, due_date")
    .eq("user_id", user.id)
    .eq("item_type", "memorecard")
    .eq("item_id", pageId)
    .maybeSingle();

  // Only a re-read that was DUE climbs the ladder. MemoreCards run as one continuous
  // sequence, so a student passes a theme's last card again by stepping back or
  // restarting the specialty; counting each pass pushed a theme read once today
  // out to 120 days. An early re-read leaves the schedule as it was.
  if (current?.due_date && toDateKeyBR(current.due_date as string) > todayKeyBR()) return;

  // The cadence (3 → 7 → 14 → 30 days) fits MedHelp 60D's window and never lands
  // after the student's exam — see lib/review/memorecard-reread.ts.
  const { data: memberships } = await supabase
    .from("user_cohort_memberships")
    .select("cohort:cohorts(test_date)")
    .eq("user_id", user.id);
  const today = todayKeyBR();
  const examDate =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((memberships ?? []) as any[])
      .map((m) => (m.cohort?.test_date ? toDateKeyBR(m.cohort.test_date as string) : ""))
      .filter((d) => d && d > today)
      .sort()[0] ?? null;

  const reps = current?.repetitions ?? 0;
  const { interval, due } = memorecardRereadDue(reps, today, examDate);

  await supabase.from("review_schedule").upsert(
    {
      user_id: user.id,
      item_type: "memorecard",
      item_id: pageId,
      ...(specialtyId != null ? { specialty_id: specialtyId } : {}),
      repetitions: reps + 1,
      interval_days: interval,
      due_date: due,
      last_reviewed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_type,item_id" },
  );
}

/** Remove an item from the review queue ("já domino isto"). */
export async function suspendReviewItem(itemType: ReviewItemType, itemId: number): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("review_schedule")
    .update({ suspended: true })
    .eq("user_id", user.id)
    .eq("item_type", itemType)
    .eq("item_id", itemId);
}

// ── Revisão by the student's choice (Karina 2026-11-19, 13h27 EST) ──────────────────────────────────────────
// Server Actions answer with values, never throw (production redacts thrown messages).

export type ReviewChoiceResult = { ok: true; chosen: boolean } | { ok: false; reason: "auth" | "invalid" | "not_wrong" | "error" };

/** The student's nearest exam date (BR day key), or null. */
async function nearestExamDate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  today: string,
): Promise<string | null> {
  const { data: memberships } = await supabase
    .from("user_cohort_memberships")
    .select("cohort:cohorts(test_date)")
    .eq("user_id", userId);
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((memberships ?? []) as any[])
      .map((m) => (m.cohort?.test_date ? toDateKeyBR(m.cohort.test_date as string) : ""))
      .filter((d) => d && d > today)
      .sort()[0] ?? null
  );
}

/**
 * "Quero revisar" on a WRONG Simulado 100Q question. Ticking puts it in the Revisão as a wrong answer (back the
 * next day, in "Só as que errei"); ticking an item already in the queue changes nothing (no duplicate, no reset).
 * Unticking suspends it — the same state as "Já domino isto", so the two stay in sync. Only a question of a
 * Simulado 100Q whose latest answer was wrong can be ticked.
 */
export async function setSimuladoQuestionReviewChoice(questionId: number, chosen: boolean): Promise<ReviewChoiceResult> {
  try {
    if (!Number.isInteger(questionId) || questionId <= 0) return { ok: false, reason: "invalid" };
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: "auth" };

    const admin = createAdminClient();
    const { data: q } = await admin
      .from("quiz_questions")
      .select("id, page:pages(view, content_module_id)")
      .eq("id", questionId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!q || !isSimulado100Page((q as any).page)) return { ok: false, reason: "invalid" };

    const { data: current } = await supabase
      .from("review_schedule")
      .select("suspended, lapses")
      .eq("user_id", user.id)
      .eq("item_type", "quiz_question")
      .eq("item_id", questionId)
      .maybeSingle();

    if (!chosen) {
      if (current && !current.suspended) {
        await supabase
          .from("review_schedule")
          .update({ suspended: true })
          .eq("user_id", user.id)
          .eq("item_type", "quiz_question")
          .eq("item_id", questionId);
      }
      return { ok: true, chosen: false };
    }

    if (current && !current.suspended) return { ok: true, chosen: true };

    // Only a question the student got wrong (their latest answer) may enter.
    const { data: last } = await admin
      .from("quiz_attempts")
      .select("is_correct")
      .eq("user_id", user.id)
      .eq("question_id", questionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last || last.is_correct !== false) return { ok: false, reason: "not_wrong" };

    const { error } = await supabase.from("review_schedule").upsert(
      {
        user_id: user.id,
        item_type: "quiz_question",
        item_id: questionId,
        suspended: false,
        ease_factor: SM2_DEFAULTS.ease_factor,
        interval_days: 1,
        repetitions: 0,
        lapses: Math.max(1, (current?.lapses as number | undefined) ?? 0),
        due_date: addDaysKey(todayKeyBR(), 1),
        last_reviewed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,item_type,item_id" },
    );
    if (error) return { ok: false, reason: "error" };
    return { ok: true, chosen: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * "Quero revisar" at the end of a Fórmula MedHelp page. Ticking enrols the page as a re-read (first one in 3 days,
 * then 7, 14, 30 — a step on/after the exam is never moved to the eve, just not offered); ticking an enrolled page
 * changes nothing. Unticking suspends it, keeping
 * the row (history). Independent of "Concluir leitura" and of the 60D checklist.
 */
export async function setFormulaReviewChoice(pageId: number, chosen: boolean): Promise<ReviewChoiceResult> {
  try {
    if (!Number.isInteger(pageId) || pageId <= 0) return { ok: false, reason: "invalid" };
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: "auth" };

    const admin = createAdminClient();
    const { data: page } = await admin.from("pages").select("id, view, specialty_id").eq("id", pageId).maybeSingle();
    if (!page || page.view !== "formula") return { ok: false, reason: "invalid" };

    const { data: current } = await supabase
      .from("review_schedule")
      .select("suspended")
      .eq("user_id", user.id)
      .eq("item_type", "formula")
      .eq("item_id", pageId)
      .maybeSingle();

    if (!chosen) {
      if (current && !current.suspended) {
        await supabase
          .from("review_schedule")
          .update({ suspended: true })
          .eq("user_id", user.id)
          .eq("item_type", "formula")
          .eq("item_id", pageId);
      }
      return { ok: true, chosen: false };
    }

    if (current && !current.suspended) return { ok: true, chosen: true };

    const today = todayKeyBR();
    // Plain step, never moved to the eve (Karina 2026-11-19, 20h21): a date past the exam is simply never offered.
    const { interval, due } = formulaRereadNext(0, today);
    const { error } = await supabase.from("review_schedule").upsert(
      {
        user_id: user.id,
        item_type: "formula",
        item_id: pageId,
        ...(page.specialty_id != null ? { specialty_id: page.specialty_id as number } : {}),
        suspended: false,
        repetitions: 1,
        interval_days: interval,
        due_date: due,
        last_reviewed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,item_type,item_id" },
    );
    if (error) return { ok: false, reason: "error" };
    return { ok: true, chosen: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * A due Fórmula re-read was done: the student reached the end of the page while the re-read was due. Climbs the
 * ladder (3 → 7 → 14 → 30). Reading before the date, or a page not in the queue, changes nothing.
 */
export async function completeFormulaReread(pageId: number): Promise<void> {
  try {
    if (!Number.isInteger(pageId) || pageId <= 0) return;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: current } = await supabase
      .from("review_schedule")
      .select("repetitions, due_date, suspended")
      .eq("user_id", user.id)
      .eq("item_type", "formula")
      .eq("item_id", pageId)
      .maybeSingle();
    const today = todayKeyBR();
    if (!current || current.suspended) return;
    if (!formulaRereadOffered(toDateKeyBR(current.due_date as string), today, await nearestExamDate(supabase, user.id, today))) return;
    const reps = (current.repetitions as number) ?? 1;
    const { interval, due } = formulaRereadNext(reps, today);
    await supabase
      .from("review_schedule")
      .update({ repetitions: reps + 1, interval_days: interval, due_date: due, last_reviewed_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("item_type", "formula")
      .eq("item_id", pageId);
  } catch {
    // Best-effort: the re-read stays due and is recorded on the next visit.
  }
}
