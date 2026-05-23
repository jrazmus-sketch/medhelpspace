import {
  ClipboardList, ListChecks, ScrollText, Mic, FlaskConical,
  Headphones, Layers, CalendarClock, type LucideIcon,
} from "lucide-react";
import type { PageView } from "@/types/supabase";

// Canonical study-type keys. Cover every "type root" that buildCrumbsForPage
// can resolve (view / track_id / content_module_id), plus flashcards.
export type StudyTypeKey =
  | "quiz"
  | "simulados"
  | "resumos"
  | "formula"
  | "medvoice"
  | "audiocards"
  | "flashcards"
  | "medhelp60";

export type StudyTypeConfig = {
  key: StudyTypeKey;
  label: string;       // chip text + card title
  desc: string;        // sub-line on big specialty cards
  Icon: LucideIcon;
  color: string;       // CSS var reference, used by chip + cards
  hubHref?: string;    // top-level type root (omitted for medhelp60, which has no public hub)
};

export const STUDY_TYPE_CONFIG: Record<StudyTypeKey, StudyTypeConfig> = {
  quiz:       { key: "quiz",       label: "Questões Revalida",  desc: "Questões estilo INEP comentadas",       Icon: ClipboardList, color: "var(--c-questoes)",   hubHref: "/app/estudo-por-questoes" },
  simulados:  { key: "simulados",  label: "Simulados",          desc: "Treino de prova por casos clínicos",    Icon: ListChecks,    color: "var(--c-simulados)",  hubHref: "/app/estudo-por-questoes?tab=simulados" },
  resumos:    { key: "resumos",    label: "Resumos Narrativos", desc: "Narrativas clínicas por especialidade", Icon: ScrollText,    color: "var(--c-resumos)",    hubHref: "/app/resumos" },
  formula:    { key: "formula",    label: "Fórmula MedHelp",    desc: "Condutas clínicas em formato visual",   Icon: FlaskConical,  color: "var(--c-formula)",    hubHref: "/app/formula-medhelp" },
  medvoice:   { key: "medvoice",   label: "MedVoice",           desc: "Áudios por tema — a Clínica Fala",      Icon: Mic,           color: "var(--c-medvoice)",   hubHref: "/app/medvoice" },
  audiocards: { key: "audiocards", label: "AudioCards",         desc: "Revisão em áudio, cartão por cartão",   Icon: Headphones,    color: "var(--c-audiocards)", hubHref: "/app/audiocards" },
  flashcards: { key: "flashcards", label: "Flashcards",         desc: "Revisão ativa com cartões",             Icon: Layers,        color: "var(--c-flashcards)", hubHref: "/app/flashcards" },
  medhelp60:  { key: "medhelp60",  label: "MedHelp 60D",        desc: "Conteúdo dos 60 dias finais",           Icon: CalendarClock, color: "var(--c-medhelp60)" },
};

// Short forms used in the inline TypeChip (full labels read awkward inside a
// pill that sits next to a long page title).
export const STUDY_TYPE_CHIP_LABEL: Record<StudyTypeKey, string> = {
  quiz:       "Questão",
  simulados:  "Simulado",
  resumos:    "Resumo",
  formula:    "Fórmula",
  medvoice:   "MedVoice",
  audiocards: "AudioCard",
  flashcards: "Flashcard",
  medhelp60:  "MedHelp 60D",
};

const MEDVOICE_TRACK_ID = 1;
const AUDIOCARDS_TRACK_ID = 2;
const FLASHCARDS_TRACK_ID = 3;
const MEDHELP_60D_MODULE_ID = 1;

// Same precedence as typeRootFor() in lib/breadcrumbs.ts — view first, then
// track, then content module. Returns null when the page has no type root
// (rare; e.g. plain-content with no view/track/module).
export function getStudyTypeKey(input: {
  view: PageView | null;
  track_id: number | null;
  content_module_id: number | null;
}): StudyTypeKey | null {
  const { view, track_id, content_module_id } = input;
  if (view === "quiz")      return "quiz";
  if (view === "simulados") return "simulados";
  if (view === "resumos")   return "resumos";
  if (view === "formula")   return "formula";
  if (track_id === MEDVOICE_TRACK_ID)   return "medvoice";
  if (track_id === AUDIOCARDS_TRACK_ID) return "audiocards";
  if (track_id === FLASHCARDS_TRACK_ID) return "flashcards";
  if (content_module_id === MEDHELP_60D_MODULE_ID) return "medhelp60";
  return null;
}
