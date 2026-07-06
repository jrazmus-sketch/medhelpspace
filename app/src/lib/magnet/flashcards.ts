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

// ═══════════════════════════════════════════════════════════════════════════════
// Weighted "high-yield" deck — the 50-card gift for the gift-first magnet
// (/flashcards-revalida). Composition is INCIDENCE-DRIVEN so the "chosen by
// statistics" claim is true at both the subject and theme level.
// ═══════════════════════════════════════════════════════════════════════════════

// Exam-analysis headline stats (real past-exam question incidence, topics table,
// 2020–2025). Verified against prod: 881 total across 211 topics; the six subjects
// below hold 553 of them (~63% of the exam). Surfaced in the landing "por que esses
// assuntos?" section — keep in sync with the numbers below.
//
// CLAIM GUARDRAIL: these six are the 5 standalone exam areas (Cirurgia, Ginecologia,
// Obstetrícia, Pediatria, Saúde Coletiva) + Infectologia, which is just ONE of the 12
// sub-specialties grouped under Clínica Médica (schema-patch-003). Clínica Médica AS A
// WHOLE is the exam's largest area, so do NOT phrase the copy as "the 6 highest-incidence
// areas / os 6 que mais caem por ranking" — that invites the "cadê a Clínica Médica?"
// objection. Frame it as concentration ("juntos concentram 63%"), which is true
// regardless of how the areas are aggregated. The landing copy is worded accordingly.
export const WEIGHTED_DECK_STATS = {
  totalCards: 50,
  examQuestionsAnalyzed: 881,
  sixSubjectQuestions: 553,
  sixSubjectSharePct: 63,
  topicsAnalyzed: 211,
  examYears: "2020–2025",
} as const;

// The six most-tested subjects with a deck, card counts weighted by real past-exam
// incidence (pastExamQuestions), summing to 50. specialty_id is the prod id.
export const WEIGHTED_DECK_PLAN: {
  specialtyId: number;
  slug: string;
  name: string;
  pastExamQuestions: number;
  cards: number;
}[] = [
  { specialtyId: 16, slug: "pediatria", name: "Pediatria", pastExamQuestions: 109, cards: 10 },
  { specialtyId: 13, slug: "cirurgia-geral", name: "Cirurgia Geral", pastExamQuestions: 107, cards: 10 },
  { specialtyId: 14, slug: "ginecologia", name: "Ginecologia", pastExamQuestions: 98, cards: 9 },
  { specialtyId: 15, slug: "obstetricia", name: "Obstetrícia", pastExamQuestions: 93, cards: 8 },
  { specialtyId: 17, slug: "saude-coletiva", name: "Saúde Coletiva", pastExamQuestions: 92, cards: 8 },
  { specialtyId: 7, slug: "infectologia", name: "Infectologia", pastExamQuestions: 54, cards: 5 },
];

// Within each subject, draw cards round-robin from the N highest-incidence themes.
const WEIGHTED_TOP_THEMES = 5;

function normThemeName(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type LightItem = { id: number; page_id: number; group_label: string | null; group_position: number; position: number };

/**
 * The 50-card weighted high-yield deck. Deterministic (same 50 cards every load, so
 * the deck matches the marketing claim and the magic-link deck is stable):
 *   • subject mix + counts are incidence-weighted (WEIGHTED_DECK_PLAN);
 *   • within a subject, cards come round-robin from the top themes by incidence
 *     (topics.incidence_count matched to flashcard group_label by normalized name);
 *   • subjects are interleaved round-robin so the first cards span all six subjects.
 * Two-step fetch: rank on lightweight (id, label) rows, hydrate full text for the 50.
 */
export async function getWeightedRevalidaDeck(): Promise<MagnetFlashcard[]> {
  const admin = createAdminClient();
  const specialtyIds = WEIGHTED_DECK_PLAN.map((p) => p.specialtyId);

  // 1) One published flashcard deck page per specialty (lowest id wins).
  const { data: pages } = await admin
    .from("pages")
    .select("id, specialty_id")
    .eq("track_id", FLASHCARDS_TRACK_ID)
    .eq("status", "publish")
    .in("specialty_id", specialtyIds)
    .order("id");
  const pageBySpecialty = new Map<number, number>();
  const specByPage = new Map<number, number>();
  for (const p of pages ?? []) {
    const sid = p.specialty_id as number;
    if (!pageBySpecialty.has(sid)) {
      pageBySpecialty.set(sid, p.id as number);
      specByPage.set(p.id as number, sid);
    }
  }
  const pageIds = [...pageBySpecialty.values()];
  if (pageIds.length === 0) return [];

  // 2) Topic incidence per specialty → theme ranking key `${specId}::${normName}`.
  const { data: topics } = await admin
    .from("topics")
    .select("specialty_id, name, incidence_count")
    .in("specialty_id", specialtyIds);
  const incidenceBySpecTheme = new Map<string, number>();
  for (const t of topics ?? []) {
    const sid = t.specialty_id as number | null;
    if (sid == null) continue;
    incidenceBySpecTheme.set(`${sid}::${normThemeName(t.name as string)}`, (t.incidence_count as number) ?? 0);
  }

  // 3) Lightweight rows for all six decks, in deck order.
  const { data: rows } = await admin
    .from("flashcard_items")
    .select("id, page_id, group_label, group_position, position")
    .in("page_id", pageIds)
    .order("page_id")
    .order("group_position")
    .order("position");

  // Group by (specialty → theme → ordered cards).
  const bySpecTheme = new Map<number, Map<string, LightItem[]>>();
  for (const r of (rows ?? []) as LightItem[]) {
    const sid = specByPage.get(r.page_id);
    if (sid == null) continue;
    if (!bySpecTheme.has(sid)) bySpecTheme.set(sid, new Map());
    const themeMap = bySpecTheme.get(sid)!;
    const key = r.group_label ?? "";
    if (!themeMap.has(key)) themeMap.set(key, []);
    themeMap.get(key)!.push(r);
  }

  // 4) Per subject: rank themes by incidence, round-robin the top themes for `cards`.
  const perSubject = new Map<number, LightItem[]>();
  for (const plan of WEIGHTED_DECK_PLAN) {
    const themeMap = bySpecTheme.get(plan.specialtyId);
    if (!themeMap) {
      perSubject.set(plan.specialtyId, []);
      continue;
    }
    const themes = [...themeMap.entries()]
      .map(([label, cards]) => ({
        cards,
        incidence: incidenceBySpecTheme.get(`${plan.specialtyId}::${normThemeName(label)}`) ?? -1,
      }))
      .sort((a, b) => b.incidence - a.incidence);
    const topThemes = themes.slice(0, WEIGHTED_TOP_THEMES);
    const selected: LightItem[] = [];
    const cursors = topThemes.map(() => 0);
    let progressed = true;
    while (selected.length < plan.cards && progressed) {
      progressed = false;
      for (let i = 0; i < topThemes.length && selected.length < plan.cards; i++) {
        if (cursors[i] < topThemes[i].cards.length) {
          selected.push(topThemes[i].cards[cursors[i]]);
          cursors[i]++;
          progressed = true;
        }
      }
    }
    // Fallback for an unexpectedly thin deck: top up from the rest in deck order.
    if (selected.length < plan.cards) {
      const chosen = new Set(selected.map((c) => c.id));
      for (const [, cards] of themeMap) {
        for (const c of cards) {
          if (selected.length >= plan.cards) break;
          if (!chosen.has(c.id)) {
            selected.push(c);
            chosen.add(c.id);
          }
        }
        if (selected.length >= plan.cards) break;
      }
    }
    perSubject.set(plan.specialtyId, selected);
  }

  // 5) Interleave subjects round-robin (breadth first).
  const order = WEIGHTED_DECK_PLAN.map((p) => p.specialtyId);
  const cursors = new Map(order.map((sid) => [sid, 0]));
  const orderedIds: number[] = [];
  let more = true;
  while (more) {
    more = false;
    for (const sid of order) {
      const list = perSubject.get(sid) ?? [];
      const c = cursors.get(sid)!;
      if (c < list.length) {
        orderedIds.push(list[c].id);
        cursors.set(sid, c + 1);
        more = true;
      }
    }
  }

  // 6) Hydrate full card content for the chosen 50, preserving order.
  return getFlashcardsByIds(orderedIds);
}
