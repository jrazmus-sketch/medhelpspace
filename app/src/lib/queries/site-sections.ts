import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import type { PageLayout } from "@/lib/site-sections-order";

export { orderSections } from "@/lib/site-sections-order";
export type { PageLayout } from "@/lib/site-sections-order";

/**
 * Structured landing control: which sections are shown, in what order, and
 * whether the page is public at all.
 *
 * The sections themselves are DEFINED IN CODE (see the `SECTIONS` list on the
 * page). This only decides visibility and order — deliberately not a page
 * builder, per Karina's "um editor estruturado e seguro" (2026-09-01).
 *
 * Fails open on the SHAPE and closed on the GATE: if the table cannot be read,
 * sections fall back to their code-declared order (the page still renders), but
 * `published` stays false, so a database problem can never accidentally put an
 * unfinished sales page in front of the public.
 */

const CLOSED: PageLayout = { published: false, visible: {}, position: {} };

export const getPageLayout = cache(async (page: string): Promise<PageLayout> => {
  if (USE_MOCK_DATA) return { published: true, visible: {}, position: {} };
  try {
    const supabase = createAdminClient();
    const [{ data: pageRow }, { data: sections }] = await Promise.all([
      supabase.from("site_pages").select("published").eq("page", page).maybeSingle(),
      supabase.from("site_sections").select("key, visible, position").eq("page", page),
    ]);
    const layout: PageLayout = {
      published: !!pageRow?.published,
      visible: {},
      position: {},
    };
    for (const row of sections ?? []) {
      layout.visible[row.key as string] = !!row.visible;
      layout.position[row.key as string] = row.position as number;
    }
    return layout;
  } catch {
    return CLOSED;
  }
});
