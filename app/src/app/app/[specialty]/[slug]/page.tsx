import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveMembership } from "@/lib/membership-gate";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { PlainContentRenderer } from "@/components/content/plain-content-renderer";
import { TextLessonRenderer } from "@/components/content/text-lesson-renderer";
import { QuizRenderer } from "@/components/content/quiz-renderer";
import { FlashcardRenderer } from "@/components/content/flashcard-renderer";
import { MemorecardsRenderer } from "@/components/content/memorecards-renderer";
import { BlurbNavHubRenderer } from "@/components/content/blurb-nav-hub-renderer";
import { PageTracker } from "@/components/content/page-tracker";
import { SpecialtyIcon } from "@/components/content/specialty-icon";
import { TypeChip } from "@/components/content/type-chip";
import { EditableText } from "@/components/admin/editable-text";
import { buildCrumbsForPage, findSpecialtyHub, type Crumb } from "@/lib/breadcrumbs";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ specialty: string; slug: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { slug, specialty } = await params;
  const { s } = await searchParams;
  const admin = createAdminClient();

  const { data: page } = await admin
    .from("pages")
    .select("id, title, type, slug, view, track_id, specialty_id, content_module_id")
    .eq("slug", slug)
    .single();

  if (!page) notFound();

  await requireActiveMembership(page.content_module_id);

  // Specialty lookup — use the URL slug (matches what the user is navigating).
  const { data: specRow } = await admin
    .from("specialties")
    .select("slug, name")
    .eq("slug", specialty)
    .maybeSingle();
  const specialtyForCrumbs = specRow ?? null;

  // The current page IS the per-specialty hub for its type when it's either a
  // blurb-nav-hub (with a view) or a track page (track_id set) under a specialty.
  const isSpecialtyTypeHub =
    page.specialty_id != null &&
    ((page.type === "blurb-nav-hub" && page.view != null) || page.track_id != null);

  // Otherwise — for a leaf topic — look up the matching (specialty, type) hub
  // so the breadcrumb's specialty crumb deep-links into the right view.
  let specialtyHubSlug: string | null = null;
  if (!isSpecialtyTypeHub && page.specialty_id != null) {
    if (page.view != null) {
      const hub = await findSpecialtyHub({
        specialty_id: page.specialty_id,
        view: page.view,
      });
      specialtyHubSlug = hub?.slug ?? null;
    } else if (page.track_id != null) {
      const hub = await findSpecialtyHub({
        specialty_id: page.specialty_id,
        track_id: page.track_id,
      });
      specialtyHubSlug = hub?.slug ?? null;
    }
  }

  const crumbs: Crumb[] = buildCrumbsForPage({
    page,
    specialty: specialtyForCrumbs,
    specialtyHubSlug: isSpecialtyTypeHub ? null : specialtyHubSlug,
  });

  // Fallback target for the "Voltar" button on cold loads — the IA parent.
  const voltarFallback = crumbs.length >= 2 ? crumbs[crumbs.length - 2].href ?? "/app" : "/app";

  const selectedLessonId = s ? parseInt(s, 10) : undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageTracker pageId={page.id} />

      <div className="mb-2 flex items-center justify-between gap-3">
        <VoltarButton fallbackHref={voltarFallback} />
      </div>
      <Breadcrumbs className="mb-6" crumbs={crumbs} />

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SpecialtyIcon specialtySlug={specialty} size={38} />
          <h1 className="text-3xl font-bold leading-tight">
            <EditableText
              variant="plain"
              table="pages"
              id={page.id}
              field="title"
              value={page.title}
            />
          </h1>
          <TypeChip page={page} />
        </div>
        {specialtyForCrumbs && !isSpecialtyAllContentTarget(page, specialtyForCrumbs.slug) && (
          <div className="mt-3">
            <Link
              href={`/app/${specialtyForCrumbs.slug}`}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Ver toda {specialtyForCrumbs.name} →
            </Link>
          </div>
        )}
        {isSimulado(page) && (
          <p className="mt-4 text-sm italic text-muted-foreground">
            Questões inéditas no padrão da banca
          </p>
        )}
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
const MEDVOICE_TRACK_ID = 1;
const AUDIOCARDS_TRACK_ID = 2;

function isSimulado(page: { slug: string; type: string }) {
  return page.type === "h5p-quiz" && page.slug.endsWith("-simulados");
}

// Suppress the "Ver toda X" link on the few pages where it would be redundant —
// in practice we'd hide it on the all-content specialty hub itself, but that
// page is served by [specialty]/page.tsx, not here. Kept for future-proofing.
function isSpecialtyAllContentTarget(page: { slug: string }, specialtySlug: string) {
  return page.slug === specialtySlug;
}

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
    case "audio-lesson": {
      const isTranscript =
        page.track_id === MEDVOICE_TRACK_ID || page.track_id === AUDIOCARDS_TRACK_ID;
      return (
        <TextLessonRenderer
          pageId={page.id}
          selectedLessonId={selectedLessonId}
          isTranscript={isTranscript}
        />
      );
    }
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
