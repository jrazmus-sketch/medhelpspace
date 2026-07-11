"use server";

// Server actions for /admin/simulado-100 — Karina's pre-launch review of the
// free 100-question simulado set. Writes go through the SERVICE-ROLE admin
// client (simulado_review_flags is deny-all RLS), so every export re-checks the
// caller's role in app code — same defense-in-depth as studio-deck.ts.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIMULADO_100_IDS } from "@/lib/magnet/simulado-questions";

const REVIEW_ROLES = ["super_admin", "content_admin"];

async function requireReviewRole(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile?.role as string) ?? "member";
  if (!REVIEW_ROLES.includes(role)) throw new Error("Unauthorized");
  return user.id;
}

// Flag / unflag one question of the current simulado set. Presence of a row =
// flagged (unflagging deletes it); `note` is Karina's reason ("anulada 2022.2",
// "enunciado truncado", …). Only ids in the CURRENT set are accepted.
export async function setSimuladoReviewFlag(input: {
  questionId: number;
  flagged: boolean;
  note?: string | null;
}): Promise<{ ok: boolean }> {
  const userId = await requireReviewRole();

  const questionId = Number(input.questionId);
  if (!SIMULADO_100_IDS.includes(questionId)) return { ok: false };
  const note = (input.note ?? "").trim().slice(0, 500) || null;

  const admin = createAdminClient();
  if (!input.flagged) {
    const { error } = await admin
      .from("simulado_review_flags")
      .delete()
      .eq("question_id", questionId);
    if (error) {
      console.error("setSimuladoReviewFlag delete failed:", error.message);
      return { ok: false };
    }
    return { ok: true };
  }

  const { error } = await admin.from("simulado_review_flags").upsert(
    {
      question_id: questionId,
      note,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "question_id" },
  );
  if (error) {
    console.error("setSimuladoReviewFlag upsert failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
