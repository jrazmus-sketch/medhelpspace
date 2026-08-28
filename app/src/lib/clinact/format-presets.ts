/**
 * Format → default step stack (§2 "Block kinds"). Lives in code, not the DB:
 * picking a format seeds the stack, and every block toggles per case.
 *
 * The matrix mirrors the four model docs in docs/clinact/modelo-*.md:
 * `default` blocks are seeded enabled; `optional` blocks are allowed but not
 * seeded; anything else is accepted by the importer with a warning (it is her
 * case — the format is a starting point, not a cage).
 */

import { FORMAT_SKILL, type CaseFormat, type StepDoc, type StepKind } from "./types";

type Preset = { default: StepKind[]; optional: StepKind[] };

export const FORMAT_PRESETS: Record<CaseFormat, Preset> = {
  decisao_30s: {
    default: ["narrativa", "pergunta", "confianca", "feedback", "custo_do_atraso", "leve_deste_caso"],
    optional: ["ordenar", "cronometro", "midia"],
  },
  codigo_clinico: {
    default: ["narrativa", "pistas", "pergunta", "confianca", "feedback", "leve_deste_caso"],
    optional: ["midia"],
  },
  ponto_de_virada: {
    default: ["narrativa", "pergunta", "novo_dado", "reavaliacao", "confianca", "feedback", "leve_deste_caso"],
    optional: ["pistas", "custo_do_atraso", "midia"],
  },
  clinica_em_cena: {
    default: ["narrativa", "cena_conduta", "feedback", "leve_deste_caso"],
    optional: ["pergunta", "novo_dado", "confianca", "custo_do_atraso", "midia"],
  },
};

export function emptyContentFor(kind: StepKind): Record<string, unknown> {
  switch (kind) {
    case "narrativa":
    case "novo_dado":
    case "cena_conduta":
    case "feedback":
    case "seducao":
    case "leve_deste_caso":
      return { text: "" };
    case "pergunta":
    case "reavaliacao":
      return { prompt: "" };
    case "ordenar":
      return { prompt: "", items: [] };
    case "custo_do_atraso":
      return { text: "", window: "" };
    case "midia":
      return { media: [] };
    case "cronometro":
      return { seconds: 30 };
    default:
      return {};
  }
}

const DEFAULT_OPTIONS = (kind: StepKind) =>
  kind === "pergunta" || kind === "reavaliacao" || kind === "cena_conduta"
    ? [
        { position: 0, label: "", is_correct: true, effect: {} },
        { position: 1, label: "", is_correct: false, effect: {} },
        { position: 2, label: "", is_correct: false, effect: {} },
      ]
    : [];

export function seedSteps(format: CaseFormat): StepDoc[] {
  return FORMAT_PRESETS[format].default.map((kind, i) => ({
    position: i,
    kind,
    enabled: true,
    scene_key: kind === "cena_conduta" ? "cena1" : null,
    skill: isDecision(kind) ? FORMAT_SKILL[format] : null,
    content: emptyContentFor(kind),
    options: DEFAULT_OPTIONS(kind),
  }));
}

export function newStep(kind: StepKind, position: number, format: CaseFormat): StepDoc {
  return {
    position,
    kind,
    enabled: true,
    scene_key: kind === "cena_conduta" ? `cena${position + 1}` : null,
    skill: isDecision(kind) ? FORMAT_SKILL[format] : null,
    content: emptyContentFor(kind),
    options: DEFAULT_OPTIONS(kind),
  };
}

export function isDecision(kind: StepKind): boolean {
  return kind === "pergunta" || kind === "reavaliacao" || kind === "ordenar" || kind === "cena_conduta";
}

/** Kinds an author may add by hand (generated ones are excluded). */
export const AUTHORABLE_KINDS: StepKind[] = [
  "narrativa",
  "pistas",
  "pergunta",
  "ordenar",
  "cena_conduta",
  "novo_dado",
  "reavaliacao",
  "confianca",
  "feedback",
  "custo_do_atraso",
  "midia",
  "cronometro",
  "leve_deste_caso",
];
