import type { StudyTypeKey } from "@/lib/page-type";

// The six content types, grouped by study modality. Shared by the desktop
// "Estudar" dropdown (member-header) and the mobile "Estudar" bottom sheet so
// the two never drift. Labels/icons/colors/hrefs come from STUDY_TYPE_CONFIG.
export const ESTUDAR_GROUPS: { label: string; keys: StudyTypeKey[] }[] = [
  { label: "Praticar", keys: ["quiz", "flashcards", "revalida-up"] },
  { label: "Ler",      keys: ["resumos"] },
  { label: "Ouvir",    keys: ["medvoice", "audiocards"] },
];

// Per-item label/description overrides for the Estudar nav (desktop dropdown +
// mobile sheet) where the nav entry should read differently from its hub card.
// `quiz` links to the "Estudo por Questões" hub, which holds BOTH Questões
// Revalida and Simulados — so the nav names it after the hub, not the quiz card
// (which still reads "Questões Revalida" on the hub page itself). Falls back to
// STUDY_TYPE_CONFIG for any key not listed here.
export const ESTUDAR_NAV_OVERRIDES: Partial<
  Record<StudyTypeKey, { label?: string; desc?: string }>
> = {
  quiz: { label: "Estudo por Questões", desc: "Revalida e simulados" },
};

// Quiz also lights up for simulados (they share the questões hub).
export function isTypeActive(key: StudyTypeKey, currentType: StudyTypeKey | null) {
  if (key === "quiz") return currentType === "quiz" || currentType === "simulados";
  return currentType === key;
}
