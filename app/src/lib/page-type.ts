import {
  ClipboardList, ListChecks, ScrollText, Mic, FlaskConical,
  Headphones, Layers, CalendarClock, Target, type LucideIcon,
} from "lucide-react";
import type { PageView } from "@/types/supabase";

// Canonical study-type keys. Cover every "type root" that buildCrumbsForPage
// can resolve (view / track_id / content_module_id), plus flashcards.
export type StudyTypeKey =
  | "quiz"
  | "simulados"
  | "resumos"
  | "formula"
  | "revalida-up"
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
  "revalida-up": { key: "revalida-up", label: "Revalida Up",     desc: "Padrões de prova — decisão estratégica", Icon: Target,       color: "var(--c-revalida)",   hubHref: "/app/revalida-up" },
  medvoice:   { key: "medvoice",   label: "MedVoice",           desc: "Áudios por tema — a Clínica Fala",      Icon: Mic,           color: "var(--c-medvoice)",   hubHref: "/app/medvoice" },
  audiocards: { key: "audiocards", label: "AudioCards",         desc: "Revisão em áudio, cartão por cartão",   Icon: Headphones,    color: "var(--c-audiocards)", hubHref: "/app/audiocards" },
  flashcards: { key: "flashcards", label: "Flashcards",         desc: "Revisão ativa com cartões",             Icon: Layers,        color: "var(--c-flashcards)", hubHref: "/app/flashcards" },
  medhelp60:  { key: "medhelp60",  label: "MedHelp 60D",        desc: "Conteúdo dos 60 dias finais",           Icon: CalendarClock, color: "var(--c-medhelp60)" },
};

// One-line explanations surfaced by the TypeChip's optional HelpTip ("?").
// Richer than `desc` (which is a card sub-line): says what the type IS *and*
// how to use it, for newcomers meeting the branded names for the first time.
// Member-facing → hardcoded Portuguese.
export const STUDY_TYPE_HELP: Record<StudyTypeKey, string> = {
  quiz:       "Questões no estilo da prova do INEP, com comentário explicando cada alternativa. Para treinar raciocínio e revisar os erros.",
  simulados:  "Provas completas para treinar no formato e no ritmo da prova real, com casos clínicos encadeados.",
  resumos:    "Narrativas clínicas objetivas por especialidade — para revisar o essencial de cada tema com rapidez.",
  formula:    "Condutas clínicas em formato visual e direto: o passo a passo de cada manejo, fácil de fixar.",
  "revalida-up": "Os padrões que mais caem na prova, organizados como decisão estratégica de estudo.",
  medvoice:   "Áudios curtos por tema — a clínica explicada em voz, para estudar ouvindo (no trânsito, na academia).",
  audiocards: "Revisão ativa em áudio, cartão por cartão: você ouve a pergunta e, em seguida, a resposta.",
  flashcards: "Cartões de revisão ativa: tente responder, vire o cartão e confira. Ótimo para memorização de longo prazo.",
  medhelp60:  "Revisão intensiva liberada nos últimos 60 dias antes da prova. Abre automaticamente quando a data se aproxima.",
};

// Short forms used in the inline TypeChip (full labels read awkward inside a
// pill that sits next to a long page title).
export const STUDY_TYPE_CHIP_LABEL: Record<StudyTypeKey, string> = {
  quiz:       "Questão",
  simulados:  "Simulado",
  resumos:    "Resumo",
  formula:    "Fórmula",
  "revalida-up": "Revalida Up",
  medvoice:   "MedVoice",
  audiocards: "AudioCard",
  flashcards: "Flashcard",
  medhelp60:  "MedHelp 60D",
};

const MEDVOICE_TRACK_ID = 1;
const AUDIOCARDS_TRACK_ID = 2;
const FLASHCARDS_TRACK_ID = 3;
const MEDHELP_60D_MODULE_ID = 1;

// Same precedence as typeRootFor() in lib/breadcrumbs.ts — flashcards track FIRST
// (it carries view='quiz' but isn't a quiz), then view, then track, then module.
// Returns null when the page has no type root (rare; e.g. plain-content with no
// view/track/module).
export function getStudyTypeKey(input: {
  view: PageView | null;
  track_id: number | null;
  content_module_id: number | null;
}): StudyTypeKey | null {
  const { view, track_id, content_module_id } = input;
  if (track_id === FLASHCARDS_TRACK_ID) return "flashcards";
  if (view === "quiz")      return "quiz";
  if (view === "simulados") return "simulados";
  if (view === "resumos")   return "resumos";
  if (view === "formula")   return "formula";
  if (view === "revalida-up") return "revalida-up";
  if (track_id === MEDVOICE_TRACK_ID)   return "medvoice";
  if (track_id === AUDIOCARDS_TRACK_ID) return "audiocards";
  if (content_module_id === MEDHELP_60D_MODULE_ID) return "medhelp60";
  return null;
}

// Client-side counterpart used by the top nav to keep a section item lit while
// the user is drilled into a sub-page of that section. Pure URL/slug parsing —
// no DB lookup. Leaf slugs follow the WP-migrated suffix convention
// (-audiocards, -medvoice, -flashcards, -resumos, -formula, -simulados, -quiz).
// Bare-slug topic pages (most quiz leaves) cannot be disambiguated from URL
// alone and return null; that's an accepted gap.
export function getStudyTypeFromPathname(pathname: string): StudyTypeKey | null {
  if (pathname === "/app/estudo-por-questoes") return "quiz";
  if (pathname === "/app/resumos")             return "resumos";
  if (pathname === "/app/formula-medhelp")     return "formula";
  if (pathname === "/app/revalida-up")         return "revalida-up";
  if (pathname === "/app/medvoice")            return "medvoice";
  if (pathname === "/app/audiocards")          return "audiocards";
  if (pathname === "/app/flashcards")          return "flashcards";

  if (pathname.startsWith("/app/estudo-por-questoes/")) return "quiz";
  if (pathname.startsWith("/app/resumos/"))             return "resumos";
  if (pathname.startsWith("/app/formula-medhelp/"))     return "formula";
  if (pathname.startsWith("/app/revalida-up/"))         return "revalida-up";
  if (pathname.startsWith("/app/medvoice/"))            return "medvoice";
  if (pathname.startsWith("/app/audiocards/"))          return "audiocards";
  if (pathname.startsWith("/app/flashcards/"))          return "flashcards";

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 3 && segments[0] === "app") {
    const slug = segments[2];
    if (slug.endsWith("-audiocards")) return "audiocards";
    if (slug.endsWith("-medvoice"))   return "medvoice";
    if (slug.endsWith("-flashcards")) return "flashcards";
    if (slug.endsWith("-resumos"))    return "resumos";
    if (slug.endsWith("-revalida-up")) return "revalida-up";
    if (slug.endsWith("-formula"))    return "formula";
    if (slug.endsWith("-simulados"))  return "simulados";
    // New simulados leaves: '<spec>-simulado-<n>' (por área) and
    // 'simulado-geral-<n>' (Geral), routed at /app/<spec>/… and /app/geral/….
    if (/-simulado-\d+$/.test(slug) || /^simulado-geral-\d+$/.test(slug)) return "simulados";
    if (slug.endsWith("-quiz"))       return "quiz";
  }

  return null;
}
