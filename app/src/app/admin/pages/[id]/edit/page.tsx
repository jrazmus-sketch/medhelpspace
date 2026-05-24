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
  const isHub = page.type === "blurb-nav-hub";

  const [
    { data: specialties },
    { data: tracks },
    { data: modules },
    lessonsRes,
    questionsRes,
    cardsRes,
    navItemsRes,
  ] = await Promise.all([
    admin.from("specialties").select("id, name, slug").order("display_order"),
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
    isHub
      ? admin
          .from("nav_items")
          .select(
            "id, position, label, target_page_id, group_label, icon, layout, target_page:pages!target_page_id(title, slug, type)",
          )
          .eq("source_page_id", pageId)
          .order("position")
      : Promise.resolve({ data: [] }),
  ]);

  // Flatten the target_page join so the client receives a plain shape.
  const navItems: NavItemRow[] = ((navItemsRes.data ?? []) as unknown as Array<{
    id: number;
    position: number;
    label: string | null;
    target_page_id: number | null;
    group_label: string | null;
    icon: string | null;
    layout: string | null;
    target_page: { title: string; slug: string; type: string } | null;
  }>).map((r) => ({
    id: r.id,
    position: r.position,
    label: r.label,
    target_page_id: r.target_page_id,
    group_label: r.group_label,
    icon: r.icon,
    layout: r.layout,
    target_title: r.target_page?.title ?? null,
    target_slug: r.target_page?.slug ?? null,
    target_type: r.target_page?.type ?? null,
  }));

  return (
    <PageEditClient
      page={page as PageRow}
      specialties={(specialties ?? []) as SpecialtyOption[]}
      tracks={(tracks ?? []) as TrackOption[]}
      modules={(modules ?? []) as ModuleOption[]}
      lessons={(lessonsRes.data ?? []) as LessonRow[]}
      quizQuestions={(questionsRes.data ?? []) as QuizQuestionRow[]}
      flashcards={(cardsRes.data ?? []) as FlashcardRow[]}
      navItems={navItems}
      isQuiz={isQuiz}
      isFlashcards={isFlashcards}
      isHub={isHub}
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

export type SpecialtyOption = { id: number; name: string; slug: string };
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

export type NavItemRow = {
  id: number;
  position: number;
  label: string | null;
  target_page_id: number | null;
  group_label: string | null;
  icon: string | null;
  layout: string | null;
  // Joined preview fields from pages table (null when target_page_id is null)
  target_title: string | null;
  target_slug: string | null;
  target_type: string | null;
};
