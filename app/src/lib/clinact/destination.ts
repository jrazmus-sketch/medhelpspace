/**
 * Is this (already validated) destination inside ClinAct? Decides which
 * product the shared auth screens and the confirmation e-mail name — a person
 * who came from ClinAct must never be greeted as a Revalida student.
 *
 * Pure (no server imports): used by client screens, routes and tests.
 */
export function isClinactDestination(next: string | null | undefined): boolean {
  if (!next) return false;
  return next === "/clinact" || next.startsWith("/clinact/") || next.startsWith("/clinact?");
}
