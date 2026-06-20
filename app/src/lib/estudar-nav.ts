import type { StudyTypeKey } from "@/lib/page-type";

// The six content types, grouped by study modality. Shared by the desktop
// "Estudar" dropdown (member-header) and the mobile "Estudar" bottom sheet so
// the two never drift. Labels/icons/colors/hrefs come from STUDY_TYPE_CONFIG.
export const ESTUDAR_GROUPS: { label: string; keys: StudyTypeKey[] }[] = [
  { label: "Praticar", keys: ["quiz", "flashcards", "revalida-up"] },
  { label: "Ler",      keys: ["resumos"] },
  { label: "Ouvir",    keys: ["medvoice", "audiocards"] },
];

// Quiz also lights up for simulados (they share the questões hub).
export function isTypeActive(key: StudyTypeKey, currentType: StudyTypeKey | null) {
  if (key === "quiz") return currentType === "quiz" || currentType === "simulados";
  return currentType === key;
}
