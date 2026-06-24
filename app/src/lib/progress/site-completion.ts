import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";

/**
 * Site-wide completion for the header "Sua jornada" meter.
 *
 * Per the data-fetching invariant this is a plain async function called from the
 * server layout (never the browser client). It reads through one SECURITY DEFINER
 * RPC (`get_site_completion`, see schema-patch-site-completion-sections.sql) so the
 * header costs a single round-trip instead of fetching every attempt row.
 *
 * The breakdown is by real site SECTION (the names members see in the "Estudar"
 * nav), not by raw item type. A section bar appears only once it has accessible
 * content, so gated sections (Fórmula) surface automatically after the 60D unlock.
 *
 * Returns `null` on any failure (e.g. the patch hasn't been applied yet) so the
 * header degrades cleanly to its plain border.
 */

export type CompletionSectionKey =
  | "questoes"
  | "resumos"
  | "medvoice"
  | "audiocards"
  | "revalida"
  | "flashcards"
  | "formula";

export interface CompletionPillar {
  key: CompletionSectionKey;
  label: string;
  /** CSS var reference for the section's signature color (themed in globals.css). */
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

// Display order + labels/colors for each section. Labels are member-facing →
// hardcoded Portuguese (no i18n on the member site). Colors reuse the per-type
// signature tokens so the meter matches the Estudar nav and content cards.
const SECTION_META: { key: CompletionSectionKey; label: string; color: string }[] = [
  { key: "questoes",   label: "Questões",    color: "var(--c-questoes)" },
  { key: "resumos",    label: "Resumos",     color: "var(--c-resumos)" },
  { key: "medvoice",   label: "MedVoice",    color: "var(--c-medvoice)" },
  { key: "audiocards", label: "AudioCards",  color: "var(--c-audiocards)" },
  { key: "revalida",   label: "Revalida Up", color: "var(--c-revalida)" },
  { key: "flashcards", label: "Flashcards",  color: "var(--c-flashcards)" },
  { key: "formula",    label: "Fórmula",     color: "var(--c-formula)" },
];

/** Raw per-section counts as returned by the RPC (bigint columns → number|string). */
type CompletionRaw = Record<`${CompletionSectionKey}_total` | `${CompletionSectionKey}_done`, number>;

function buildPillars(raw: CompletionRaw): SiteCompletion {
  const pct = (done: number, total: number) =>
    total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  const pillars: CompletionPillar[] = SECTION_META
    .map((s) => {
      const total = raw[`${s.key}_total`];
      const done = raw[`${s.key}_done`];
      return { ...s, done, total, pct: pct(done, total) };
    })
    // Hide sections the member can't reach yet (gated/empty) so the popover only
    // lists what's actually in play; Fórmula folds in once 60D unlocks.
    .filter((p) => p.total > 0);

  const done = pillars.reduce((s, p) => s + p.done, 0);
  const total = pillars.reduce((s, p) => s + p.total, 0);

  return { overallPct: pct(done, total), done, total, pillars };
}

const MOCK_COMPLETION = buildPillars({
  questoes_total: 2351,   questoes_done: 430,
  resumos_total: 215,     resumos_done: 40,
  medvoice_total: 168,    medvoice_done: 12,
  audiocards_total: 192,  audiocards_done: 5,
  revalida_total: 187,    revalida_done: 8,
  flashcards_total: 3506, flashcards_done: 300,
  formula_total: 0,       formula_done: 0,
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
    const raw = {} as CompletionRaw;
    for (const s of SECTION_META) {
      raw[`${s.key}_total`] = n((row as Record<string, unknown>)[`${s.key}_total`]);
      raw[`${s.key}_done`] = n((row as Record<string, unknown>)[`${s.key}_done`]);
    }
    return buildPillars(raw);
  } catch {
    return null;
  }
}
