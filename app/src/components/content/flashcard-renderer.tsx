import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { getPageSiblings } from "@/lib/page-siblings";
import { FlashcardPlayer } from "./flashcard-player";
import type { CardGroup } from "./flashcard-player";
import { FlashcardHub } from "./flashcard-hub";
import type { CategoryCardData } from "./flashcard-hub";

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

// Stable, shareable per-group identifier for the ?grupo= deep link. Derived from
// the group label (accent-stripped) with a position fallback; collisions are
// disambiguated by appending the group position so two groups never share a slug.
function slugifyLabel(label: string | null, position: number): string {
  if (!label) return `grupo-${position}`;
  const base = label
    .normalize("NFD")
    // Drop combining diacritical marks (U+0300–U+036F) so "Congênita" → "congenita".
    .split("")
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code < 0x0300 || code > 0x036f;
    })
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `grupo-${position}`;
}

export async function FlashcardRenderer({
  pageId,
  specialtySlug,
  pageSlug,
  grupo,
}: {
  pageId: number;
  specialtySlug: string;
  pageSlug: string;
  grupo?: string;
}) {
  const supabase = createAdminClient();
  const { data: cards } = await supabase
    .from("flashcard_items")
    .select("id, group_position, group_label, position, text, answer, image_url, tip")
    .eq("page_id", pageId)
    .order("group_position")
    .order("position");

  if (!cards || cards.length === 0) {
    return <p className="text-muted-foreground text-sm">Conteúdo em preparação.</p>;
  }

  // Fetch SM-2 progress + attempt history for these cards so we can (a) resurface
  // due cards first inside the player and (b) show per-category stats on the grid.
  const progressByCard = new Map<number, { due_date: string; repetitions: number }>();
  const latestResultByCard = new Map<number, "correct" | "incorrect">();
  let dueTodayCount = 0;
  const todayKey = new Date().toISOString().split("T")[0];

  if (!USE_MOCK_DATA) {
    try {
      const userClient = await createClient();
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const cardIds = cards.map((c) => c.id);
        // SM-2 state now lives in the unified review_schedule (flashcard_progress
        // is frozen); read it back so due cards still resurface first.
        const [{ data: progress }, { data: attempts }] = await Promise.all([
          userClient
            .from("review_schedule")
            .select("item_id, due_date, repetitions")
            .eq("user_id", user.id)
            .eq("item_type", "flashcard")
            .in("item_id", cardIds),
          userClient
            .from("flashcard_attempts")
            .select("flashcard_item_id, result, created_at")
            .eq("user_id", user.id)
            .in("flashcard_item_id", cardIds)
            .order("created_at", { ascending: false }),
        ]);
        for (const p of progress ?? []) {
          progressByCard.set(p.item_id as number, {
            due_date: p.due_date as string,
            repetitions: p.repetitions as number,
          });
        }
        // DESC order means the first row seen per card is the latest attempt.
        for (const a of attempts ?? []) {
          const cid = a.flashcard_item_id as number;
          if (!latestResultByCard.has(cid)) {
            latestResultByCard.set(cid, a.result as "correct" | "incorrect");
          }
        }
        // Count: due-today = either no progress yet (new) OR due_date <= today
        for (const c of cards) {
          const prog = progressByCard.get(c.id);
          if (!prog || prog.due_date <= todayKey) dueTodayCount++;
        }
      }
    } catch {
      // Non-critical — falls back to original order
    }
  } else {
    dueTodayCount = cards.length;
  }

  // Sort cards within each group:
  //   - new cards (no progress) first (in original order)
  //   - then due-today cards (oldest due_date first)
  //   - then future-due cards (mastered, sorted by due_date asc)
  function cardSortKey(cardId: number, originalIdx: number): [number, string, number] {
    const prog = progressByCard.get(cardId);
    if (!prog) return [0, "", originalIdx]; // new
    if (prog.due_date <= todayKey) return [1, prog.due_date, originalIdx]; // due
    return [2, prog.due_date, originalIdx]; // future-due
  }

  const groupMap = new Map<number, CardGroup>();
  for (const card of cards) {
    if (!groupMap.has(card.group_position)) {
      groupMap.set(card.group_position, {
        position: card.group_position,
        label: card.group_label ? stripTags(card.group_label) : null,
        cards: [],
      });
    }
    groupMap.get(card.group_position)!.cards.push({
      id: card.id,
      text: card.text,
      answer: card.answer,
      image_url: card.image_url ?? null,
      tip: card.tip ?? null,
    });
  }

  // Sort cards within each group by SM-2 priority
  for (const group of groupMap.values()) {
    const indexed = group.cards.map((c, i) => ({ card: c, key: cardSortKey(c.id, i) }));
    indexed.sort((a, b) => {
      if (a.key[0] !== b.key[0]) return a.key[0] - b.key[0];
      if (a.key[1] !== b.key[1]) return a.key[1].localeCompare(b.key[1]);
      return a.key[2] - b.key[2];
    });
    group.cards = indexed.map((i) => i.card);
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => a.position - b.position);

  // Assign a unique slug to every group (for the ?grupo= deep link).
  const slugByPosition = new Map<number, string>();
  const groupBySlug = new Map<string, CardGroup>();
  for (const g of groups) {
    let slug = slugifyLabel(g.label, g.position);
    if (groupBySlug.has(slug)) slug = `${slug}-${g.position}`;
    slugByPosition.set(g.position, slug);
    groupBySlug.set(slug, g);
  }

  const basePath = `/app/${specialtySlug}/${pageSlug}`;
  const siblings = await getPageSiblings(pageId);

  // Per-group due-today + accuracy (used both on the grid and the in-player header).
  function groupDue(g: CardGroup): number {
    if (USE_MOCK_DATA) return g.cards.length;
    let n = 0;
    for (const c of g.cards) {
      const prog = progressByCard.get(c.id);
      if (!prog || prog.due_date <= todayKey) n++;
    }
    return n;
  }
  function groupAccuracy(g: CardGroup): { answered: number; correctLatest: number } {
    let answered = 0;
    let correctLatest = 0;
    for (const c of g.cards) {
      const r = latestResultByCard.get(c.id);
      if (r) {
        answered++;
        if (r === "correct") correctLatest++;
      }
    }
    return { answered, correctLatest };
  }

  // Resolve the active group: single-group decks skip the grid; otherwise a valid
  // ?grupo= slug selects its category. Anything else falls through to the grid.
  const selectedGroup =
    groups.length === 1 ? groups[0] : grupo ? groupBySlug.get(grupo) ?? null : null;

  // ── Grid view (multi-category deck, no/invalid ?grupo=) ─────────────────────────
  if (!selectedGroup) {
    const categories: CategoryCardData[] = groups.map((g) => {
      const acc = groupAccuracy(g);
      return {
        slug: slugByPosition.get(g.position)!,
        label: g.label ?? `Grupo ${g.position}`,
        total: g.cards.length,
        due: groupDue(g),
        answered: acc.answered,
        correctLatest: acc.correctLatest,
      };
    });

    return (
      <FlashcardHub
        basePath={basePath}
        specialtySlug={specialtySlug}
        categories={categories}
        dueTodayCount={dueTodayCount}
        totalCards={cards.length}
      />
    );
  }

  // ── Player view (single category) ───────────────────────────────────────────────
  const idx = groups.indexOf(selectedGroup);
  const nextGroup = groups.length > 1 && idx < groups.length - 1 ? groups[idx + 1] : null;
  const hasGrid = groups.length > 1;

  return (
    <FlashcardPlayer
      groups={[selectedGroup]}
      pageId={pageId}
      dueTodayCount={groupDue(selectedGroup)}
      totalCards={selectedGroup.cards.length}
      gridHref={hasGrid ? basePath : null}
      nextCategoryHref={
        nextGroup ? `${basePath}?grupo=${encodeURIComponent(slugByPosition.get(nextGroup.position)!)}` : null
      }
      nextCategoryName={nextGroup?.label ?? null}
      nextDeckHref={siblings.nextHref}
      nextDeckTitle={siblings.nextTitle}
      specialtyHref={siblings.specialtyHref}
      specialtyName={siblings.specialtyName}
    />
  );
}
