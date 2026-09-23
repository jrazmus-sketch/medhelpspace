/**
 * The Revalida Up page slug for a Questões page slug, by the naming convention
 * (`pancreatite` → `pancreatite-revalida-up`). Only the FALLBACK for pages the
 * study-plan map (topic_content) does not cover; drops the -quiz / -simulados
 * suffixes some legacy question pages carry.
 */
export function revalidaUpSlugFor(questionPageSlug: string): string {
  return `${questionPageSlug.replace(/-(quiz|simulados)$/, "")}-revalida-up`;
}

/** The label under a missed question. The platform has no "aulas" (Karina, 2026-09-23). */
export const REMEDIATION_LABEL = "Revisar o tema no Revalida Up";
