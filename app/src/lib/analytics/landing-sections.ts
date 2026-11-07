// Which DOM ids on the sales page count as "sections" for the GA4 funnel, and the
// event each one fires when it scrolls into view (Karina, 2026-09-30: "quantas
// pessoas chegaram à seção de Questões → viram MedVoice → chegaram ao preço").
//
// Pure data so the page, the tracker and the tests share one list. The ids are
// the elements' real DOM ids: the system showcase rows are `feature-<id>`, the
// 60D block is `medhelp60d`, pricing is `precos`, the FAQ is `faq`.

export type LandingSection = { id: string; section: string };

export const LANDING_SECTIONS: readonly LandingSection[] = [
  { id: "video-vendas", section: "sales_video" }, // view_sales_video_section (Karina 2026-10-01)
  { id: "feature-questoes", section: "questions" },
  { id: "feature-resumos", section: "resumos" },
  { id: "feature-medvoice", section: "medvoice" },
  { id: "feature-memorecards", section: "memorecards" },
  { id: "feature-flashcards", section: "flashcards" },
  { id: "feature-audiocards", section: "audiocards" },
  { id: "feature-revalida-up", section: "revalida_up" },
  { id: "medhelp60d", section: "medhelp60d" },
  { id: "por-tras", section: "founder" }, // view_founder_section — "Por trás da MedHelpSpace" (Karina 2026-10-09)
  { id: "precos", section: "pricing" },
  { id: "faq", section: "faq" },
];

/** GA4 event name a section view produces (kept here so tests can pin the names). */
export function sectionViewEventName(section: string): string {
  return `view_${section}_section`;
}

export const SCROLL_MILESTONES = [25, 50, 75, 90] as const;

/**
 * The ClinAct sales page (/clinact), Karina 2026-11-06 — her names, verbatim:
 * view_clinact_video_section, _formats_, _practice_, _evolution_, _founder_,
 * _free_cases_ and _pricing_. Same tracker and same "reached" rule as Revalida
 * (35% of the block, or the block filling half the screen — tall blocks on a
 * phone). The ids are on the sections in components/clinact/sales/.
 */
export const CLINACT_SECTION_IDS = {
  video: "video-clinact",
  formats: "formatos",
  practice: "na-pratica",
  evolution: "evolucao",
  founder: "por-tras",
  freeCases: "casos-gratuitos",
  pricing: "planos",
} as const;

export const CLINACT_LANDING_SECTIONS: readonly LandingSection[] = [
  { id: CLINACT_SECTION_IDS.video, section: "clinact_video" },
  { id: CLINACT_SECTION_IDS.formats, section: "clinact_formats" },
  { id: CLINACT_SECTION_IDS.practice, section: "clinact_practice" },
  { id: CLINACT_SECTION_IDS.evolution, section: "clinact_evolution" },
  { id: CLINACT_SECTION_IDS.founder, section: "clinact_founder" },
  { id: CLINACT_SECTION_IDS.freeCases, section: "clinact_free_cases" },
  { id: CLINACT_SECTION_IDS.pricing, section: "clinact_pricing" },
];
