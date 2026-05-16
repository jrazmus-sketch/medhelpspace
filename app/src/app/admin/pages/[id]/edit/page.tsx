import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageEditClient } from "./edit-client";

export const metadata = { title: "Editar página" };

const FLASHCARDS_TRACK_ID = 3;

export default async function PageEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pageId = Number(id);
  if (isNaN(pageId)) notFound();

  const admin = createAdminClient();

  const { data: page } = await admin
    .from("pages")
    .select("id, slug, title, type, status, view, specialty_id, track_id, content_module_id, notes")
    .eq("id", pageId)
    .single();
  if (!page) notFound();

  const isQuiz = page.type === "h5p-quiz" && page.track_id !== FLASHCARDS_TRACK_ID;
  const isFlashcards = page.type === "h5p-quiz" && page.track_id === FLASHCARDS_TRACK_ID;

  const [{ data: specialties }, { data: tracks }, { data: modules }, lessonsRes, questionsRes, cardsRes] =
    await Promise.all([
      admin.from("specialties").select("id, name").order("display_order"),
      admin.from("tracks").select("id, name").order("id"),
      admin.from("content_modules").select("id, name").order("id"),
      admin
        .from("lessons")
        .select("id, position, title, body_html, audio_url")
        .eq("page_id", pageId)
        .order("position"),
      isQuiz
        ? admin
            .from("quiz_questions")
            .select("id, position, question, answers, media_url")
            .eq("page_id", pageId)
            .order("position")
        : Promise.resolve({ data: [] }),
      isFlashcards
        ? admin
            .from("flashcard_items")
            .select("id, group_position, group_label, position, text, answer, image_url, tip")
            .eq("page_id", pageId)
            .order("group_position")
            .order("position")
        : Promise.resolve({ data: [] }),
    ]);

  return (
    <PageEditClient
      page={page as PageRow}
      specialties={(specialties ?? []) as SpecialtyOption[]}
      tracks={(tracks ?? []) as TrackOption[]}
      modules={(modules ?? []) as ModuleOption[]}
      lessons={(lessonsRes.data ?? []) as LessonRow[]}
      quizQuestions={(questionsRes.data ?? []) as QuizQuestionRow[]}
      flashcards={(cardsRes.data ?? []) as FlashcardRow[]}
      isQuiz={isQuiz}
      isFlashcards={isFlashcards}
    />
  );
}

// ── Local types (server → client) ─────────────────────────────────────────────

export type PageRow = {
  id: number;
  slug: string;
  title: string;
  type: string;
  status: string;
  view: string | null;
  specialty_id: number | null;
  track_id: number | null;
  content_module_id: number | null;
  notes: string | null;
};

export type SpecialtyOption = { id: number; name: string };
export type TrackOption = { id: number; name: string };
export type ModuleOption = { id: number; name: string };

export type LessonRow = {
  id: number;
  position: number;
  title: string;
  body_html: string | null;
  audio_url: string | null;
};

export type QuizAnswerRow = { text: string; correct: boolean; feedback: string };

export type QuizQuestionRow = {
  id: number;
  position: number;
  question: string;
  answers: QuizAnswerRow[];
  media_url: string | null;
};

export type FlashcardRow = {
  id: number;
  group_position: number;
  group_label: string | null;
  position: number;
  text: string;
  answer: string;
  image_url: string | null;
  tip: string | null;
};
