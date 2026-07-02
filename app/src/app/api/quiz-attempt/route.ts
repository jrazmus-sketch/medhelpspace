import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeReviewItem } from "@/actions/review";

// IDs arrive as numbers from the quiz player (JSON.stringify of numeric props);
// specialtyId is optional (the route stores `specialtyId ?? null`).
const bodySchema = z.object({
  questionId: z.number().int().positive(),
  pageId: z.number().int().positive(),
  specialtyId: z.number().int().positive().nullish(),
  isCorrect: z.boolean(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { questionId, pageId, specialtyId, isCorrect } = parsed.data;

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("quiz_attempts")
    .insert({
      user_id: user.id,
      question_id: questionId,
      page_id: pageId,
      specialty_id: specialtyId ?? null,
      is_correct: isCorrect,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Enroll/schedule the question for spaced-repetition review. Answering it (in
  // the normal player) is what makes it "completed" and thus reviewable later.
  await gradeReviewItem("quiz_question", questionId, isCorrect ? "correct" : "incorrect", specialtyId ?? null);

  // attemptId lets the player attach an error-classification tag to THIS attempt.
  return NextResponse.json({ ok: true, attemptId: inserted.id });
}
