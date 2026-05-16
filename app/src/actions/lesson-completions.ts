"use server";

import { createClient } from "@/lib/supabase/server";

export async function recordLessonCompletion(
  lessonId: number,
  pageId: number,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("lesson_completions")
    .upsert(
      { user_id: user.id, lesson_id: lessonId, page_id: pageId },
      { onConflict: "user_id,lesson_id", ignoreDuplicates: true },
    );
}
