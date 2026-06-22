import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import type { SiteContentMap } from "@/components/landing/site-text";

// Returns every editable landing string keyed by its `site_content.key`, for the
// SiteContentProvider on the landing page. Per-request memoized via React
// `cache()`. Inline edits revalidate "/" (see updateScalarField), which re-runs
// this on the next render.
//
// Server-only, cookieless service-role client (matches getCohortsForSale): the
// landing page is ISR (revalidate=3600), and reading cookies here would force it
// dynamic. site_content is public-read, so the service role just sidesteps RLS.
//
// Returns {} on any failure (table missing, fetch error, mock mode) — SiteText
// then renders the hardcoded fallbacks, which look identical but aren't editable.
export const getSiteContent = cache(async (): Promise<SiteContentMap> => {
  if (USE_MOCK_DATA) return {};

  const map: SiteContentMap = {};
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from("site_content").select("id, key, value");
    for (const row of data ?? []) {
      map[row.key as string] = {
        id: row.id as number,
        value: row.value as string,
      };
    }
  } catch {
    // Fall through to {} → SiteText renders fallbacks (non-editable).
  }
  return map;
});
