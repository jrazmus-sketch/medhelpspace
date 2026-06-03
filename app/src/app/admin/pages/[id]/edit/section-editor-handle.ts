/**
 * Imperative handle exposed by each content-section editor (quiz, flashcards,
 * nav items). The page editor holds a ref to the active section and calls
 * `save()` as part of the single page-level Save, so metadata and content
 * commit together in one click instead of via separate per-section buttons.
 */
export type SectionEditorHandle = {
  /**
   * Persists this section. Resolves `true` on success; on failure it surfaces
   * its own inline error next to the offending row and resolves `false`.
   */
  save: () => Promise<boolean>;
};
