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
// E: whole paragraph is <p><span><strong>Bloco N – Title</strong></span></p>
//    (pneumologia / psiquiatria / reumatologia / saude-coletiva variants — bloco
//    headers live in their own paragraph rather than inline at the top of body content)
const BLOCO_E_RE =
  /<p[^>]*>\s*<span[^>]*>\s*<strong[^>]*>\s*(Bloco\s+\d+\s*[–—-][^<]{1,120}?)\s*<\/strong>\s*<\/span>\s*<\/p>/gi;
// F: bare-text Bloco header at the start of a paragraph — applied AFTER PARA_BOLD_RE
//    strips the surrounding <strong>. Used by 22 cirurgia-geral sections that have
//    no span wrapper around the bloco title:
//      <p>Bloco N – Title<br/>body...</p>  -->  <div class="bloco-header">…</div><p>body…</p>
const BLOCO_BARE_RE =
  /(<p(?:\s[^>]*)?>)\s*(Bloco\s+\d+\s*[–—-][^<]{1,120}?)\s*<br\s*\/?>/gi;

// Standalone brand header — two WP structures:
//   Original: <p><span><strong>MedVoice</strong><span fw=400><br/></span><span fw=400>MedHelpSpace Revalida</span></span></p>
//   Alt:      <p><span><strong>MedVoice<br/></strong>MedHelpSpace Revalida</span></p>  (br inside strong, subtitle is bare text)
// Subtitle authors used "MedHelpSpace Revalida", "MedHelpSpace_Revalida", and
// "MedHelpSpaceRevalida" (no separator) inconsistently across the 162 MedVoice
// lessons. Normalize all three to the spaced form before any structure regex
// runs, so the brand-header / inline-deletion patterns only need to know one spelling.
const BRAND_NORMALIZE_RE = /MedHelpSpace_?Revalida/g;
// Zero-width chars + empty <strong></strong> that WP/Divi sometimes injects at
// the start of the brand-header paragraph (seen on endocrinologia).
// Zero-width space (U+200B), zero-width non-joiner (U+200C), zero-width joiner
// (U+200D), and zero-width no-break space / BOM (U+FEFF).
const ZWSP_RE = /[​‌‍﻿]/g;
const EMPTY_STRONG_RE = /<strong[^>]*>\s*<\/strong>/gi;

const MV_STANDALONE_RE =
  /<p[^>]*>\s*<span[^>]*>\s*<strong[^>]*>(MedVoice[^<]*?)<\/strong>(?:<span[^>]*>\s*(?:<br\s*\/?>)?\s*<\/span>)*\s*(?:<em[^>]*>\s*)?<span[^>]*>(MedHelpSpace\s+Revalida)<\/span>(?:\s*<\/em>)?\s*<\/span>\s*<\/p>/gi;
// Alt: <p><span><strong>MedVoice<br/></strong>(<em>)?MedHelpSpace Revalida(</em>)?</span></p>
// Pneumologia/psiquiatria/etc. wrap the bare-text subtitle in <em>.
const MV_STANDALONE_ALT_RE =
  /<p[^>]*>\s*<span[^>]*>\s*<strong[^>]*>(MedVoice[^<]*?)<br\s*\/?><\/strong>\s*(?:<em[^>]*>\s*)?(MedHelpSpace\s+Revalida)(?:\s*<\/em>)?\s*<\/span>\s*<\/p>/gi;
// Separate-spans variant (ginecologia):
//   <p><strong><span>MedVoice<br/></span></strong><span><em>MedHelpSpace Revalida</em></span></p>
const MV_STANDALONE_SEP_RE =
  /<p[^>]*>\s*<strong[^>]*>\s*<span[^>]*>(MedVoice[^<]*?)<br\s*\/?>\s*<\/span>\s*<\/strong>\s*<span[^>]*>\s*(?:<em[^>]*>\s*)?(MedHelpSpace\s+Revalida)(?:\s*<\/em>)?\s*<\/span>\s*<\/p>/gi;
// Both lines inside the same <strong> (pediatria variant):
//   <p><span><strong>MedVoice<br/>MedHelpSpace Revalida</strong></span></p>
const MV_STANDALONE_BOLD_BOTH_RE =
  /<p[^>]*>\s*<span[^>]*>\s*<strong[^>]*>(MedVoice[^<]*?)<br\s*\/?>\s*(MedHelpSpace\s+Revalida)\s*<\/strong>\s*<\/span>\s*<\/p>/gi;
// Bare variant — no enclosing color span (22 cirurgia-geral sections):
//   <p><strong>MedVoice<br></strong><em>MedHelpSpace Revalida</em></p>
const MV_STANDALONE_BARE_RE =
  /<p[^>]*>\s*<strong[^>]*>(MedVoice[^<]*?)<br\s*\/?>\s*<\/strong>\s*(?:<em[^>]*>\s*)?(MedHelpSpace\s+Revalida)(?:\s*<\/em>)?\s*<\/p>/gi;
// Sibling-spans variant (neurologia / pneumologia): title and subtitle live in
// two sibling spans inside one <p>, joined by a literal <br/>. The <em> may
// wrap either inside or outside the subtitle span — both forms are allowed.
//   <p><span><strong>MedVoice</strong></span><br/><span><em>MedHelpSpace Revalida</em></span></p>
//   <p><span><strong>MedVoice</strong></span><br/><em><span>MedHelpSpace Revalida</span></em></p>
const MV_STANDALONE_SIBLINGS_RE =
  /<p[^>]*>\s*<span[^>]*>\s*<strong[^>]*>(MedVoice[^<]*?)<\/strong>\s*<\/span>\s*<br\s*\/?>\s*(?:<em[^>]*>\s*)?<span[^>]*>\s*(?:<em[^>]*>\s*)?(MedHelpSpace\s+Revalida)(?:\s*<\/em>)?\s*<\/span>(?:\s*<\/em>)?\s*<\/p>/gi;
// Trauma De Tórax (cirurgia-geral pos 21): subtitle text is split across three
// <em>/<strong> runs. Collapse the split into the contiguous spelling so the
// bare-brand regex above can match it.
const FRAGMENTED_BRAND_RE =
  /MedHelpSpace\s*<\/em>\s*<strong[^>]*>\s*<em[^>]*>\s*<\/em>\s*<\/strong>\s*<em[^>]*>\s*Revalida/gi;

// The same info appears again as a sentence inside Bloco 1 — just delete it (standalone already shows it).
const MV_INLINE_RE =
  /Você\s+está\s+ouvindo\s+o\s+MedVoice[^<]*?Fala,\s*uma\s+experiência\s+do\s+(?:<a[^>]*>)?MedHelpSpace\s+Revalida(?:<\/a>)?[.!]?\s*/gi;

// Remove &nbsp;-only paragraphs that WP inserts as spacers after the brand header
const NBSP_P_RE = /<p[^>]*>\s*(?:&nbsp;| )\s*<\/p>/gi;

// Strip full-paragraph <strong> wrapper -- WP/Divi artifact in MedVoice transcripts.
// Two nesting orders appear across the 162 lessons; both unwrap to the same plain paragraph:
//   Direct      : <p><strong>...</strong></p>                                       (59 lessons)
//   Span-wrapped: <p><span style="color:#000000"><strong>...</strong></span></p>    (103 lessons)
// The span-wrapped variant is why "Você está ouvindo..." stays bold on most MedVoice pages.
const PARA_BOLD_RE = /(<p(?:\s[^>]*)?>)\s*<strong(?:\s[^>]*)?>([\s\S]*?)<\/strong>\s*(<\/p>)/gi;
const PARA_SPAN_BOLD_RE =
  /(<p(?:\s[^>]*)?>)\s*<span(?:\s[^>]*)?>\s*<strong(?:\s[^>]*)?>([\s\S]*?)<\/strong>\s*<\/span>\s*(<\/p>)/gi;

function processHtml(html: string): string {
  const INTRO_REPLACEMENT = (_m: string, title: string, sub: string) =>
    `<div class="mv-intro-block"><span class="mv-intro-title">${title.trim()}</span><span class="mv-intro-sub">${sub.trim()}</span></div>`;
  const BLOCO_REPLACEMENT = (_m: string, title: string) =>
    `<div class="bloco-header">${title.trim()}</div>`;

  let result = html
    .replace(INLINE_PURPLE_RE, 'class="prose-brand-color"')
    // Pre-normalize before any structure regex runs:
    //   - "MedHelpSpace_Revalida" and "MedHelpSpaceRevalida" -> "MedHelpSpace Revalida"
    //   - strip zero-width chars + empty <strong></strong> WP injects (endocrinologia)
    .replace(ZWSP_RE, "")
    .replace(EMPTY_STRONG_RE, "")
    // Collapse split brand (Trauma De Tórax) before BRAND_NORMALIZE_RE so it sees
    // contiguous text. Then normalize underscore/no-separator spellings.
    .replace(FRAGMENTED_BRAND_RE, "MedHelpSpace Revalida")
    .replace(BRAND_NORMALIZE_RE, "MedHelpSpace Revalida")
    // Format the standalone brand header (six WP authoring variants observed across the 162 lessons)
    .replace(MV_STANDALONE_RE, INTRO_REPLACEMENT)
    .replace(MV_STANDALONE_ALT_RE, INTRO_REPLACEMENT)
    .replace(MV_STANDALONE_SEP_RE, INTRO_REPLACEMENT)
    .replace(MV_STANDALONE_BOLD_BOTH_RE, INTRO_REPLACEMENT)
    .replace(MV_STANDALONE_BARE_RE, INTRO_REPLACEMENT)
    .replace(MV_STANDALONE_SIBLINGS_RE, INTRO_REPLACEMENT)
    // Delete the duplicate sentence buried inside Bloco 1 body content
    .replace(MV_INLINE_RE, "")
    // Remove &nbsp; spacer paragraphs
    .replace(NBSP_P_RE, "")
    // Bloco headers — most-specific patterns first.
    // E (full standalone paragraph) must run before PARA_BOLD_RE strips its <strong>,
    // otherwise the bloco text remains but loses its chip styling.
    .replace(BLOCO_E_RE, BLOCO_REPLACEMENT)
    .replace(BLOCO_C_RE, BLOCO_REPLACEMENT)
    .replace(BLOCO_D_RE, BLOCO_REPLACEMENT)
    .replace(BLOCO_A_RE, BLOCO_REPLACEMENT)
    .replace(BLOCO_B_RE, BLOCO_REPLACEMENT)
    // Strip full-paragraph bold -- two nesting orders (see regex comments above).
    // Run span-wrapped first; if it matches, no <strong> remains for PARA_BOLD_RE.
    .replace(PARA_SPAN_BOLD_RE, "$1$2$3")
    .replace(PARA_BOLD_RE, "$1$2$3")
    // Bare bloco header — must run AFTER strong-stripping, since these lessons
    // hide the bloco text inside the now-stripped <strong> with no span wrapper.
    .replace(BLOCO_BARE_RE, (_m: string, openP: string, title: string) =>
      `<div class="bloco-header">${title.trim()}</div>${openP}`,
    );

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
