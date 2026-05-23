import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { getPageSiblings } from "@/lib/page-siblings";
import { safe } from "@/lib/sanitize";
import { LessonSidebar } from "./lesson-sidebar";
import { AudioPlayer } from "./audio-player";
import { LessonCompleteButton } from "./lesson-complete-button";
import { EditableText } from "@/components/admin/editable-text";

const INLINE_PURPLE_RE = /style="[^"]*color\s*:\s*#b046e9[^"]*"/gi;

// Bloco title variants — WP/Divi produces several structures depending on how the editor saved it:
//   A: <span>Bloco N – Title</span><br/>           (span closes, br follows directly)
//   B: <span>Bloco N – Title<br/>body</span>       (br inside open span)
//   C: <span><strong>Title</strong></span><br/>    (strong wraps title inside span)
//   D: <span>Title</span><span><br/>               (br is in the next sibling span)
const BLOCO_A_RE = /<span[^>]*>\s*(Bloco\s+\d+\s*[–—-][^<]{1,120}?)\s*<\/span>\s*<br\s*\/?>/gi;
const BLOCO_B_RE = /<span[^>]*>\s*(Bloco\s+\d+\s*[–—-][^<]{1,120}?)\s*<br\s*\/?>/gi;
const BLOCO_C_RE = /<span[^>]*>\s*<strong[^>]*>\s*(Bloco\s+\d+\s*[–—-][^<]{1,120}?)\s*<\/strong>\s*<\/span>\s*<br\s*\/?>/gi;
const BLOCO_D_RE = /<span[^>]*>\s*(Bloco\s+\d+\s*[–—-][^<]{1,120}?)\s*<\/span>\s*<span[^>]*>\s*<br\s*\/?>/gi;

// Standalone brand header — two WP structures:
//   Original: <p><span><strong>MedVoice</strong><span fw=400><br/></span><span fw=400>MedHelpSpace Revalida</span></span></p>
//   Alt:      <p><span><strong>MedVoice<br/></strong>MedHelpSpace Revalida</span></p>  (br inside strong, subtitle is bare text)
const MV_STANDALONE_RE =
  /<p[^>]*>\s*<span[^>]*>\s*<strong[^>]*>(MedVoice[^<]*?)<\/strong>(?:<span[^>]*>\s*(?:<br\s*\/?>)?\s*<\/span>)*\s*<span[^>]*>(MedHelpSpace\s+Revalida)<\/span>\s*<\/span>\s*<\/p>/gi;
const MV_STANDALONE_ALT_RE =
  /<p[^>]*>\s*<span[^>]*>\s*<strong[^>]*>(MedVoice[^<]*?)<br\s*\/?><\/strong>(MedHelpSpace\s+Revalida)<\/span>\s*<\/p>/gi;

// The same info appears again as a sentence inside Bloco 1 — just delete it (standalone already shows it).
const MV_INLINE_RE =
  /Você\s+está\s+ouvindo\s+o\s+MedVoice[^<]*?Fala,\s*uma\s+experiência\s+do\s+(?:<a[^>]*>)?MedHelpSpace\s+Revalida(?:<\/a>)?[.!]?\s*/gi;

// Remove &nbsp;-only paragraphs that WP inserts as spacers after the brand header
const NBSP_P_RE = /<p[^>]*>\s*(?:&nbsp;| )\s*<\/p>/gi;

// Strip full-paragraph <strong> wrapper -- WP/Divi artifact in MedVoice transcripts
// Only matches when <strong> wraps the entire paragraph content (no text outside it)
const PARA_BOLD_RE = /(<p(?:\s[^>]*)?>)\s*<strong(?:\s[^>]*)?>([\s\S]*?)<\/strong>\s*(<\/p>)/gi;

function processHtml(html: string): string {
  const INTRO_REPLACEMENT = (_m: string, title: string, sub: string) =>
    `<div class="mv-intro-block"><span class="mv-intro-title">${title.trim()}</span><span class="mv-intro-sub">${sub.trim()}</span></div>`;
  const BLOCO_REPLACEMENT = (_m: string, title: string) =>
    `<div class="bloco-header">${title.trim()}</div>`;

  let result = html
    .replace(INLINE_PURPLE_RE, 'class="prose-brand-color"')
    // Format the standalone brand header (both WP structures)
    .replace(MV_STANDALONE_RE, INTRO_REPLACEMENT)
    .replace(MV_STANDALONE_ALT_RE, INTRO_REPLACEMENT)
    // Delete the duplicate sentence buried inside Bloco 1 body content
    .replace(MV_INLINE_RE, "")
    // Remove &nbsp; spacer paragraphs
    .replace(NBSP_P_RE, "")
    // Bloco headers — run C and D before A/B so more-specific patterns win
    .replace(BLOCO_C_RE, BLOCO_REPLACEMENT)
    .replace(BLOCO_D_RE, BLOCO_REPLACEMENT)
    .replace(BLOCO_A_RE, BLOCO_REPLACEMENT)
    .replace(BLOCO_B_RE, BLOCO_REPLACEMENT)
    // Strip full-paragraph bold -- WP artifact where entire transcript paragraphs are in <strong>
    .replace(PARA_BOLD_RE, "$1$2$3");

  // Hoist mv-intro-block to the very top and delete any plain-text duplicate paragraphs.
  // WP HTML sometimes has a differently-structured copy of the title before the first Bloco
  // header that does not match MV_STANDALONE_RE; remove it so only the formatted version shows.
  if (result.includes('<div class="mv-intro-block">')) {
    const introRe = /<div class="mv-intro-block">[\s\S]*?<\/div>/;
    const introMatch = result.match(introRe);
    if (introMatch) {
      result = result.replace(introRe, "");
      // Remove orphaned plain paragraphs that contain only the brand header text
      result = result.replace(
        /<p[^>]*>\s*(?:<[^>]+>\s*)*MedVoice[^<]*?(?:\s*<\/[^>]+>)*\s*<\/p>/gi,
        "",
      );
      result = result.replace(
        /<p[^>]*>\s*(?:<[^>]+>\s*)*MedHelpSpace\s+Revalida(?:\s*<\/[^>]+>)*\s*<\/p>/gi,
        "",
      );
      result = introMatch[0] + result;
    }
  }

  return result;
}

export async function TextLessonRenderer({
  pageId,
  selectedLessonId,
  isTranscript = false,
  pageTitle,
  specialtySlug,
  backHref,
}: {
  pageId: number;
  selectedLessonId?: number;
  isTranscript?: boolean;
  /** Needed for the mobile player's album area. */
  pageTitle?: string;
  /** Needed for the mobile player's specialty icon + ambient color. */
  specialtySlug?: string;
  /** Back-navigation target shown in the mobile player's top chrome. */
  backHref?: string;
}) {
  const supabase = createAdminClient();
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, position, title, body_html, audio_url")
    .eq("page_id", pageId)
    .order("position");

  if (!lessons || lessons.length === 0) {
    return <p className="text-muted-foreground text-sm">Conteúdo em preparação.</p>;
  }

  // Fetch user's completed lessons + saved audio positions for this page
  let completedIds: number[] = [];
  const positionByLesson = new Map<number, number>();
  if (!USE_MOCK_DATA) {
    try {
      const userClient = await createClient();
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const lessonIds = lessons.map((l) => l.id);
        const [completionsRes, positionsRes] = await Promise.all([
          userClient
            .from("lesson_completions")
            .select("lesson_id")
            .eq("user_id", user.id)
            .eq("page_id", pageId),
          userClient
            .from("lesson_progress")
            .select("lesson_id, position_seconds")
            .eq("user_id", user.id)
            .in("lesson_id", lessonIds),
        ]);
        completedIds = (completionsRes.data ?? []).map((c) => c.lesson_id as number);
        for (const p of positionsRes.data ?? []) {
          positionByLesson.set(p.lesson_id as number, p.position_seconds as number);
        }
      }
    } catch {
      // Non-critical — sidebar starts empty, completions still record
    }
  }
  const completedSet = new Set(completedIds);

  const entries = lessons.map((l) => ({ id: l.id, title: l.title }));

  const activeIdx = selectedLessonId
    ? Math.max(0, lessons.findIndex((l) => l.id === selectedLessonId))
    : 0;
  const activeLesson = lessons[activeIdx];
  const prevLesson = activeIdx > 0 ? lessons[activeIdx - 1] : null;
  const nextLesson = activeIdx < lessons.length - 1 ? lessons[activeIdx + 1] : null;
  const isLastSection = nextLesson === null;

  // Only fetch sibling/specialty info when the user is on the last section —
  // that's the only place LessonCompleteButton uses it.
  const siblings = isLastSection
    ? await getPageSiblings(pageId)
    : { nextHref: null, nextTitle: null, specialtyHref: "/app", specialtyName: "Início" };

  return (
    <div className="flex flex-col lg:flex-row lg:gap-10">
      <LessonSidebar
        entries={entries}
        activeId={activeLesson.id}
        pageId={pageId}
        initialCompleted={completedIds}
      />

      <div className="flex-1 min-w-0">
        {/* Section title — hidden when audio is present (the player absorbs it as its track name) */}
        {!activeLesson.audio_url && (
          <h2 className="text-xl font-bold mb-4 pb-2 border-b-2 border-brand text-foreground">
            <EditableText
              variant="plain"
              table="lessons"
              id={activeLesson.id}
              field="title"
              value={activeLesson.title}
            />
          </h2>
        )}

        {/* Audio player */}
        {activeLesson.audio_url && (
          <AudioPlayer
            src={activeLesson.audio_url}
            title="MedVoice · Áudio"
            lessonId={activeLesson.id}
            initialPosition={positionByLesson.get(activeLesson.id) ?? 0}
            sectionTitle={activeLesson.title}
            sectionTitleNode={
              <EditableText
                variant="plain"
                table="lessons"
                id={activeLesson.id}
                field="title"
                value={activeLesson.title}
              />
            }
            nextHref={nextLesson ? `?s=${nextLesson.id}` : null}
            nextTitle={nextLesson?.title ?? null}
            prevHref={prevLesson ? `?s=${prevLesson.id}` : null}
            pageTitle={pageTitle}
            specialtySlug={specialtySlug}
            sections={lessons.map((l) => ({
              id: l.id,
              title: l.title,
              href: `?s=${l.id}`,
              isActive: l.id === activeLesson.id,
            }))}
            transcriptNode={activeLesson.body_html ? (
              <EditableText
                variant="rich"
                table="lessons"
                id={activeLesson.id}
                field="body_html"
                className="prose-content prose-transcript"
                html={safe(processHtml(activeLesson.body_html))}
                editHtml={activeLesson.body_html}
              />
            ) : null}
            backHref={backHref}
          />
        )}

        {/* Transcript.
            Edit-mode contentEditable seeds from the RAW body_html (editHtml)
            so processHtml's Bloco-header transforms don't get written back.

            On mobile (md:hidden) the mobile player owns the transcript via its
            "Transcrição" tab; the standalone <details> below would duplicate it,
            so hide it on mobile when audio is present. */}
        {activeLesson.body_html ? (
          activeLesson.audio_url ? (
            /* Has audio: collapse transcript behind a toggle (desktop only) */
            <details className="transcript-toggle hidden md:block">
              <summary>Transcrição do áudio</summary>
              <div className="transcript-body">
                <EditableText
                  variant="rich"
                  table="lessons"
                  id={activeLesson.id}
                  field="body_html"
                  className="prose-content prose-transcript"
                  html={safe(processHtml(activeLesson.body_html))}
                  editHtml={activeLesson.body_html}
                />
              </div>
            </details>
          ) : (
            /* No audio yet (or non-transcript page): show content directly */
            <EditableText
              variant="rich"
              table="lessons"
              id={activeLesson.id}
              field="body_html"
              className={`prose-content${isTranscript ? " prose-transcript" : ""}`}
              html={safe(processHtml(activeLesson.body_html))}
              editHtml={activeLesson.body_html}
            />
          )
        ) : (
          <p className="text-muted-foreground text-sm italic">Conteúdo em preparação.</p>
        )}

        {/* Primary action — text sections: complete (+ continue) in one gesture.
            Audio sections have no button (they complete at 95% playback); their
            forward affordance is the "next" link in the navigation row below. */}
        {!activeLesson.audio_url && (
          <div className="mt-8 flex justify-end">
            <LessonCompleteButton
              lessonId={activeLesson.id}
              pageId={pageId}
              initialDone={completedSet.has(activeLesson.id)}
              nextLessonId={nextLesson?.id ?? null}
              nextPageHref={siblings.nextHref}
              nextPageTitle={siblings.nextTitle}
              specialtyHref={siblings.specialtyHref}
              specialtyName={siblings.specialtyName}
            />
          </div>
        )}

        {/* Navigation row — prev link + section counter. Forward navigation is
            handled by the complete button (text) or the next link (audio). */}
        <div className="mt-6 pt-6 border-t border-border flex items-center justify-between gap-4">
          {prevLesson ? (
            <Link
              href={`?s=${prevLesson.id}`}
              scroll={false}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-w-0 max-w-[42%]"
            >
              <span className="text-brand shrink-0">←</span>
              <span className="truncate">{prevLesson.title}</span>
            </Link>
          ) : (
            <div />
          )}

          <span className="text-xs text-muted-foreground font-mono shrink-0 tabular-nums">
            {activeIdx + 1} / {lessons.length}
          </span>

          {activeLesson.audio_url && nextLesson ? (
            <Link
              href={`?s=${nextLesson.id}`}
              scroll={false}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-w-0 max-w-[42%] justify-end"
            >
              <span className="truncate">{nextLesson.title}</span>
              <span className="text-brand shrink-0">→</span>
            </Link>
          ) : (
            <div />
          )}
        </div>

        {/* End-of-page footer — only when the user is on the last audio section.
            (Text sections get this affordance via LessonCompleteButton instead.) */}
        {isLastSection && activeLesson.audio_url && (
          <div className="mt-4 pt-4 border-t border-border space-y-3">
            <p className="text-sm text-muted-foreground">
              Você chegou ao fim deste conteúdo.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {siblings.nextHref && (
                <Link
                  href={siblings.nextHref}
                  className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5"
                >
                  <span className="truncate">
                    Próximo tópico{siblings.nextTitle ? `: ${siblings.nextTitle}` : ""}
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              )}
              <Link
                href={siblings.specialtyHref}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-brand/40 hover:text-brand transition-colors inline-flex items-center justify-center"
              >
                ← Voltar para {siblings.specialtyName}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
