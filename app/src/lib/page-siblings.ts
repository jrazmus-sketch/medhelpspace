import { createAdminClient } from "@/lib/supabase/admin";
import { geralSimuladoHref, simuladoNumber } from "@/lib/simulado-collections";
import { geralCollectionOf } from "@/lib/simulado-collections-server";

export interface PageSiblingsResult {
  nextHref: string | null;
  nextTitle: string | null;
  specialtyHref: string;
  specialtyName: string;
  // The hub page this page is listed under (nav_items source) — e.g. the
  // per-specialty Fórmula hub for a fórmula topic. Null when the page isn't
  // reachable from any hub (orphans); callers fall back to specialtyHref.
  hubHref: string | null;
  hubName: string | null;
}

type SpecialtyJoin = { slug: string; name: string } | null;
type NavLookupRow = {
  source_page_id: number;
  position: number;
  source_page: {
    slug: string;
    title: string;
    specialty: { slug: string } | null;
  } | null;
};
type NextNavRow = {
  target_page: {
    slug: string;
    title: string;
    specialty: { slug: string } | null;
  } | null;
};

// Resolves "back to specialty" and "next sibling" for any content page reached
// from a blurb-nav-hub. "Next sibling" = the next nav_items row (by position)
// under the same source_page_id that links to this pageId.
export async function getPageSiblings(pageId: number): Promise<PageSiblingsResult> {
  const admin = createAdminClient();

  const [pageRes, navRes] = await Promise.all([
    admin
      .from("pages")
      .select("slug, view, specialty_id, content_module_id, specialty:specialties!specialty_id(slug, name)")
      .eq("id", pageId)
      .single(),
    admin
      .from("nav_items")
      .select(
        "source_page_id, position, source_page:pages!source_page_id(slug, title, specialty:specialties!specialty_id(slug))",
      )
      .eq("target_page_id", pageId)
      .order("source_page_id")
      .limit(1)
      .maybeSingle(),
  ]);

  const specialty = (pageRes.data as { specialty?: SpecialtyJoin } | null)?.specialty ?? null;
  const specialtyHref = specialty?.slug ? `/app/${specialty.slug}` : "/app";
  const specialtyName = specialty?.name ?? "Início";

  const navLookup = navRes.data as unknown as NavLookupRow | null;
  if (!navLookup) {
    // A Geral simulado has no hub card: its collection is the hub, and "next" is the
    // next number in that collection (Simulado 7 → Simulado 8).
    const self = pageRes.data as { slug: string; view: string | null; specialty_id: number | null; content_module_id: number | null } | null;
    const collection = self ? await geralCollectionOf(self) : null;
    if (collection && self) {
      const next = await nextInCollection(collection.collection.slugPrefix, simuladoNumber(self.slug));
      return {
        nextHref: next ? geralSimuladoHref(next.slug) : null,
        nextTitle: next?.title ?? null,
        specialtyHref: collection.href,
        specialtyName: collection.title,
        hubHref: collection.href,
        hubName: collection.title,
      };
    }
    return { nextHref: null, nextTitle: null, specialtyHref, specialtyName, hubHref: null, hubName: null };
  }

  const hub = navLookup.source_page;
  const hubHref = hub?.slug
    ? hub.specialty?.slug
      ? `/app/${hub.specialty.slug}/${hub.slug}`
      : `/app/${hub.slug}`
    : null;
  const hubName = hub?.title ?? null;

  const { data: nextRow } = await admin
    .from("nav_items")
    .select(
      "target_page:pages!target_page_id(slug, title, specialty:specialties!specialty_id(slug))",
    )
    .eq("source_page_id", navLookup.source_page_id)
    .gt("position", navLookup.position)
    .not("target_page_id", "is", null)
    .order("position")
    .limit(1)
    .maybeSingle<NextNavRow>();

  const target = nextRow?.target_page ?? null;
  if (!target?.slug) {
    return { nextHref: null, nextTitle: null, specialtyHref, specialtyName, hubHref, hubName };
  }

  const nextHref = target.specialty?.slug
    ? `/app/${target.specialty.slug}/${target.slug}`
    : `/app/${target.slug}`;
  return { nextHref, nextTitle: target.title, specialtyHref, specialtyName, hubHref, hubName };
}

// The published simulado with the smallest number above `after` in one GERAL collection.
// Numbers come from the slug, so a gap (a retired simulado) is simply skipped.
async function nextInCollection(slugPrefix: string, after: number): Promise<{ slug: string; title: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pages")
    .select("slug, title")
    .like("slug", `${slugPrefix}%`)
    .eq("view", "simulados")
    .eq("type", "h5p-quiz")
    .eq("status", "publish")
    .is("specialty_id", null)
    .is("content_module_id", null);
  const later = ((data ?? []) as { slug: string; title: string }[])
    .filter((p) => simuladoNumber(p.slug) > after && p.slug === `${slugPrefix}${simuladoNumber(p.slug)}`)
    .sort((a, b) => simuladoNumber(a.slug) - simuladoNumber(b.slug));
  return later[0] ?? null;
}
