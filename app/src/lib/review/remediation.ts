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

/** A Meu Plano topic's own study pages (topic_content 'resumo' / 'revalida_up'). */
export type TopicLinks = { resumoHref?: string; revalidaUpHref?: string };

/**
 * R1 (Karina 2026-11-12): the link follows the QUESTION's own topic.
 *   1. the topic's Resumo, else 2. its Revalida Up;
 *   3. a topic with neither keeps the section's link ONLY when the section holds that
 *      topic alone (then the section's material IS the topic's);
 *   4. otherwise no link — never another subject's material "to fill the gap".
 * A record not identified yet (no original) keeps the section's link, as before R1.
 * An identified question whose topic is still undecided (new-topic proposal) gets the
 * section's link only when the section has no other topic; else none.
 */
export function pickRemediation(args: {
  identified: boolean;
  topicId: number | null;
  topicLinks: Map<number, TopicLinks>;
  sectionTopics: Set<number>;
  sectionRemediation: Remediation | null;
}): Remediation | null {
  const { identified, topicId, topicLinks, sectionTopics, sectionRemediation } = args;
  if (!identified) return sectionRemediation;
  if (topicId != null) {
    const l = topicLinks.get(topicId);
    if (l?.resumoHref) return { href: l.resumoHref, label: REMEDIATION_LABELS.resumo };
    if (l?.revalidaUpHref) return { href: l.revalidaUpHref, label: REMEDIATION_LABELS.revalidaUp };
    return sectionTopics.size === 1 && sectionTopics.has(topicId) ? sectionRemediation : null;
  }
  return sectionTopics.size === 0 ? sectionRemediation : null;
}
