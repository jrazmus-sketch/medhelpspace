import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import type { SiteContentMap } from "@/components/landing/site-text";

// Returns every editable site string keyed by its `site_content.key`, for the
// SiteContentProvider mounted in the ROOT layout (so <SiteText> works on every
// public page, including the pure-client auth pages). Per-request memoized via
// React `cache()`, so it runs at most once per render even though the provider is
// global; the read is a single cookieless, indexed, service-role SELECT. Inline
// edits revalidate "/" and "/loja" (see actions/inline-edit.ts).
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
