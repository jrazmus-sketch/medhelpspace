import { createAdminClient } from "@/lib/supabase/admin";
import type { PageView } from "@/types/supabase";

export type Crumb = { label: string; href?: string };

const MEDVOICE_TRACK_ID = 1;
const AUDIOCARDS_TRACK_ID = 2;
const FLASHCARDS_TRACK_ID = 3;
const MEDHELP_60D_MODULE_ID = 1;

// Top-level type root (the first crumb after Início) for a given content page.
// Derived from `view` first, then `track_id`, then `content_module_id`.
function typeRootFor(input: {
  view: PageView | null;
  track_id: number | null;
  content_module_id: number | null;
}): Crumb | null {
  const { view, track_id, content_module_id } = input;
  if (view === "quiz")      return { label: "Questões",  href: "/app/estudo-por-questoes" };
  if (view === "simulados") return { label: "Simulados", href: "/app/estudo-por-questoes?tab=simulados" };
  if (view === "resumos")   return { label: "Resumos",   href: "/app/resumos" };
  if (view === "formula")   return { label: "Fórmula",   href: "/app/formula-medhelp" };
  if (track_id === MEDVOICE_TRACK_ID)   return { label: "MedVoice",   href: "/app/medvoice" };
  if (track_id === AUDIOCARDS_TRACK_ID) return { label: "AudioCards", href: "/app/audiocards" };
  if (track_id === FLASHCARDS_TRACK_ID) return { label: "Flashcards", href: "/app/flashcards" };
  if (content_module_id === MEDHELP_60D_MODULE_ID) return { label: "MedHelp 60D", href: "/app/medhelp-60d" };
  return null;
}

export type SpecialtyHubLookupArgs = {
  specialty_id: number;
  view?: PageView | null;
  track_id?: number | null;
};

// Looks up the per-specialty hub for a given (specialty, type) pair.
// For view-based hubs: page where (specialty_id, view, type='blurb-nav-hub') match.
// For track-based hubs: page where (specialty_id, track_id) match (any type).
// Returns { slug } so caller can construct the URL, or null if no hub exists yet.
export async function findSpecialtyHub(args: SpecialtyHubLookupArgs): Promise<{ slug: string } | null> {
  const admin = createAdminClient();
  if (args.track_id != null) {
    const { data } = await admin
      .from("pages")
      .select("slug")
      .eq("specialty_id", args.specialty_id)
      .eq("track_id", args.track_id)
      .eq("status", "publish")
      .limit(1)
      .maybeSingle();
    return data ? { slug: data.slug as string } : null;
  }
  if (args.view != null) {
    const { data } = await admin
      .from("pages")
      .select("slug")
      .eq("specialty_id", args.specialty_id)
      .eq("view", args.view)
      .eq("type", "blurb-nav-hub")
      .eq("status", "publish")
      .limit(1)
      .maybeSingle();
    return data ? { slug: data.slug as string } : null;
  }
  return null;
}

export type BuildCrumbsInput = {
  // The current page being rendered.
  page: {
    id: number;
    title: string;
    slug: string;
    type: string;
    view: PageView | null;
    track_id: number | null;
    specialty_id: number | null;
    content_module_id: number | null;
  };
  // The page's specialty, if any.
  specialty: { slug: string; name: string } | null;
  // The per-specialty hub URL slug (within /app/[specialty]/<slug>), if one exists.
  // Pass null when the current page IS that hub (terminal specialty crumb, no link).
  specialtyHubSlug: string | null;
};

// Builds the canonical IA breadcrumb chain for a content page.
// Shape: Início > [Type root] > [Specialty hub] > [Leaf]
// - Type root dropped when page has no view/track/module.
// - Specialty hub dropped when page has no specialty.
// - Leaf dropped when the current page is itself the (specialty-under-type) hub
//   — in that case the specialty crumb becomes the terminal.
export function buildCrumbsForPage(input: BuildCrumbsInput): Crumb[] {
  const { page, specialty, specialtyHubSlug } = input;

  const root: Crumb = { label: "Início", href: "/app" };
  const typeRoot = typeRootFor({
    view: page.view,
    track_id: page.track_id,
    content_module_id: page.content_module_id,
  });

  // The current page is the (specialty-under-type) hub when it's a blurb-nav-hub
  // with a specialty + view, OR a track page (track_id + specialty_id), and the
  // caller signaled "this is the hub" by passing null for specialtyHubSlug.
  const pageIsSpecialtyHub =
    specialty != null &&
    specialtyHubSlug == null &&
    (page.type === "blurb-nav-hub" || page.track_id != null);

  // The current page is the top-level type hub (e.g. /app/medvoice) when it's a
  // blurb-nav-hub or track top page with no specialty.
  const pageIsTypeRoot = specialty == null && typeRoot != null && (
    page.type === "blurb-nav-hub" || page.track_id != null
  );

  const crumbs: Crumb[] = [root];

  if (pageIsTypeRoot && typeRoot) {
    crumbs.push({ label: typeRoot.label });
    return crumbs;
  }

  if (typeRoot) {
    crumbs.push(typeRoot);
  }

  if (specialty) {
    if (pageIsSpecialtyHub) {
      crumbs.push({ label: specialty.name });
      return crumbs;
    }
    const href = specialtyHubSlug
      ? `/app/${specialty.slug}/${specialtyHubSlug}`
      : `/app/${specialty.slug}`;
    crumbs.push({ label: specialty.name, href });
  }

  crumbs.push({ label: page.title });
  return crumbs;
}
