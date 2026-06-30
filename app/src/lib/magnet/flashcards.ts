import { createAdminClient } from "@/lib/supabase/admin";

// Free flashcard deck for the magnet funnel (FREE-FUNNEL-BUILD-SPEC.md follow-up):
//   1. The standalone giveaway behind {{deckUrl}} (/flashcards-gratis) — the bonus
//      the D0 email + results page already promise, plus an SEO landing for the
//      "flashcards revalida" long-tail.
//   2. A short personalized taste on the magnet results view, pulled from the
//      lead's weak specialties so the offer *shows* the spaced-repetition system
//      instead of only naming it.
//
// Anonymous + public, so everything reads through the service-role admin client
// (the member FlashcardRenderer proves this path) — no auth, no progress writes.

// Canonical value lives in lib/page-templates.ts (FLASHCARDS_TRACK_ID); mirrored
// here as a const to keep this server module free of the page-editor's lucide
// imports (same pattern as AUDIOCARDS_TRACK_ID in lib/audiocards/discovery.ts).
const FLASHCARDS_TRACK_ID = 3;

export type MagnetFlashcard = {
  id: number;
  text: string;
  answer: string;
  image_url: string | null;
  tip: string | null;
  specialtyName: string | null;
};

// Optional curation override: pin specific flashcard_items.id here and they take
// precedence over the dynamic spread below (mirrors the quiz's MAGNET_*_IDS seed
// convention so Karina can hand-pick the free deck later — just fill the array).
export const FREE_DECK_OVERRIDE_IDS: number[] = [];

type ItemRow = {
  id: number;
  text: string;
  answer: string;
  image_url: string | null;
  tip: string | null;
  page_id: number;
};

// Shared tail: hydrate raw flashcard_items rows with their specialty name (via
// page_id → pages.specialty_id → specialties.name), preserving the given order.
async function withSpecialtyNames(rows: ItemRow[]): Promise<MagnetFlashcard[]> {
  if (rows.length === 0) return [];
  const admin = createAdminClient();
  const pageIds = [...new Set(rows.map((r) => r.page_id))];
  const { data: pages } = await admin
    .from("pages")
    .select("id, specialty_id")
    .in("id", pageIds);
  const specByPage = new Map<number, number | null>(
    (pages ?? []).map((p) => [p.id as number, (p.specialty_id as number | null) ?? null]),
  );
  const specIds = [...new Set([...specByPage.values()].filter((s): s is number => s != null))];
  const nameById = new Map<number, string>();
  if (specIds.length > 0) {
    const { data: specs } = await admin
      .from("specialties")
      .select("id, name")
      .in("id", specIds);
    for (const s of specs ?? []) nameById.set(s.id as number, s.name as string);
  }
  return rows.map((r) => {
    const specId = specByPage.get(r.page_id) ?? null;
    return {
      id: r.id,
      text: r.text,
      answer: r.answer,
      image_url: r.image_url ?? null,
      tip: r.tip ?? null,
      specialtyName: specId != null ? nameById.get(specId) ?? null : null,
    };
  });
}

// Read specific flashcard_items by id, in the requested order (used by the
// curation override).
async function getFlashcardsByIds(ids: number[]): Promise<MagnetFlashcard[]> {
  if (ids.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("flashcard_items")
    .select("id, text, answer, image_url, tip, page_id")
    .in("id", ids);
  const byId = new Map((data ?? []).map((r) => [r.id as number, r as ItemRow]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is ItemRow => Boolean(r));
  return withSpecialtyNames(ordered);
}

// One published flashcard deck page per specialty (track_id=3), so the free deck
// spreads across subjects. Returns [{ pageId, specialtyId }] capped at `limit`
// distinct specialties.
async function flashcardDeckPagesBySpecialty(
  limit: number,
  onlySpecialtyIds?: number[],
): Promise<{ pageId: number; specialtyId: number }[]> {
  const admin = createAdminClient();
  let q = admin
    .from("pages")
    .select("id, specialty_id")
    .eq("track_id", FLASHCARDS_TRACK_ID)
    .eq("status", "publish")
    .not("specialty_id", "is", null)
    .order("specialty_id");
  if (onlySpecialtyIds && onlySpecialtyIds.length > 0) {
    q = q.in("specialty_id", onlySpecialtyIds);
  }
  const { data: pages } = await q;
  const seen = new Set<number>();
  const out: { pageId: number; specialtyId: number }[] = [];
  for (const p of pages ?? []) {
    const sid = p.specialty_id as number;
    if (seen.has(sid)) continue;
    seen.add(sid);
    out.push({ pageId: p.id as number, specialtyId: sid });
    if (out.length >= limit) break;
  }
  return out;
}

// Pull the first `perPage` cards from each of the given deck pages, in
// group/position order. Used to assemble a spread without hardcoded ids.
async function firstCardsFromPages(
  pageIds: number[],
  perPage: number,
): Promise<ItemRow[]> {
  if (pageIds.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("flashcard_items")
    .select("id, text, answer, image_url, tip, page_id, group_position, position")
    .in("page_id", pageIds)
    .order("page_id")
    .order("group_position")
    .order("position");
  const takenByPage = new Map<number, number>();
  const out: ItemRow[] = [];
  for (const r of data ?? []) {
    const pid = r.page_id as number;
    const taken = takenByPage.get(pid) ?? 0;
    if (taken >= perPage) continue;
    takenByPage.set(pid, taken + 1);
    out.push(r as ItemRow);
  }
  return out;
}

/**
 * The standalone free deck (/flashcards-gratis). Curation override wins; otherwise
 * a dynamic spread of `perSpecialty` cards across up to `maxSpecialties` subjects,
 * ordered specialty-by-specialty so the deck visibly covers the range.
 */
export async function getFreeDeckCards(
  maxSpecialties = 8,
  perSpecialty = 2,
): Promise<MagnetFlashcard[]> {
  if (FREE_DECK_OVERRIDE_IDS.length > 0) {
    return getFlashcardsByIds(FREE_DECK_OVERRIDE_IDS);
  }
  const decks = await flashcardDeckPagesBySpecialty(maxSpecialties);
  const rows = await firstCardsFromPages(
    decks.map((d) => d.pageId),
    perSpecialty,
  );
  // firstCardsFromPages orders by page_id; re-thread to the specialty discovery
  // order (already specialty-sorted) so the deck alternates subjects up front.
  const pageOrder = new Map(decks.map((d, i) => [d.pageId, i]));
  rows.sort((a, b) => (pageOrder.get(a.page_id) ?? 0) - (pageOrder.get(b.page_id) ?? 0));
  return withSpecialtyNames(rows);
}

/**
 * A short personalized taste for the magnet results view: one card from each of
 * the lead's weak specialties (up to `limit`). Falls back to the generic free
 * deck when the lead has no identified weak specialties (e.g. a perfect score).
 */
export async function getSampleFlashcardsForSpecialties(
  specialtyIds: number[],
  limit = 3,
): Promise<MagnetFlashcard[]> {
  const uniqueWeak = [...new Set(specialtyIds.filter((s) => s != null))];
  if (uniqueWeak.length === 0) {
    return (await getFreeDeckCards(limit, 1)).slice(0, limit);
  }
  const decks = await flashcardDeckPagesBySpecialty(limit, uniqueWeak);
  const rows = await firstCardsFromPages(decks.map((d) => d.pageId), 1);
  if (rows.length === 0) {
    return (await getFreeDeckCards(limit, 1)).slice(0, limit);
  }
  const pageOrder = new Map(decks.map((d, i) => [d.pageId, i]));
  rows.sort((a, b) => (pageOrder.get(a.page_id) ?? 0) - (pageOrder.get(b.page_id) ?? 0));
  return (await withSpecialtyNames(rows)).slice(0, limit);
}
