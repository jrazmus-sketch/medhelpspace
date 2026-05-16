"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Persist audio playback position for a lesson.
 * Called by AudioPlayer ~once every 10 seconds while playing.
 * Idempotent upsert on (user_id, lesson_id).
 */
export async function saveLessonPosition(
  lessonId: number,
  positionSeconds: number,
): Promise<void> {
  if (positionSeconds < 1) return; // don't persist near-zero positions
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("lesson_progress")
    .upsert(
      {
        user_id: user.id,
        lesson_id: lessonId,
        position_seconds: Math.floor(positionSeconds),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,lesson_id" },
    );
}
