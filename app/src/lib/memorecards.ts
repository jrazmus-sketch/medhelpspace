import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SuperGroupData } from "@/components/content/track-hub-accordion";
import {
  sortThemes,
  themeSlug,
  themeTitle,
  type MemorecardTheme,
} from "@/lib/memorecards-shared";

// MemoreCards v2 — data loaders. Server-only: the cards are MedHelp 60D content and
// are read with the service-role client AFTER the page has checked get60dAccess(),
// the same pattern as every other gated content route (see CLAUDE.md, "Member
// content route bypasses RLS"). Never call these before that check.
//
// The structure is Revalida Up's (Karina, 2026-09-23): the specialties and themes
// that exist there are the specialties and themes that exist here, in the same
// grouping, whether or not their images have been produced yet.

/**
 * Every theme that has at least one card. One row per CARD, so it is paged: the full
 * set (195 themes × ~6 cards) passes PostgREST's silent 1,000-row cap.
 */
async function topicsWithCards(admin: ReturnType<typeof createAdminClient>): Promise<Set<number>> {
  const out = new Set<number>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("memorecard_items")
      .select("topic_page_id")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) out.add(Number(r.topic_page_id));
    if (!data || data.length < PAGE) return out;
  }
}

type Spec = { id: number; slug: string; name: string; display_order: number; group_label: string | null };

/** Index page: Revalida Up's grande área → especialidade grouping, with how many themes are ready. */
export async function getMemorecardsIndex(): Promise<SuperGroupData[]> {
  const admin = createAdminClient();
  const [{ data: specialties }, { data: topics }, cards] = await Promise.all([
    admin.from("specialties").select("id, slug, name, display_order, group_label").order("display_order"),
    admin.from("pages").select("id, specialty_id").eq("view", "revalida-up").eq("status", "publish"),
    topicsWithCards(admin),
  ]);

  const withCards = cards;
  const total = new Map<number, number>();
  const ready = new Map<number, number>();
  for (const t of topics ?? []) {
    if (t.specialty_id == null) continue;
    const sid = t.specialty_id as number;
    total.set(sid, (total.get(sid) ?? 0) + 1);
    if (withCards.has(Number(t.id))) ready.set(sid, (ready.get(sid) ?? 0) + 1);
  }

  type Group = SuperGroupData & { minOrder: number };
  const groups = new Map<string, Group>();
  for (const s of (specialties ?? []) as Spec[]) {
    if (!total.has(s.id)) continue; // no Revalida Up themes → not part of the structure
    const label = s.group_label ?? s.name;
    if (!groups.has(label)) {
      groups.set(label, {
        label,
        iconSlug: s.group_label ? "clinica-medica" : s.slug,
        minOrder: s.display_order,
        items: [],
      });
    }
    const n = ready.get(s.id) ?? 0;
    groups.get(label)!.items.push({
      spec: { id: s.id, slug: s.slug, name: s.name },
      href: `/app/memorecards/${s.slug}`,
      note: n > 0 ? `${n} ${n === 1 ? "tema" : "temas"}` : "Em breve",
    });
  }
  return [...groups.values()]
    .sort((a, b) => a.minOrder - b.minOrder)
    .map((g) => ({ label: g.label, iconSlug: g.iconSlug, items: g.items }));
}

export type SpecialtyMemorecards = {
  spec: { id: number; slug: string; name: string };
  /** EVERY Revalida Up theme of the specialty, in order — those without cards included. */
  themes: MemorecardTheme[];
};

/** One specialty: all its themes (structure) and the cards each already has (content). */
export async function getSpecialtyMemorecards(specialtySlug: string): Promise<SpecialtyMemorecards | null> {
  const admin = createAdminClient();
  const { data: spec } = await admin
    .from("specialties")
    .select("id, slug, name")
    .eq("slug", specialtySlug)
    .maybeSingle();
  if (!spec) return null;

  const { data: topics } = await admin
    .from("pages")
    .select("id, slug, title")
    .eq("view", "revalida-up")
    .eq("status", "publish")
    .eq("specialty_id", spec.id);
  if (!topics || topics.length === 0) return null;

  const ids = topics.map((t) => t.id as number);
  const { data: rows } = await admin
    .from("memorecard_items")
    .select("topic_page_id, position, image_url, width, height")
    .in("topic_page_id", ids)
    .order("position");

  const byTopic = new Map<number, MemorecardTheme["cards"]>();
  for (const r of rows ?? []) {
    const k = Number(r.topic_page_id);
    if (!byTopic.has(k)) byTopic.set(k, []);
    byTopic.get(k)!.push({ url: r.image_url as string, width: r.width as number, height: r.height as number });
  }

  const themes = sortThemes(
    topics.map((t) => ({
      pageId: t.id as number,
      slug: themeSlug(t.slug as string),
      title: themeTitle(t.title as string),
      cards: byTopic.get(Number(t.id)) ?? [],
    })),
  );
  return { spec: { id: spec.id as number, slug: spec.slug as string, name: spec.name as string }, themes };
}
