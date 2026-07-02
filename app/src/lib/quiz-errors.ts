// Phase 4 — error classification shared vocabulary.
//
// Plain module (NOT "use server"): imported by the QuizPlayer (client), the
// tag action (server), the Relatório section (server), and the plan engine.
// Stored slugs are ASCII; accents live only in the PT display labels.

export type QuizErrorCategory =
  | "conteudo"
  | "interpretacao"
  | "distracao"
  | "conduta"
  | "memorizacao";

export const QUIZ_ERROR_CATEGORIES: {
  slug: QuizErrorCategory;
  label: string;
  hint: string; // shown under the chip while tagging
  tip: string; // remediation guidance, shown in the error profile
}[] = [
  { slug: "conteudo",      label: "Conteúdo",      hint: "Não sabia o conteúdo",         tip: "Reforce o conteúdo dos temas onde mais erra — áudio, resumos e flashcards." },
  { slug: "interpretacao", label: "Interpretação", hint: "Interpretei mal o enunciado",  tip: "Leia o enunciado com calma e destaque o que está sendo perguntado." },
  { slug: "distracao",     label: "Distração",     hint: "Sabia, mas vacilei",           tip: "Revise a resposta antes de confirmar — releia todas as alternativas." },
  { slug: "conduta",       label: "Conduta",       hint: "Errei a conduta/raciocínio",   tip: "Estude condutas e fluxogramas; pratique casos clínicos comentados." },
  { slug: "memorizacao",   label: "Memorização",   hint: "Esqueci um detalhe",           tip: "Use flashcards e revisão espaçada para fixar os detalhes." },
];

// Knowledge-gap errors — these mean "study this topic more" and are what tilts
// the study plan toward the affected specialty. interpretacao / distracao are
// test-taking issues (not the topic's fault), so they inform the insight text
// only and never boost a specialty's ranking.
export const GAP_ERROR_CATEGORIES: ReadonlySet<QuizErrorCategory> = new Set([
  "conteudo",
  "conduta",
  "memorizacao",
]);

export const QUIZ_ERROR_LABEL: Record<QuizErrorCategory, string> = Object.fromEntries(
  QUIZ_ERROR_CATEGORIES.map((c) => [c.slug, c.label]),
) as Record<QuizErrorCategory, string>;

export function isQuizErrorCategory(v: unknown): v is QuizErrorCategory {
  return typeof v === "string" && QUIZ_ERROR_CATEGORIES.some((c) => c.slug === v);
}
