import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";

// One DB-backed public page (Política de Privacidade, Termos de Uso). `body_html`
// is rich HTML; render it through lib/sanitize#safe before display.
export type EditablePage = { id: number; title: string; body_html: string };

// Fetches a single editable public page by slug for the inline editor. Per-request
// memoized via React `cache()` (keyed by slug). Inline edits revalidate the legal
// routes (see actions/inline-edit.ts), re-running this on the next render.
//
// Server-only, cookieless service-role client (matches getSiteContent): the legal
// pages are ISR, and reading cookies here would force them dynamic. editable_pages
// is public-read, so the service role just sidesteps RLS.
//
// Returns null on any failure (table missing, fetch error, mock mode) — the pages
// then render their hardcoded fallback markup, which looks identical but isn't
// editable.
export const getEditablePage = cache(
  async (slug: string): Promise<EditablePage | null> => {
    if (USE_MOCK_DATA) return null;

    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("editable_pages")
        .select("id, title, body_html")
        .eq("slug", slug)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id as number,
        title: data.title as string,
        body_html: data.body_html as string,
      };
    } catch {
      // Fall through to null → page renders its hardcoded fallback.
      return null;
    }
  },
);
