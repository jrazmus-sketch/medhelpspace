import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";

/**
 * Live counts for the landing-page "big numbers" band (StatsNumbers).
 *
 * These are marketing figures, but they must be TRUE and self-updating: as
 * Karina imports decks/questions/audio the landing page should reflect it
 * without anyone editing a constant. So every number is a real `count(*)` over
 * what is ACTIVE on the site (i.e. on a published page), never a hardcoded value.
 *
 * Why the admin (service-role) client: the landing page is public/anonymous, but
 * flashcards, quiz_questions and lessons are all behind RLS that requires an
 * active membership. An anon client would count 0. We only ever return aggregate
 * counts here — no content rows — so bypassing RLS for the tally is safe.
 *
 * Cost: the landing page is ISR-cached (`revalidate = 3600`), so this runs at
 * most once an hour. New content therefore surfaces within the hour.
 *
 * Counting rules (agreed 2026-07-01):
 *  - flashcards      → flashcard_items on published pages
 *                      (retired cards live in *_backup_prekarina, never counted)
 *  - questoes        → ALL quiz_questions on published pages (simulados + the
 *                      "Questões comentadas" section), matching the marketing intent
 *  - audios          → published MedVoice lessons that have an audio_url set
 *                      (a handful may be pending CDN reconciliation)
 *  - especialidades  → active specialties, excluding the "outros" catch-all bucket
 */

export interface LandingStats {
  flashcards: number;
  questoes: number;
  audios: number;
  especialidades: number;
}

// Last-known-good values. Used in mock mode and as a per-stat safety net so a
// transient DB error can never render a "0" on the public landing page.
const FALLBACK_STATS: LandingStats = {
  flashcards: 5280,
  questoes: 2518,
  audios: 164,
  especialidades: 17,
};

export async function getLandingStats(): Promise<LandingStats> {
  if (USE_MOCK_DATA) return FALLBACK_STATS;

  try {
    const admin = createAdminClient();

    // MedVoice track id (don't hardcode — resolve by slug).
    const { data: track } = await admin
      .from("tracks")
      .select("id")
      .eq("slug", "medvoice")
      .single();
    const medvoiceId = track?.id ?? null;

    const [flashcards, questoes, audios, especialidades] = await Promise.all([
      admin
        .from("flashcard_items")
        .select("page_id, pages!inner(status)", { count: "exact", head: true })
        .eq("pages.status", "publish"),
      admin
        .from("quiz_questions")
        .select("page_id, pages!inner(status)", { count: "exact", head: true })
        .eq("pages.status", "publish"),
      medvoiceId == null
        ? Promise.resolve({ count: null, error: true } as const)
        : admin
            .from("lessons")
            .select("id, pages!inner(status, track_id)", { count: "exact", head: true })
            .eq("pages.status", "publish")
            .eq("pages.track_id", medvoiceId)
            .not("audio_url", "is", null),
      admin
        .from("specialties")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .neq("slug", "outros"),
    ]);

    // Per-stat fallback: keep a good number if any single query hiccups.
    return {
      flashcards: flashcards.count ?? FALLBACK_STATS.flashcards,
      questoes: questoes.count ?? FALLBACK_STATS.questoes,
      audios: audios.count ?? FALLBACK_STATS.audios,
      especialidades: especialidades.count ?? FALLBACK_STATS.especialidades,
    };
  } catch {
    return FALLBACK_STATS;
  }
}
