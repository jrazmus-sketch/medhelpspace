import {
  FileText,
  BookOpen,
  Volume2,
  HelpCircle,
  Layers,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";

// The Flashcards template reuses the `h5p-quiz` page type but always sets this
// track_id. Keep in sync with FLASHCARDS_TRACK_ID in the page editor.
export const FLASHCARDS_TRACK_ID = 3;

// Tile keys are decoupled from DB types: "quiz" and "flashcards" both map to
// the DB type "h5p-quiz" (differing only by track_id), and "hub" is the
// friendly name for "blurb-nav-hub". These keys index the i18n catalog at
// `pageNew.types.<key>`.
export type TileKey =
  | "plain-content"
  | "text-lesson"
  | "audio-lesson"
  | "quiz"
  | "flashcards"
  | "hub";

export type DbPageType =
  | "plain-content"
  | "text-lesson"
  | "audio-lesson"
  | "h5p-quiz"
  | "blurb-nav-hub";

export type PageTemplate = {
  key: TileKey;
  dbType: DbPageType;
  icon: LucideIcon;
  /** Default `pages.view`; "" means leave null. User can override. */
  defaultView: string;
  /** Force this track_id on creation (flashcards). null = leave unset. */
  forceTrackId: number | null;
};

// Single source of truth for the page-creation templates. Consumed by the
// New Page wizard (`/admin/pages/new`) and the inline create flow in the
// PagePicker so the two can never drift.
export const PAGE_TEMPLATES: PageTemplate[] = [
  { key: "plain-content", dbType: "plain-content", icon: FileText,   defaultView: "",           forceTrackId: null },
  { key: "text-lesson",   dbType: "text-lesson",   icon: BookOpen,   defaultView: "",           forceTrackId: null },
  { key: "audio-lesson",  dbType: "audio-lesson",  icon: Volume2,    defaultView: "medvoice",   forceTrackId: null },
  { key: "quiz",          dbType: "h5p-quiz",      icon: HelpCircle, defaultView: "",           forceTrackId: null },
  { key: "flashcards",    dbType: "h5p-quiz",      icon: Layers,     defaultView: "flashcards", forceTrackId: FLASHCARDS_TRACK_ID },
  { key: "hub",           dbType: "blurb-nav-hub", icon: LayoutGrid, defaultView: "hub",        forceTrackId: null },
];

export function templateByKey(key: TileKey): PageTemplate {
  return PAGE_TEMPLATES.find((t) => t.key === key) ?? PAGE_TEMPLATES[0];
}

/**
 * Best-guess template for a new card created inside a hub, inferred from the
 * hub's own `view`: a *-simulados hub holds quiz pages, *-resumos / *-formula
 * hold prose, medvoice / audiocards hold audio lessons, etc. Falls back to
 * plain-content. The editor can always override the suggestion.
 */
export function defaultTemplateForHubView(view: string | null | undefined): TileKey {
  switch (view) {
    case "simulados":
      return "quiz";
    case "resumos":
    case "formula":
      return "plain-content";
    case "medvoice":
    case "audiocards":
      return "audio-lesson";
    case "flashcards":
      return "flashcards";
    case "memorecards":
      return "quiz";
    default:
      return "plain-content";
  }
}
