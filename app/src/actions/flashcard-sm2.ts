"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * SM-2 spaced repetition update.
 *
 * Called when the user answers a flashcard. Persists scheduling state to
 * flashcard_progress so the card resurfaces at the right interval next time.
 *
 * Algorithm (binary correct/incorrect input):
 *   Correct  → Q=4: interval grows (1→6→prev×ease), ease unchanged
 *   Incorrect → Q=2: interval = 1, ease -= 0.20 (floor 1.3), repetitions = 0
 */
export async function updateFlashcardSM2(
  flashcardItemId: number,
  result: "correct" | "incorrect",
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Load current state (may not exist yet)
  const { data: current } = await supabase
    .from("flashcard_progress")
    .select("ease_factor, interval_days, repetitions")
    .eq("user_id", user.id)
    .eq("flashcard_item_id", flashcardItemId)
    .maybeSingle();

  const prevEase = current?.ease_factor != null ? Number(current.ease_factor) : 2.5;
  const prevInterval = current?.interval_days ?? 1;
  const prevReps = current?.repetitions ?? 0;

  let newEase = prevEase;
  let newInterval: number;
  let newReps: number;

  if (result === "correct") {
    newReps = prevReps + 1;
    if (newReps === 1) newInterval = 1;
    else if (newReps === 2) newInterval = 6;
    else newInterval = Math.round(prevInterval * prevEase);
  } else {
    newReps = 0;
    newInterval = 1;
    newEase = Math.max(1.3, prevEase - 0.20);
  }

  const due = new Date();
  due.setDate(due.getDate() + newInterval);
  const dueDate = due.toISOString().split("T")[0];

  await supabase
    .from("flashcard_progress")
    .upsert(
      {
        user_id: user.id,
        flashcard_item_id: flashcardItemId,
        ease_factor: newEase,
        interval_days: newInterval,
        repetitions: newReps,
        due_date: dueDate,
        last_reviewed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,flashcard_item_id" },
    );
}
