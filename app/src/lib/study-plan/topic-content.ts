import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { TopicContentRow } from "./derive";

type Admin = ReturnType<typeof createAdminClient>;

const PAGE = 1000;

/**
 * Every Meu Plano content link (topic → section, Flashcards group, MedVoice lesson, Revalida Up, Resumo).
 *
 * Paginated: R1 adds the topics' Resumo links, which brings the table close to PostgREST's 1000-row cap,
 * and a truncated read would silently drop links. Reads the R4b stable group id when the column exists;
 * where schema-patch-r4b has not been applied yet, falls back to the old columns so the plan never breaks.
 */
export async function fetchTopicContent(admin: Admin): Promise<{ data: TopicContentRow[]; error: string | null }> {
  for (const cols of [
    "id, topic_id, resource_type, page_id, question_filter, flashcard_group_id",
    "id, topic_id, resource_type, page_id, question_filter",
  ]) {
    const rows: TopicContentRow[] = [];
    let failed: string | null = null;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("topic_content")
        .select(cols)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) {
        failed = error.message;
        break;
      }
      rows.push(...((data ?? []) as unknown as TopicContentRow[]));
      if (!data || data.length < PAGE) break;
    }
    if (!failed) return { data: rows, error: null };
    if (cols.includes("flashcard_group_id")) continue;
    return { data: [], error: failed };
  }
  return { data: [], error: "unreachable" };
}
