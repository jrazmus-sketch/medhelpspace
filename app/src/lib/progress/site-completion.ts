import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";

/**
 * Site-wide completion for the header "Sua jornada" meter.
 *
 * Per the data-fetching invariant this is a plain async function called from the
 * server layout (never the browser client). It reads through one SECURITY DEFINER
 * RPC (`get_site_completion`, see schema-patch-site-completion.sql) so the header
 * costs a single round-trip instead of fetching every attempt row.
 *
 * Returns `null` on any failure (e.g. the patch hasn't been applied yet) so the
 * header degrades cleanly to its plain border.
 */

export interface CompletionPillar {
  key: "aulas" | "questoes" | "flashcards";
  label: string;
  /** CSS var reference for the pillar's signature color (themed in globals.css). */
  color: string;
  done: number;
  total: number;
  pct: number;
}

export interface SiteCompletion {
  /** 0–100, rounded. Overall share of all tracked content items completed. */
  overallPct: number;
  done: number;
  total: number;
  pillars: CompletionPillar[];
}

function buildPillars(raw: {
  lessons_total: number;
  lessons_done: number;
  quiz_total: number;
  quiz_done: number;
  flash_total: number;
  flash_done: number;
}): SiteCompletion {
  const pct = (done: number, total: number) =>
    total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  const pillars: CompletionPillar[] = [
    { key: "aulas",      label: "Aulas",      color: "var(--c-resumos)",    done: raw.lessons_done, total: raw.lessons_total, pct: pct(raw.lessons_done, raw.lessons_total) },
    { key: "questoes",   label: "Questões",   color: "var(--c-questoes)",   done: raw.quiz_done,    total: raw.quiz_total,    pct: pct(raw.quiz_done, raw.quiz_total) },
    { key: "flashcards", label: "Flashcards", color: "var(--c-flashcards)", done: raw.flash_done,   total: raw.flash_total,   pct: pct(raw.flash_done, raw.flash_total) },
  ];

  const done = pillars.reduce((s, p) => s + p.done, 0);
  const total = pillars.reduce((s, p) => s + p.total, 0);

  return { overallPct: pct(done, total), done, total, pillars };
}

const MOCK_COMPLETION = buildPillars({
  lessons_total: 1180, lessons_done: 512,
  quiz_total: 1640,    quiz_done: 430,
  flash_total: 3506,   flash_done: 980,
});

export async function getSiteCompletion(userId: string): Promise<SiteCompletion | null> {
  if (USE_MOCK_DATA) return MOCK_COMPLETION;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("get_site_completion", { p_user: userId });
    if (error || !data) return null;

    // Postgres `RETURNS TABLE` surfaces as a single-row array; coerce the
    // bigint-as-string counts to numbers.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    const n = (v: unknown) => Number(v ?? 0);
    return buildPillars({
      lessons_total: n(row.lessons_total),
      lessons_done:  n(row.lessons_done),
      quiz_total:    n(row.quiz_total),
      quiz_done:     n(row.quiz_done),
      flash_total:   n(row.flash_total),
      flash_done:    n(row.flash_done),
    });
  } catch {
    return null;
  }
}
