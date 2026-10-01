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
  { id: "precos", section: "pricing" },
  { id: "faq", section: "faq" },
];

/** GA4 event name a section view produces (kept here so tests can pin the names). */
export function sectionViewEventName(section: string): string {
  return `view_${section}_section`;
}

export const SCROLL_MILESTONES = [25, 50, 75, 90] as const;
