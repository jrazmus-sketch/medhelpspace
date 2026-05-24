import { createAdminClient } from "@/lib/supabase/admin";
import { HubsClient } from "./hubs-client";

export const metadata = { title: "Hubs" };
export const dynamic = "force-dynamic";

const ORPHAN_DISPLAY_CAP = 50;

// Mirrors the live-site accordion ordering on the specialty page.
const VIEW_ORDER: Record<string, number> = {
  hub:        0,
  resumos:    1,
  formula:    2,
  simulados:  3,
  medvoice:   4,
  audiocards: 5,
  flashcards: 6,
};

function viewSortKey(view: string | null): [number, string] {
  if (view == null || view === "" || view === "hub") return [VIEW_ORDER.hub, ""];
  const known = VIEW_ORDER[view];
  if (known != null) return [known, view];
  return [99, view]; // unknown views: alphabetical at the end.
}

export type HubRow = {
  id: number;
  slug: string;
  title: string;
  view: string | null;
  status: string;
  card_count: number;
  specialty_slug: string | null;
};

export type SpecialtyGroup = {
  id: number;
  slug: string;
  name: string;
  hubs: HubRow[];
};

export type OrphanRow = {
  id: number;
  slug: string;
  title: string;
  type: string;
  status: string;
  specialty_name: string | null;
  specialty_slug: string | null;
};

export default async function AdminHubsPage() {
  const admin = createAdminClient();

  const [{ data: specialtiesRaw }, { data: hubsRaw }, { data: navItemsRaw }, { data: pagesRaw }] =
    await Promise.all([
      admin
        .from("specialties")
        .select("id, slug, name, display_order")
        .order("display_order"),
      admin
        .from("pages")
        .select("id, slug, title, view, status, specialty_id")
        .eq("type", "blurb-nav-hub"),
      admin
        .from("nav_items")
        .select("source_page_id, target_page_id"),
      admin
        .from("pages")
        .select("id, slug, title, type, status, specialty_id, specialties(slug, name)")
        .eq("status", "publish"),
    ]);

  const specialties = (specialtiesRaw ?? []) as Array<{
    id: number; slug: string; name: string; display_order: number;
  }>;
  const hubs = (hubsRaw ?? []) as Array<{
    id: number; slug: string; title: string; view: string | null;
    status: string; specialty_id: number | null;
  }>;
  const navItems = (navItemsRaw ?? []) as Array<{
    source_page_id: number; target_page_id: number | null;
  }>;
  type PageWithSpecialty = {
    id: number; slug: string; title: string; type: string; status: string;
    specialty_id: number | null;
    specialties: { slug: string; name: string } | { slug: string; name: string }[] | null;
  };
  const allPages = (pagesRaw ?? []) as PageWithSpecialty[];

  // Card counts per hub (source_page_id).
  const cardCountBySource = new Map<number, number>();
  for (const ni of navItems) {
    cardCountBySource.set(
      ni.source_page_id,
      (cardCountBySource.get(ni.source_page_id) ?? 0) + 1,
    );
  }

  // Specialty slug lookup for live-URL construction.
  const specialtySlugById = new Map<number, string>();
  for (const s of specialties) specialtySlugById.set(s.id, s.slug);

  // Group hubs by specialty + sort by view order. Skip hubs that have no
  // specialty (they're not part of the specialty IA we render here).
  const hubsBySpecialty = new Map<number, HubRow[]>();
  for (const h of hubs) {
    if (h.specialty_id == null) continue;
    const row: HubRow = {
      id: h.id,
      slug: h.slug,
      title: h.title,
      view: h.view,
      status: h.status,
      card_count: cardCountBySource.get(h.id) ?? 0,
      specialty_slug: specialtySlugById.get(h.specialty_id) ?? null,
    };
    const arr = hubsBySpecialty.get(h.specialty_id) ?? [];
    arr.push(row);
    hubsBySpecialty.set(h.specialty_id, arr);
  }

  for (const [, arr] of hubsBySpecialty) {
    arr.sort((a, b) => {
      const [ka, va] = viewSortKey(a.view);
      const [kb, vb] = viewSortKey(b.view);
      if (ka !== kb) return ka - kb;
      if (va !== vb) return va.localeCompare(vb);
      return a.title.localeCompare(b.title);
    });
  }

  const groups: SpecialtyGroup[] = [];
  for (const s of specialties) {
    const arr = hubsBySpecialty.get(s.id);
    if (!arr || arr.length === 0) continue;
    groups.push({ id: s.id, slug: s.slug, name: s.name, hubs: arr });
  }

  // ── Orphans: published pages with no nav_item pointing to them.
  //    Exclude blurb-nav-hub and navigation-toggle (utility/section roots).
  const referencedTargetIds = new Set<number>();
  for (const ni of navItems) {
    if (ni.target_page_id != null) referencedTargetIds.add(ni.target_page_id);
  }

  const orphanCandidates = allPages.filter(
    (p) =>
      p.type !== "blurb-nav-hub" &&
      p.type !== "navigation-toggle" &&
      !referencedTargetIds.has(p.id),
  );

  const orphanRows: OrphanRow[] = orphanCandidates
    .map((p) => {
      const spec = Array.isArray(p.specialties) ? p.specialties[0] ?? null : p.specialties;
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        type: p.type,
        status: p.status,
        specialty_name: spec?.name ?? null,
        specialty_slug: spec?.slug ?? null,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  const orphanTotal = orphanRows.length;
  const orphanDisplay = orphanRows.slice(0, ORPHAN_DISPLAY_CAP);

  return (
    <HubsClient
      groups={groups}
      orphans={orphanDisplay}
      orphanTotal={orphanTotal}
      orphanCap={ORPHAN_DISPLAY_CAP}
    />
  );
}
