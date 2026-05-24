import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { STUDY_TYPE_CONFIG, type StudyTypeKey } from "@/lib/page-type";

export type StudyTypeOverride = {
  id: number;
  key: StudyTypeKey;
  label: string;
  description: string;
};

// Returns DB-backed label/description per StudyTypeKey, merged over the JS
// defaults in STUDY_TYPE_CONFIG. Per-request memoized via React `cache()`;
// inline-edit revalidates /app on save.
export const getStudyTypeOverrides = cache(
  async (): Promise<Map<StudyTypeKey, StudyTypeOverride>> => {
    const map = new Map<StudyTypeKey, StudyTypeOverride>();
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("study_types")
        .select("id, key, label, description");
      for (const row of data ?? []) {
        map.set(row.key as StudyTypeKey, {
          id: row.id as number,
          key: row.key as StudyTypeKey,
          label: row.label as string,
          description: row.description as string,
        });
      }
    } catch {
      // Fall through to JS defaults if the table doesn't exist yet / fetch fails.
    }
    // Backfill any missing keys from the JS config so callers never see undefined.
    for (const key of Object.keys(STUDY_TYPE_CONFIG) as StudyTypeKey[]) {
      if (!map.has(key)) {
        const cfg = STUDY_TYPE_CONFIG[key];
        map.set(key, { id: -1, key, label: cfg.label, description: cfg.desc });
      }
    }
    return map;
  },
);
