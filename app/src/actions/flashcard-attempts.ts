"use server";

import { createClient } from "@/lib/supabase/server";

export async function recordFlashcardAttempt(
  flashcardItemId: number,
  result: "correct" | "incorrect",
  sessionId: string,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("flashcard_attempts").insert({
    user_id: user.id,
    flashcard_item_id: flashcardItemId,
    result,
    session_id: sessionId,
  });
}
