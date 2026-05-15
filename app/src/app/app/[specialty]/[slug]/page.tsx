import { createAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PlainContentRenderer } from "@/components/content/plain-content-renderer";
import { TextLessonRenderer } from "@/components/content/text-lesson-renderer";
import { QuizRenderer } from "@/components/content/quiz-renderer";
import { FlashcardRenderer } from "@/components/content/flashcard-renderer";
import { MemorecardsRenderer } from "@/components/content/memorecards-renderer";
import { BlurbNavHubRenderer } from "@/components/content/blurb-nav-hub-renderer";
import { PageTracker } from "@/components/content/page-tracker";
import { notFound } from "next/navigation";

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ specialty: string; slug: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { slug } = await params;
  const { s } = await searchParams;
  const admin = createAdminClient();

  const { data: page } = await admin
    .from("pages")
    .select("id, title, type, slug, track_id, content_module_id")
    .eq("slug", slug)
    .single();

  if (!page) notFound();

  const selectedLessonId = s ? parseInt(s, 10) : undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageTracker pageId={page.id} />
      <Breadcrumbs className="mb-6" />

      <header className="mb-8">
        <h1 className="text-3xl font-bold leading-tight">{page.title}</h1>
      </header>

      <PageBody
        page={page as { id: number; type: string; track_id: number | null; content_module_id: number | null }}
        selectedLessonId={selectedLessonId}
      />
    </div>
  );
}

const FLASHCARDS_TRACK_ID = 3;
const MEDHELP_60D_MODULE_ID = 1;

function PageBody({
  page,
  selectedLessonId,
}: {
  page: { id: number; type: string; track_id: number | null; content_module_id: number | null };
  selectedLessonId?: number;
}) {
  switch (page.type) {
    case "plain-content":
      return <PlainContentRenderer pageId={page.id} />;
    case "text-lesson":
    case "audio-lesson":
      return <TextLessonRenderer pageId={page.id} selectedLessonId={selectedLessonId} />;
    case "h5p-quiz":
      if (page.track_id === FLASHCARDS_TRACK_ID) return <FlashcardRenderer pageId={page.id} />;
      if (page.content_module_id === MEDHELP_60D_MODULE_ID) return <MemorecardsRenderer pageId={page.id} />;
      return <QuizRenderer pageId={page.id} />;
    case "blurb-nav-hub":
      return <BlurbNavHubRenderer pageId={page.id} />;
    default:
      return <p className="text-muted-foreground">Conteúdo em preparação.</p>;
  }
}
