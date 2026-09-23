// Where a missed question sends the student to study (Karina, 2026-09-23):
//   1. the topic's Resumo — her choice ("prefiro que o destino seja o Resumo
//      Narrativo do tema");
//   2. otherwise its Revalida Up page;
//   3. otherwise no link — never back to more questions, and never "aula".

/** Strip the -quiz / -simulados suffix some legacy question pages carry. */
function topicBase(questionPageSlug: string): string {
  return questionPageSlug.replace(/-(quiz|simulados)$/, "");
}

/** The Resumo page slug for a Questões page slug (`pancreatite` → `pancreatite-resumos`). */
export function resumoSlugFor(questionPageSlug: string): string {
  return `${topicBase(questionPageSlug)}-resumos`;
}

/**
 * The Revalida Up page slug for a Questões page slug, by the naming convention
 * (`pancreatite` → `pancreatite-revalida-up`). Only the FALLBACK for pages the
 * study-plan map (topic_content) does not cover.
 */
export function revalidaUpSlugFor(questionPageSlug: string): string {
  return `${topicBase(questionPageSlug)}-revalida-up`;
}

export const REMEDIATION_LABELS = {
  resumo: "Revisar o resumo do tema",
  revalidaUp: "Revisar o tema no Revalida Up",
} as const;

export type Remediation = { href: string; label: string };
