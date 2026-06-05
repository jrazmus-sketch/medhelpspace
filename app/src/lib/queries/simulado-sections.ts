import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type SimuladoSection = {
  /** DB row id; -1 when the table/row is missing (falls back to JS default,
   *  which renders the label as plain text — not inline-editable). */
  id: number;
  key: string;
  label: string;
  iconSlug: string;
};

// Stable defaults: `key` joins the DB row to its (non-editable) icon slug, and
// `label` is the fallback shown if the table doesn't exist yet / fetch fails.
const DEFAULTS: { key: string; label: string; iconSlug: string }[] = [
  { key: "geral", label: "Geral", iconSlug: "geral" },
  { key: "por-temas", label: "Por Temas", iconSlug: "por-temas" },
];

// Returns the two simulado section headers, DB-backed label merged over the JS
// default. Per-request memoized via React `cache()`; inline-edit revalidates /app.
export const getSimuladoSectionOverrides = cache(
  async (): Promise<SimuladoSection[]> => {
    const byKey = new Map<string, { id: number; label: string }>();
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("simulado_sections")
        .select("id, key, label");
      for (const row of data ?? []) {
        byKey.set(row.key as string, {
          id: row.id as number,
          label: row.label as string,
        });
      }
    } catch {
      // Fall through to JS defaults if the table doesn't exist yet / fetch fails.
    }
    return DEFAULTS.map((d) => {
      const o = byKey.get(d.key);
      return {
        id: o?.id ?? -1,
        key: d.key,
        label: o?.label ?? d.label,
        iconSlug: d.iconSlug,
      };
    });
  },
);
