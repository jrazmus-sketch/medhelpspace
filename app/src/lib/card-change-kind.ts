/**
 * Single source (TEST): the type of a change to a card's text — Karina's tiers (2026-11-13):
 *   editorial        A — punctuation, accents, agreement, formatting, equivalent terminology: the audio stays
 *   clinica          B — doses, criteria, treatment, contraindications, conduct: re-record; the audio is suspended
 *   nao_esclarecida  C — not stated: pending her evaluation, never decided automatically (the default)
 */
export type CardChangeKind = "editorial" | "clinica" | "nao_esclarecida";
export const CARD_CHANGE_KINDS: readonly CardChangeKind[] = ["nao_esclarecida", "editorial", "clinica"];
export const isCardChangeKind = (v: unknown): v is CardChangeKind =>
  typeof v === "string" && (CARD_CHANGE_KINDS as readonly string[]).includes(v);
