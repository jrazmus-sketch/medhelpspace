import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeReviewItem } from "@/actions/review";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { questionId, pageId, specialtyId, isCorrect } = await request.json();
  if (!questionId || !pageId || typeof isCorrect !== "boolean") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("quiz_attempts").insert({
    user_id: user.id,
    question_id: questionId,
    page_id: pageId,
    specialty_id: specialtyId ?? null,
    is_correct: isCorrect,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Enroll/schedule the question for spaced-repetition review. Answering it (in
  // the normal player) is what makes it "completed" and thus reviewable later.
  await gradeReviewItem("quiz_question", questionId, isCorrect ? "correct" : "incorrect", specialtyId ?? null);

  return NextResponse.json({ ok: true });
}
