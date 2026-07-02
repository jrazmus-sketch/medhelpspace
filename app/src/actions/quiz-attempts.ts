"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isQuizErrorCategory } from "@/lib/quiz-errors";

// NOTE: "use server" modules may only export async functions. Error-category
// constants/types live in "@/lib/quiz-errors" (a plain module), imported here
// and by the client/report code.

/**
 * Tag a wrong quiz attempt with WHY the student missed it (error classification).
 * Ownership-guarded: only the attempt's owner may tag it. `category = null`
 * clears a tag. Writes go through the service-role client (quiz_attempts has no
 * UPDATE RLS policy) behind an explicit user_id match — same pattern as the
 * attempt insert in /api/quiz-attempt.
 */
export async function setQuizErrorTag(
  attemptId: number,
  category: string | null,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  if (category !== null && !isQuizErrorCategory(category)) return { ok: false };
  if (!Number.isInteger(attemptId) || attemptId <= 0) return { ok: false };

  const admin = createAdminClient();
  const { error } = await admin
    .from("quiz_attempts")
    .update({ error_category: category })
    .eq("id", attemptId)
    .eq("user_id", user.id); // ownership guard — can't tag someone else's attempt

  return { ok: !error };
}
