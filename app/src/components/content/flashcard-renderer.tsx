import { createAdminClient } from "@/lib/supabase/admin";
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

  const groups = Array.from(groupMap.values()).sort((a, b) => a.position - b.position);

  return <FlashcardPlayer groups={groups} />;
}
