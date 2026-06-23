import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import type { OnboardingContentMap } from "@/lib/onboarding/tips";

// Returns the editable onboarding strings (site_content rows keyed
// `onboarding.%`) for the OnboardingProvider, so the coachmarks + guide can
// render DB-backed (editable) copy with the hardcoded TIPS as fallback.
// Per-request memoized via React cache(). Inline edits revalidate "/app"
// (see updateScalarField), re-running this on the next render.
//
// Server-only, service-role client (matches getSiteContent): site_content is
// public-read, so the service role just sidesteps RLS without reading cookies.
// Returns {} on any failure (table missing, mock mode) → fallbacks render.
export const getOnboardingContent = cache(async (): Promise<OnboardingContentMap> => {
  if (USE_MOCK_DATA) return {};

  const map: OnboardingContentMap = {};
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("site_content")
      .select("id, key, value")
      .like("key", "onboarding.%");
    for (const row of data ?? []) {
      map[row.key as string] = { id: row.id as number, value: row.value as string };
    }
  } catch {
    // Fall through to {} → TipText renders fallbacks (non-editable).
  }
  return map;
});
