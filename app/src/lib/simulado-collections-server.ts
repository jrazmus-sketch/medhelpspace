import "server-only";
import { getSiteContent } from "@/lib/queries/site-content";
import {
  collectionCopy,
  collectionForSlug,
  collectionHref,
  type SimuladoCollection,
} from "@/lib/simulado-collections";

export type ResolvedCollection = {
  collection: SimuladoCollection;
  href: string;
  title: string;
  description: string;
  tagline: string;
};

/** A collection's copy as admins left it (site_content), over the registry fallbacks. */
export async function resolveCollection(c: SimuladoCollection): Promise<ResolvedCollection> {
  const copy = collectionCopy(c, await getSiteContent());
  return { collection: c, href: collectionHref(c.key), ...copy };
}

/**
 * The GERAL collection a page belongs to — only for a Geral simulado (view='simulados',
 * no specialty, outside the 60D module) whose slug matches a collection; null otherwise.
 */
export async function geralCollectionOf(page: {
  slug: string;
  view: string | null;
  specialty_id: number | null;
  content_module_id: number | null;
}): Promise<ResolvedCollection | null> {
  if (page.view !== "simulados" || page.specialty_id != null || page.content_module_id != null) return null;
  const c = collectionForSlug(page.slug);
  return c ? resolveCollection(c) : null;
}
