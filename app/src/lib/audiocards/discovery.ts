import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";

// AudioCards are a passive listening aid, surfaced AROUND the flashcard study
// loop — never on a daily-plan task, never enrolled into review_schedule. This
// module resolves the audio destinations for the discovery surfaces (the
// post-flashcard-session nudge + the dashboard "revisão passiva" playlist).
//
// Targeting is by SPECIALTY (v1): every surface links to the specialty's
// `<spec>-audiocards` page. Topic-level deep-linking is deferred (needs a
// flashcard-deck → audiocard mapping first).
//
// "% ouvido" is read from the existing lesson_completions (audio sections
// auto-complete at 95% playback) — display-only, with ZERO effect on SM-2.

const AUDIOCARDS_TRACK_ID = 2;
const RECENT_DAYS = 14;
const MAX_PLAYLIST = 6;

export type AudiocardsPlaylistItem = {
  pageId: number;
  specialtyId: number;
  specialtySlug: string;
  specialtyName: string;
  href: string;
  totalLessons: number;
  completedLessons: number;
  /** 0–100, completed / total lessons. Display only — never feeds review_schedule. */
  pctListened: number;
  /** ISO timestamp of the student's most recent flashcard attempt in this specialty. */
  lastStudiedAt: string;
};

/**
 * The `<spec>-audiocards` page slug for a specialty, or null when none is
 * published. The caller composes the href with its own (same) specialty slug.
 */
export async function getAudiocardsSlugForSpecialty(
  specialtyId: number | null,
): Promise<string | null> {
  if (USE_MOCK_DATA || specialtyId == null) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("pages")
    .select("slug")
    .eq("track_id", AUDIOCARDS_TRACK_ID)
    .eq("specialty_id", specialtyId)
    .eq("status", "publish")
    .limit(1)
    .maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

/**
 * Standing playlist for the dashboard: the audiocards pages for the specialties
 * the student has practiced flashcards in over the last {RECENT_DAYS} days,
 * most-recent first, each with a display-only "% ouvido". Returns [] when there
 * is no recent flashcard activity (the card then hides entirely).
 */
export async function getAudiocardsPlaylist(
  userId: string,
): Promise<AudiocardsPlaylistItem[]> {
  if (USE_MOCK_DATA) return [];
  const admin = createAdminClient();

  // 1. Recent flashcard attempts → which cards, and when.
  // NB: flashcard_attempts timestamps the row as `attempted_at` (NOT created_at).
  const sinceIso = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
  const { data: attempts } = await admin
    .from("flashcard_attempts")
    .select("flashcard_item_id, attempted_at")
    .eq("user_id", userId)
    .gte("attempted_at", sinceIso);
  if (!attempts || attempts.length === 0) return [];

  const latestByItem = new Map<number, string>();
  for (const a of attempts) {
    const id = a.flashcard_item_id as number;
    const t = a.attempted_at as string;
    const cur = latestByItem.get(id);
    if (!cur || t > cur) latestByItem.set(id, t);
  }
  const itemIds = [...latestByItem.keys()];

  // 2. cards → their flashcard page.
  const { data: items } = await admin
    .from("flashcard_items")
    .select("id, page_id")
    .in("id", itemIds);
  if (!items || items.length === 0) return [];
  const pageIdByItem = new Map<number, number>();
  for (const it of items) pageIdByItem.set(it.id as number, it.page_id as number);

  // 3. flashcard pages → specialty, and the latest activity per specialty.
  const flashPageIds = [...new Set(items.map((i) => i.page_id as number))];
  const { data: flashPages } = await admin
    .from("pages")
    .select("id, specialty_id")
    .in("id", flashPageIds);
  const specByFlashPage = new Map<number, number>();
  for (const p of flashPages ?? []) {
    if (p.specialty_id != null) specByFlashPage.set(p.id as number, p.specialty_id as number);
  }

  const latestBySpecialty = new Map<number, string>();
  for (const [itemId, t] of latestByItem) {
    const pageId = pageIdByItem.get(itemId);
    if (pageId == null) continue;
    const specId = specByFlashPage.get(pageId);
    if (specId == null) continue;
    const cur = latestBySpecialty.get(specId);
    if (!cur || t > cur) latestBySpecialty.set(specId, t);
  }
  const specialtyIds = [...latestBySpecialty.keys()];
  if (specialtyIds.length === 0) return [];

  // 4. audiocards pages for those specialties + 5. specialty names/slugs.
  const [{ data: audioPages }, { data: specs }] = await Promise.all([
    admin
      .from("pages")
      .select("id, slug, specialty_id")
      .eq("track_id", AUDIOCARDS_TRACK_ID)
      .eq("status", "publish")
      .in("specialty_id", specialtyIds),
    admin.from("specialties").select("id, slug, name").in("id", specialtyIds),
  ]);
  if (!audioPages || audioPages.length === 0) return [];

  const specMap = new Map<number, { slug: string; name: string }>();
  for (const s of specs ?? []) {
    specMap.set(s.id as number, { slug: s.slug as string, name: s.name as string });
  }

  // 6. lesson totals per audio page + the user's completed ("ouvido") lessons.
  const audioPageIds = audioPages.map((p) => p.id as number);
  const [{ data: lessonRows }, { data: completionRows }] = await Promise.all([
    admin.from("lessons").select("page_id").in("page_id", audioPageIds),
    admin
      .from("lesson_completions")
      .select("page_id")
      .eq("user_id", userId)
      .in("page_id", audioPageIds),
  ]);
  const totalByPage = new Map<number, number>();
  for (const l of lessonRows ?? []) {
    const pid = l.page_id as number;
    totalByPage.set(pid, (totalByPage.get(pid) ?? 0) + 1);
  }
  const doneByPage = new Map<number, number>();
  for (const c of completionRows ?? []) {
    const pid = c.page_id as number;
    doneByPage.set(pid, (doneByPage.get(pid) ?? 0) + 1);
  }

  // 7. Assemble, sort by most recent flashcard activity, cap.
  const result: AudiocardsPlaylistItem[] = [];
  for (const ap of audioPages) {
    const specId = ap.specialty_id as number;
    const spec = specMap.get(specId);
    if (!spec) continue;
    const total = totalByPage.get(ap.id as number) ?? 0;
    const done = Math.min(doneByPage.get(ap.id as number) ?? 0, total);
    result.push({
      pageId: ap.id as number,
      specialtyId: specId,
      specialtySlug: spec.slug,
      specialtyName: spec.name,
      href: `/app/${spec.slug}/${ap.slug}`,
      totalLessons: total,
      completedLessons: done,
      pctListened: total > 0 ? Math.round((done / total) * 100) : 0,
      lastStudiedAt: latestBySpecialty.get(specId) ?? "",
    });
  }

  result.sort((a, b) =>
    a.lastStudiedAt < b.lastStudiedAt ? 1 : a.lastStudiedAt > b.lastStudiedAt ? -1 : 0,
  );
  return result.slice(0, MAX_PLAYLIST);
}
