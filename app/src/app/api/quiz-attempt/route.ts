import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeReviewItem } from "@/actions/review";
import { isSimulado100Page } from "@/lib/review/revisao-escolha";

// IDs arrive as numbers from the quiz player (JSON.stringify of numeric props);
// specialtyId is optional (the route stores `specialtyId ?? null`).
const bodySchema = z.object({
  questionId: z.number().int().positive(),
  pageId: z.number().int().positive(),
  specialtyId: z.number().int().positive().nullish(),
  isCorrect: z.boolean(),
  // Mini simulados: this answer begins a NEW run of the page ("Recomeçar", or a
  // finished simulado taken again). See quiz_runs.
  newRun: z.boolean().optional(),
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
  const { questionId, pageId, specialtyId, isCorrect, newRun } = parsed.data;

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
    .select("id, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // A new run begins AT this answer (the database's own timestamp, so the answer
  // can never fall before its run). Earlier attempts are not touched: the history
  // stays, only the mark of "where the current run starts" moves. Best-effort —
  // without the table the player simply reopens on question 1, as before.
  if (newRun) {
    await admin
      .from("quiz_runs")
      .upsert({ user_id: user.id, page_id: pageId, started_at: inserted.created_at }, { onConflict: "user_id,page_id" });
  }

  // Enroll/schedule the question for spaced-repetition review. Answering it (in
  // the normal player) is what makes it "completed" and thus reviewable later.
  // EXCEPT a Simulado 100Q question (Karina 2026-11-19): it enters the Revisão only when the student ticks
  // "Quero revisar" on it after getting it wrong (setSimuladoQuestionReviewChoice) — an answer, right or wrong,
  // never enrols it, and re-answering one already chosen leaves its schedule alone. Decided by the question's
  // OWN page, never the page the client names.
  const { data: own } = await admin
    .from("quiz_questions")
    .select("page:pages(view, content_module_id)")
    .eq("id", questionId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!isSimulado100Page((own as any)?.page)) {
    await gradeReviewItem("quiz_question", questionId, isCorrect ? "correct" : "incorrect", specialtyId ?? null);
  }

  // attemptId lets the player attach an error-classification tag to THIS attempt.
  return NextResponse.json({ ok: true, attemptId: inserted.id });
}
