import { cache } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSpecialtyAccent } from "@/components/content/specialty-icon";
import { TopicCard, loadQuizStats } from "@/components/content/blurb-nav-hub-renderer";
import { SiteText } from "@/components/landing/site-text";
import {
  SIMULADO_COLLECTIONS,
  collectionForSlug,
  collectionHref,
  geralSimuladoHref,
  simuladoNumber,
  type SimuladoCollection,
  type SimuladoCollectionKey,
} from "@/lib/simulado-collections";

// The "Geral" simulados are cross-specialty mock exams (no single specialty), so they
// don't live under a per-specialty hub. They're stored as view='simulados',
// type='h5p-quiz', specialty_id IS NULL, and routed at /app/geral/<slug> (the
// [specialty] segment is cosmetic — the router resolves the page by slug).
//
// Since Karina's 2026-10-17 update GERAL holds COLLECTIONS (lib/simulado-collections.ts):
// the Simulados tab shows one card per collection, and each card opens a page with that
// collection's numbered grid — so a student never sees all of them at once.

type GeralPage = { id: number; slug: string; title: string };

// Per-request memo: the collection page reads it for its header count AND its grid.
const loadGeralSimulados = cache(async (): Promise<Map<SimuladoCollectionKey, GeralPage[]>> => {
  const admin = createAdminClient();
  const { data: pages } = await admin
    .from("pages")
    .select("id, slug, title")
    .eq("view", "simulados")
    .eq("type", "h5p-quiz")
    .eq("status", "publish")
    .is("specialty_id", null)
    // The MedHelp 60D "Simulados 100Q" are stored the same way and differ only by
    // content_module_id. Without this they'd show up here too, outside the 60D gate.
    .is("content_module_id", null);

  const out = new Map<SimuladoCollectionKey, GeralPage[]>(SIMULADO_COLLECTIONS.map((c) => [c.key, []]));
  for (const p of (pages ?? []) as GeralPage[]) {
    const c = collectionForSlug(p.slug);
    if (c) out.get(c.key)!.push(p);
  }
  for (const list of out.values()) list.sort((a, b) => simuladoNumber(a.slug) - simuladoNumber(b.slug));
  return out;
});

/** The GERAL row of the Simulados tab: one card per collection, side by side. */
export async function SimuladoCollectionCards() {
  const byCollection = await loadGeralSimulados();
  return (
    // Stacked on a phone (each card keeps a readable line length and a full-width tap
    // target); side by side from sm up, as in Karina's sketch.
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {SIMULADO_COLLECTIONS.map((c) => (
        <CollectionCard key={c.key} collection={c} count={byCollection.get(c.key)?.length ?? 0} />
      ))}
    </div>
  );
}

function CollectionCard({ collection: c, count }: { collection: SimuladoCollection; count: number }) {
  return (
    <Link
      href={collectionHref(c.key)}
      className="group relative flex flex-col rounded-xl bg-card ring-1 ring-foreground/10 transition-all duration-150 hover:-translate-y-px hover:ring-foreground/20 hover:shadow-sm"
    >
      <div className="flex flex-1 flex-col px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
        <h3 className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-foreground transition-colors group-hover:text-brand sm:text-lg">
          <SiteText k={`${c.copyKey}.title`} fallback={c.title} />
        </h3>
        <p
          className="mt-2 text-sm leading-relaxed"
          // AAA (7:1) in both themes; --muted-foreground is ~5.9:1 on white.
          style={{ color: "color-mix(in srgb, var(--foreground) 75%, transparent)" }}
        >
          <SiteText k={`${c.copyKey}.desc`} fallback={c.description} />
        </p>
      </div>
      <div className="mx-5 border-t border-border sm:mx-6" />
      <div className="flex min-h-12 items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-foreground sm:px-6">
        <span>
          {count} {count === 1 ? "simulado" : "simulados"}
        </span>
        <ChevronRight
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0 text-muted-foreground/70 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
        />
      </div>
    </Link>
  );
}

/** One collection's simulados as the numbered card grid (the old flat GERAL grid). */
export async function SimuladoCollectionGrid({ collectionKey }: { collectionKey: SimuladoCollectionKey }) {
  const rows = (await loadGeralSimulados()).get(collectionKey) ?? [];
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
        Conteúdo em preparação.
      </p>
    );
  }

  const stats = await loadQuizStats(rows.map((r) => r.id));
  const accent = getSpecialtyAccent("geral");

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 sm:gap-4">
      {rows.map((page) => (
        <TopicCard
          key={page.id}
          editable={{ table: "pages", id: page.id, field: "title" }}
          label={page.title}
          href={geralSimuladoHref(page.slug)}
          accent={accent}
          stats={stats.get(page.id)}
        />
      ))}
    </div>
  );
}

/** Number of published simulados in a collection (for the collection page header). */
export async function countCollection(collectionKey: SimuladoCollectionKey): Promise<number> {
  return ((await loadGeralSimulados()).get(collectionKey) ?? []).length;
}
