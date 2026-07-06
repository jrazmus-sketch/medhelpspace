import { createAdminClient } from "@/lib/supabase/admin";

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
      .select("specialty:specialties!specialty_id(slug, name)")
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
