import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side review queries. Per the project's data-fetching invariant these
 * are plain async functions called from server components (never the browser
 * client). They read through the admin client filtered by `user_id` — the same
 * service-role pattern the dashboard uses for per-user data.
 */

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

export interface ReviewCounts {
  /** All non-suspended items due on/before today, across types. */
  dueTotal: number;
  /** Flashcards due (the only active type in Phase 1). */
  dueFlashcards: number;
}

export async function getReviewCounts(userId: string): Promise<ReviewCounts> {
  const admin = createAdminClient();
  const today = todayKey();

  const base = () =>
    admin
      .from("review_schedule")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("suspended", false)
      .lte("due_date", today);

  const [{ count: dueTotal }, { count: dueFlashcards }] = await Promise.all([
    base(),
    base().eq("item_type", "flashcard"),
  ]);

  return { dueTotal: dueTotal ?? 0, dueFlashcards: dueFlashcards ?? 0 };
}

export interface DueFlashcard {
  flashcardItemId: number;
  text: string;
  answer: string;
  image_url: string | null;
  tip: string | null;
  specialtyId: number | null;
}

/**
 * The flashcards a user owes a review on today, oldest-due first, joined to
 * their card content. Capped to keep a session humane.
 */
export async function getDueFlashcards(userId: string, limit = 60): Promise<DueFlashcard[]> {
  const admin = createAdminClient();
  const today = todayKey();

  const { data: due } = await admin
    .from("review_schedule")
    .select("item_id, specialty_id")
    .eq("user_id", userId)
    .eq("item_type", "flashcard")
    .eq("suspended", false)
    .lte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(limit);

  const rows = due ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.item_id as number);
  const { data: items } = await admin
    .from("flashcard_items")
    .select("id, text, answer, image_url, tip")
    .in("id", ids);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map((items ?? []).map((i: any) => [i.id as number, i]));

  return rows
    .map((r): DueFlashcard | null => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const it = byId.get(r.item_id as number) as any;
      if (!it) return null;
      return {
        flashcardItemId: r.item_id as number,
        text: it.text ?? "",
        answer: it.answer ?? "",
        image_url: it.image_url ?? null,
        tip: it.tip ?? null,
        specialtyId: (r.specialty_id as number | null) ?? null,
      };
    })
    .filter((x): x is DueFlashcard => x !== null);
}
