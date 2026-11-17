import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuestionReviewRow } from "./review-outcomes";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Every row of a per-user table, paginating past PostgREST's 1000-row cap. A
 * student passes 1,000 answers quickly (the bank alone has ~5,000 questions), and
 * a capped read ordered by date silently drops the NEWEST answers — exactly the
 * ones that decide what was done today and what is mastered.
 */
export async function fetchAllForUser<T>(
  admin: Admin,
  table: string,
  columns: string,
  userId: string,
  order: string[],
  eq: Record<string, string> = {},
): Promise<T[]> {
  const SIZE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += SIZE) {
    let q = admin.from(table).select(columns).eq("user_id", userId);
    for (const [col, val] of Object.entries(eq)) q = q.eq(col, val);
    for (const col of order) q = q.order(col);
    const { data, error } = await q.range(from, from + SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < SIZE) break;
  }
  return out;
}

/** The student's questions in the Revisão (see review-outcomes.ts). Empty when unavailable. */
export async function loadQuestionReviewRows(admin: Admin, userId: string): Promise<QuestionReviewRow[]> {
  try {
    const rows = await fetchAllForUser<{ item_id: number; repetitions: number | null; last_reviewed_at: string | null; suspended: boolean | null }>(
      admin, "review_schedule", "item_id, repetitions, last_reviewed_at, suspended", userId, ["item_id"],
      { item_type: "quiz_question" },
    );
    return rows.map((r) => ({
      item_id: Number(r.item_id),
      repetitions: Number(r.repetitions ?? 0),
      last_reviewed_at: r.last_reviewed_at,
      suspended: Boolean(r.suspended),
    }));
  } catch {
    return [];
  }
}
