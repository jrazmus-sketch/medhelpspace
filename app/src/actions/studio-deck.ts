"use server";

// Server actions for the Instagram Studio deck generator (flashcards + quiz).
//
// These read content through the SERVICE-ROLE admin client (RLS is bypassed —
// see feedback_content_route_bypasses_rls), so every export re-checks the
// caller's role in app code. The studio is fenced to content-capable roles (see
// estudio/page.tsx); we mirror that here as defense-in-depth, since a server
// action is a directly-callable endpoint.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DeckSubject,
  DeckCard,
  QuizDeckCard,
  DeckSelection,
  DeckBuildOptions,
  DeckItemPreview,
  DeckSource,
} from "@/lib/studio/deck-types";

const STUDIO_ROLES = ["super_admin", "content_admin"];
// Canonical value lives in lib/page-templates.ts (FLASHCARDS_TRACK_ID); mirrored
// here to keep this module free of the page-editor's client imports (same
// pattern as lib/magnet/flashcards.ts).
const FLASHCARDS_TRACK_ID = 3;

async function requireStudioRole(): Promise<void> {
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
  if (!STUDIO_ROLES.includes(role)) throw new Error("Unauthorized");
}

// Fisher-Yates (server-side Math.random is fine — this isn't a workflow script).
function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Minimal HTML → plain text for card display (quiz stems/options/explanations are
// stored as HTML). Turns block boundaries into spaces, strips tags, decodes the
// handful of entities the content actually uses, and collapses whitespace.
function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&#x27;|&rsquo;|&#8217;/gi, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#8211;|&ndash;/gi, "–")
    .replace(/\s+/g, " ")
    .trim();
}

// Hydrate specialties by id → name + slug.
async function specMetaForIds(
  admin: ReturnType<typeof createAdminClient>,
  specialtyIds: number[],
): Promise<Map<number, { name: string; slug: string | null }>> {
  const out = new Map<number, { name: string; slug: string | null }>();
  const ids = [...new Set(specialtyIds.filter((s): s is number => s != null))];
  if (ids.length === 0) return out;
  const { data } = await admin.from("specialties").select("id, name, slug").in("id", ids);
  for (const s of data ?? []) {
    out.set(s.id as number, { name: s.name as string, slug: (s.slug as string | null) ?? null });
  }
  return out;
}

// De-duplicate a selection list into ordered keys (first occurrence wins), a
// key→count map (last write wins, clamped), and a key→picked-id-set map for
// subjects in manual mode (last write wins).
function normalizeSelections(selections: DeckSelection[]): {
  orderedKeys: number[];
  countByKey: Map<number, number>;
  pickedByKey: Map<number, Set<number>>;
} {
  const clean = selections.filter((s) => s.key && (s.count > 0 || (s.pickedIds?.length ?? 0) > 0));
  const orderedKeys: number[] = [];
  const seen = new Set<number>();
  const countByKey = new Map<number, number>();
  const pickedByKey = new Map<number, Set<number>>();
  for (const s of clean) {
    if (!seen.has(s.key)) {
      seen.add(s.key);
      orderedKeys.push(s.key);
    }
    countByKey.set(s.key, Math.max(0, Math.min(500, Math.floor(s.count))));
    if (s.pickedIds && s.pickedIds.length > 0) {
      pickedByKey.set(s.key, new Set(s.pickedIds));
    } else {
      pickedByKey.delete(s.key);
    }
  }
  return { orderedKeys, countByKey, pickedByKey };
}

// Per-subject item selection shared by both build functions: manual mode uses
// exactly the picked ids (order preserved, image/exclude filters bypassed —
// the pick is an explicit override); auto mode applies skip-image + exclude +
// count/shuffle as before. `hasImage` lets quiz cards (which don't carry the
// flag on the card itself) reuse the same path via a lookup set.
function selectForSubject<T extends { id: number }>(
  all: T[],
  picked: Set<number> | undefined,
  want: number,
  o: { shuffle: boolean; skipImageCards: boolean; exclude: Set<number>; hasImage: (c: T) => boolean },
): T[] {
  if (picked && picked.size > 0) return all.filter((c) => picked.has(c.id));
  let pool = all;
  if (o.skipImageCards) pool = pool.filter((c) => !o.hasImage(c));
  if (o.exclude.size > 0) pool = pool.filter((c) => !o.exclude.has(c.id));
  return o.shuffle ? shuffled(pool).slice(0, want) : pool.slice(0, want);
}

// Truncate a one-line label for the picker (keeps payloads small; the full text
// is re-fetched at build time regardless).
function truncateLabel(s: string, max = 140): string {
  const clean = s.trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

// Arrange per-subject sampled lists into one deck: round-robin (interleave) or
// grouped subject-by-subject, then cap.
function arrangeDeck<T>(orderedKeys: number[], byKey: Map<number, T[]>, interleave: boolean, cap: number): T[] {
  const out: T[] = [];
  if (interleave) {
    const lists = orderedKeys.map((k) => byKey.get(k) ?? []);
    const max = lists.reduce((m, l) => Math.max(m, l.length), 0);
    for (let i = 0; i < max; i++) {
      for (const l of lists) if (i < l.length) out.push(l[i]);
    }
  } else {
    for (const k of orderedKeys) out.push(...(byKey.get(k) ?? []));
  }
  const n = Math.max(1, Math.min(200, Math.floor(cap || 50)));
  return out.slice(0, n);
}

// ── Flashcards ───────────────────────────────────────────────────────────────

/**
 * Every published flashcard deck page (track_id=3) with at least one card, as a
 * subject (`key` = page id). Source list for the flashcard picker.
 */
export async function getFlashcardSubjects(): Promise<DeckSubject[]> {
  await requireStudioRole();
  const admin = createAdminClient();

  const { data: pages } = await admin
    .from("pages")
    .select("id, title, specialty_id")
    .eq("track_id", FLASHCARDS_TRACK_ID)
    .eq("status", "publish")
    .order("title");
  const deckPages = pages ?? [];
  if (deckPages.length === 0) return [];

  const pageIds = deckPages.map((p) => p.id as number);
  const { data: items } = await admin.from("flashcard_items").select("page_id").in("page_id", pageIds);
  const countByPage = new Map<number, number>();
  for (const it of items ?? []) {
    const pid = it.page_id as number;
    countByPage.set(pid, (countByPage.get(pid) ?? 0) + 1);
  }

  const specById = await specMetaForIds(
    admin,
    deckPages.map((p) => p.specialty_id as number | null).filter((s): s is number => s != null),
  );

  return deckPages
    .map((p): DeckSubject => {
      const sid = (p.specialty_id as number | null) ?? null;
      return {
        key: p.id as number,
        title: (p.title as string) ?? "Flashcards",
        subtitle: sid != null ? specById.get(sid)?.name ?? null : null,
        count: countByPage.get(p.id as number) ?? 0,
      };
    })
    .filter((s) => s.count > 0);
}

/**
 * Assemble a flashcard deck: from each selected page (`key` = page id) pull
 * `count` cards (random sample when `shuffle`, else first N), excluding
 * `excludeIds`, then arrange + cap.
 */
export async function buildFlashcardDeck(
  selections: DeckSelection[],
  options: DeckBuildOptions,
): Promise<DeckCard[]> {
  await requireStudioRole();
  const admin = createAdminClient();

  const { orderedKeys, countByKey, pickedByKey } = normalizeSelections(selections);
  if (orderedKeys.length === 0) return [];
  const exclude = new Set(options.excludeIds ?? []);

  const { data: pages } = await admin.from("pages").select("id, title, specialty_id").in("id", orderedKeys);
  const specById = await specMetaForIds(
    admin,
    (pages ?? []).map((p) => p.specialty_id as number | null).filter((s): s is number => s != null),
  );
  const metaByPage = new Map<number, { title: string; specName: string | null; specSlug: string | null }>();
  for (const p of pages ?? []) {
    const sid = p.specialty_id as number | null;
    const spec = sid != null ? specById.get(sid) : undefined;
    metaByPage.set(p.id as number, {
      title: (p.title as string) ?? "Flashcards",
      specName: spec?.name ?? null,
      specSlug: spec?.slug ?? null,
    });
  }

  const { data: rows } = await admin
    .from("flashcard_items")
    .select("id, text, answer, tip, image_url, page_id, group_position, position")
    .in("page_id", orderedKeys)
    .order("page_id")
    .order("group_position")
    .order("position");

  const byPage = new Map<number, DeckCard[]>();
  for (const r of rows ?? []) {
    const id = r.id as number;
    const prompt = ((r.text as string) ?? "").trim();
    const answer = ((r.answer as string) ?? "").trim();
    if (!prompt || !answer) continue;
    const pid = r.page_id as number;
    const meta = metaByPage.get(pid);
    const card: DeckCard = {
      id,
      prompt,
      answer,
      tip: (r.tip as string | null) ?? null,
      imageUrl: (r.image_url as string | null) ?? null,
      specialtyName: meta?.specName ?? null,
      specialtySlug: meta?.specSlug ?? null,
      subjectTitle: meta?.title ?? "Flashcards",
    };
    if (!byPage.has(pid)) byPage.set(pid, []);
    byPage.get(pid)!.push(card);
  }

  const sampled = new Map<number, DeckCard[]>();
  for (const pid of orderedKeys) {
    const all = byPage.get(pid) ?? [];
    sampled.set(
      pid,
      selectForSubject(all, pickedByKey.get(pid), countByKey.get(pid) ?? 0, {
        shuffle: options.shuffle,
        skipImageCards: options.skipImageCards,
        exclude,
        hasImage: (c) => !!c.imageUrl,
      }),
    );
  }

  return arrangeDeck(orderedKeys, sampled, options.interleave, options.cap);
}

// ── Quiz ─────────────────────────────────────────────────────────────────────

// Split a quiz question's leading <h3> (exam-source reference) from its stem.
function splitQuizQuestion(html: string): { source: string | null; stem: string } {
  const m = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  const source = m ? htmlToText(m[1]) || null : null;
  const stem = htmlToText(m ? html.replace(m[0], " ") : html);
  return { source, stem };
}

type QuizRow = {
  id: number;
  question: string;
  answers: { text: string; correct: boolean; feedback: string }[];
  media_url: string | null;
  explanation_html: string | null;
  page_id: number;
};

// Parse a raw quiz row into a display card; null if malformed (no correct answer
// or fewer than two options).
function parseQuizRow(
  r: QuizRow,
  meta: { specName: string | null; specSlug: string | null; subjectTitle: string },
): QuizDeckCard | null {
  const answers = Array.isArray(r.answers) ? r.answers : [];
  const options = answers.map((a) => htmlToText(a.text)).filter((t) => t.length > 0);
  const correctIndex = answers.findIndex((a) => a.correct);
  if (options.length < 2 || correctIndex < 0 || correctIndex >= options.length) return null;
  const { source, stem } = splitQuizQuestion(r.question ?? "");
  if (!stem) return null;
  const explanation =
    htmlToText(r.explanation_html) || htmlToText(answers[correctIndex]?.feedback) || null;
  return {
    id: r.id,
    source,
    stem,
    options,
    correctIndex,
    explanation: explanation || null,
    specialtyName: meta.specName,
    specialtySlug: meta.specSlug,
    subjectTitle: meta.subjectTitle,
  };
}

/**
 * Quiz subjects = specialties that have quiz questions (`key` = specialty id),
 * counting every question on that specialty's pages.
 */
export async function getQuizSubjects(): Promise<DeckSubject[]> {
  await requireStudioRole();
  const admin = createAdminClient();

  // All pages that carry a specialty (quiz questions live on these).
  const { data: pages } = await admin
    .from("pages")
    .select("id, specialty_id")
    .not("specialty_id", "is", null);
  const specByPage = new Map<number, number>();
  for (const p of pages ?? []) specByPage.set(p.id as number, p.specialty_id as number);
  const pageIds = [...specByPage.keys()];
  if (pageIds.length === 0) return [];

  // Count quiz questions per page, then roll up to specialty.
  const { data: rows } = await admin.from("quiz_questions").select("page_id").in("page_id", pageIds);
  const countBySpec = new Map<number, number>();
  for (const r of rows ?? []) {
    const sid = specByPage.get(r.page_id as number);
    if (sid == null) continue;
    countBySpec.set(sid, (countBySpec.get(sid) ?? 0) + 1);
  }
  if (countBySpec.size === 0) return [];

  const specById = await specMetaForIds(admin, [...countBySpec.keys()]);
  return [...countBySpec.entries()]
    .map(([sid, count]): DeckSubject => ({
      key: sid,
      title: specById.get(sid)?.name ?? `Especialidade ${sid}`,
      subtitle: "Questões",
      count,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

/**
 * Assemble a quiz deck: from each selected specialty (`key` = specialty id) pull
 * `count` questions across that specialty's pages, excluding `excludeIds`, then
 * arrange + cap.
 */
export async function buildQuizDeck(
  selections: DeckSelection[],
  options: DeckBuildOptions,
): Promise<QuizDeckCard[]> {
  await requireStudioRole();
  const admin = createAdminClient();

  const { orderedKeys, countByKey, pickedByKey } = normalizeSelections(selections);
  if (orderedKeys.length === 0) return [];
  const exclude = new Set(options.excludeIds ?? []);
  const specById = await specMetaForIds(admin, orderedKeys);

  // Pages for the selected specialties → question rows for those pages.
  const { data: pages } = await admin
    .from("pages")
    .select("id, title, specialty_id")
    .in("specialty_id", orderedKeys);
  const pageMeta = new Map<number, { specId: number; title: string }>();
  for (const p of pages ?? []) {
    pageMeta.set(p.id as number, { specId: p.specialty_id as number, title: (p.title as string) ?? "" });
  }
  const pageIds = [...pageMeta.keys()];
  if (pageIds.length === 0) return [];

  const { data: rows } = await admin
    .from("quiz_questions")
    .select("id, question, answers, media_url, explanation_html, page_id, position")
    .in("page_id", pageIds)
    .order("page_id")
    .order("position");

  const bySpec = new Map<number, QuizDeckCard[]>();
  const imageIds = new Set<number>(); // quiz cards backed by media_url
  for (const r of rows ?? []) {
    const pm = pageMeta.get(r.page_id as number);
    if (!pm) continue;
    const spec = specById.get(pm.specId);
    const card = parseQuizRow(r as QuizRow, {
      specName: spec?.name ?? null,
      specSlug: spec?.slug ?? null,
      subjectTitle: spec?.name ?? "Questões",
    });
    if (!card) continue;
    if (r.media_url as string | null) imageIds.add(card.id);
    if (!bySpec.has(pm.specId)) bySpec.set(pm.specId, []);
    bySpec.get(pm.specId)!.push(card);
  }

  const sampled = new Map<number, QuizDeckCard[]>();
  for (const sid of orderedKeys) {
    const all = bySpec.get(sid) ?? [];
    sampled.set(
      sid,
      selectForSubject(all, pickedByKey.get(sid), countByKey.get(sid) ?? 0, {
        shuffle: options.shuffle,
        skipImageCards: options.skipImageCards,
        exclude,
        hasImage: (c) => imageIds.has(c.id),
      }),
    );
  }

  return arrangeDeck(orderedKeys, sampled, options.interleave, options.cap);
}

// ── Item picker ────────────────────────────────────────────────────────────────

/**
 * List a single subject's items for the browse-and-pick picker. `key` is a deck
 * page id (flashcards) or a specialty id (quiz). Returns the same buildable set
 * the deck builders would draw from — malformed rows are filtered out so a
 * picked id can never silently vanish at build time — in stable display order.
 */
export async function getDeckItems(source: DeckSource, key: number): Promise<DeckItemPreview[]> {
  await requireStudioRole();
  const admin = createAdminClient();

  if (source === "flashcard") {
    const { data: rows } = await admin
      .from("flashcard_items")
      .select("id, text, answer, image_url, group_position, position")
      .eq("page_id", key)
      .order("group_position")
      .order("position");
    const out: DeckItemPreview[] = [];
    for (const r of rows ?? []) {
      const prompt = ((r.text as string) ?? "").trim();
      const answer = ((r.answer as string) ?? "").trim();
      if (!prompt || !answer) continue;
      out.push({
        id: r.id as number,
        label: truncateLabel(prompt),
        source: null,
        hasImage: !!(r.image_url as string | null),
      });
    }
    return out;
  }

  // Quiz: every question on the specialty's pages, parsed to a display stem.
  const { data: pages } = await admin.from("pages").select("id").eq("specialty_id", key);
  const pageIds = (pages ?? []).map((p) => p.id as number);
  if (pageIds.length === 0) return [];

  const { data: rows } = await admin
    .from("quiz_questions")
    .select("id, question, answers, media_url, explanation_html, page_id, position")
    .in("page_id", pageIds)
    .order("page_id")
    .order("position");

  const out: DeckItemPreview[] = [];
  for (const r of rows ?? []) {
    const card = parseQuizRow(r as QuizRow, { specName: null, specSlug: null, subjectTitle: "" });
    if (!card) continue;
    out.push({
      id: card.id,
      label: truncateLabel(card.stem),
      source: card.source,
      hasImage: !!(r.media_url as string | null),
    });
  }
  return out;
}
