/**
 * Revisão by the student's choice for the MedHelp 60D materials (Karina 2026-11-19, 13h27 EST). Pure, client-safe.
 *
 * - Simulados 100Q: an answer never enters the Revisão by itself. Only a WRONG question the student ticks
 *   "Quero revisar" on (correction step or result list) enters; it comes back the next day and then follows the
 *   same spaced repetition as every question (SM-2). Unticking — or "Já domino isto" in the Revisão — takes it
 *   out (suspended); answers, results and history are never touched.
 * - Fórmula MedHelp: a page enters only through its own "Quero revisar" box, as a re-read on the MemoreCards
 *   ladder (3 → 7 → 14 → 30 days, never after the exam). "Concluir leitura" and the 60D checklist never enrol it.
 * - MemoreCards stay automatic (unchanged).
 */

/** The 60D module id (pages.content_module_id) — same constant as lib/medhelp-60d.ts. */
const MEDHELP_60D_MODULE_ID = 1;

/** A Simulado 100Q page: a simulado inside the MedHelp 60D module. */
export function isSimulado100Page(p: { view: string | null; content_module_id: number | null } | null | undefined): boolean {
  return !!p && p.view === "simulados" && p.content_module_id === MEDHELP_60D_MODULE_ID;
}

/** The checkbox, her words. */
export const QUERO_REVISAR = "Quero revisar";
/** Supporting text under the Fórmula page's checkbox (her text). */
export const FORMULA_REVISAR_APOIO = "Inclua este conteúdo na revisão espaçada. Você pode desmarcar quando quiser.";
