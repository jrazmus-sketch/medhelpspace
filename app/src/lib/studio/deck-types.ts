// Shared types for the Instagram Studio deck generator (flashcards + quiz).
//
// Kept in a plain (non-"use server") module so both the client component and the
// server action can import them — a "use server" file may only export async
// functions (see feedback_use_server_only_async_exports), so types can't live in
// the action file itself.

export type DeckSource = "flashcard" | "quiz";

// One selectable "subject" in the deck picker, source-agnostic:
// - flashcards: `key` = deck page id, `title` = deck title, `subtitle` = specialty.
// - quiz:       `key` = specialty id, `title` = specialty, `subtitle` = "Questões".
// `count` = how many items are available (caps the per-subject stepper).
export type DeckSubject = {
  key: number;
  title: string;
  subtitle: string | null;
  count: number;
};

// One flashcard pulled for a deck: `prompt` = front, `answer` = back.
export type DeckCard = {
  id: number;
  prompt: string;
  answer: string;
  tip: string | null;
  imageUrl: string | null;
  specialtyName: string | null;
  specialtySlug: string | null;
  subjectTitle: string;
};

// One quiz question pulled for a deck. `stem`/`options`/`explanation` are already
// plain text (HTML stripped server-side). `source` = the exam reference lifted
// from the question's leading <h3> (e.g. "Revalida 2024.1"), if present.
export type QuizDeckCard = {
  id: number;
  source: string | null;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  specialtyName: string | null;
  specialtySlug: string | null;
  subjectTitle: string;
};

// One item in a subject's browse-and-pick list (the specific-question picker).
// `label` is already plain text (flashcard prompt / quiz stem), truncated for
// display; `source` is the quiz exam reference (null for flashcards); `hasImage`
// flags items that lean on an image (shown so the picker can warn).
export type DeckItemPreview = {
  id: number;
  label: string;
  source: string | null;
  hasImage: boolean;
};

// How many items to pull from a given subject (`key` per DeckSubject above).
// `pickedIds`, when present and non-empty, puts the subject in MANUAL mode: the
// build uses exactly those item ids (order preserved), ignoring `count`,
// `shuffle` and `skipImageCards` for that subject. Absent/empty = auto sampling.
export type DeckSelection = { key: number; count: number; pickedIds?: number[] };

export type DeckBuildOptions = {
  // Random sample from each subject vs. the first N in stable order.
  shuffle: boolean;
  // Round-robin across the selected subjects vs. grouped subject-by-subject.
  interleave: boolean;
  // Drop items that carry an image (faces are text-only, so an image-dependent
  // item would render nonsensically).
  skipImageCards: boolean;
  // Item ids to exclude up front (cross-run dedupe — "don't repeat what I've
  // already exported"). Empty = no exclusion.
  excludeIds: number[];
  // Hard cap on total items returned (the "~50 at a time" ceiling).
  cap: number;
};
