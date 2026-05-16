import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { FlashcardPlayer } from "./flashcard-player";
import type { CardGroup } from "./flashcard-player";

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

export async function FlashcardRenderer({ pageId }: { pageId: number }) {
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

  // Fetch SM-2 progress for these cards so we can resurface due cards first
  const progressByCard = new Map<number, { due_date: string; repetitions: number }>();
  let dueTodayCount = 0;
  const todayKey = new Date().toISOString().split("T")[0];

  if (!USE_MOCK_DATA) {
    try {
      const userClient = await createClient();
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const cardIds = cards.map((c) => c.id);
        const { data: progress } = await userClient
          .from("flashcard_progress")
          .select("flashcard_item_id, due_date, repetitions")
          .eq("user_id", user.id)
          .in("flashcard_item_id", cardIds);
        for (const p of progress ?? []) {
          progressByCard.set(p.flashcard_item_id as number, {
            due_date: p.due_date as string,
            repetitions: p.repetitions as number,
          });
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

  return <FlashcardPlayer groups={groups} dueTodayCount={dueTodayCount} totalCards={cards.length} />;
}
