"use server";

import { createClient } from "@/lib/supabase/server";
import { nextSm2, dueDateAfter, SM2_DEFAULTS, type ReviewResult } from "@/lib/review/sm2";

export type ReviewItemType = "flashcard" | "quiz_question" | "memorecard";

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

// Re-read cadence for MemoreCards. They're passive presentation slides (no
// front/back), so there's no correct/incorrect to grade — instead a deck just
// resurfaces on an expanding "see it again" schedule. Indexed by repetitions.
const MEMORECARD_REREAD_INTERVALS = [7, 21, 60, 120];

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
    .select("repetitions")
    .eq("user_id", user.id)
    .eq("item_type", "memorecard")
    .eq("item_id", pageId)
    .maybeSingle();

  const reps = current?.repetitions ?? 0;
  const interval =
    MEMORECARD_REREAD_INTERVALS[Math.min(reps, MEMORECARD_REREAD_INTERVALS.length - 1)];

  await supabase.from("review_schedule").upsert(
    {
      user_id: user.id,
      item_type: "memorecard",
      item_id: pageId,
      ...(specialtyId != null ? { specialty_id: specialtyId } : {}),
      repetitions: reps + 1,
      interval_days: interval,
      due_date: dueDateAfter(interval),
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
