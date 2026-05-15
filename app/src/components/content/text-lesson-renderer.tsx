import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { LessonSidebar } from "./lesson-sidebar";
import { AudioPlayer } from "./audio-player";
import { LessonCompleteButton } from "./lesson-complete-button";

const INLINE_PURPLE_RE = /style="[^"]*color\s*:\s*#b046e9[^"]*"/gi;

// Bloco title is a colored span followed by <br/>:
//   Case A: <span style="color:#7e04bf;">Bloco N – Title</span><br />  (span closes before br)
//   Case B: <span style="color:#000000;">Bloco N – Title<br />body</span>  (br inside span)
const BLOCO_A_RE = /<span[^>]*>\s*(Bloco\s+\d+\s*[–—-][^<]{1,120}?)\s*<\/span>\s*<br\s*\/?>/gi;
const BLOCO_B_RE = /<span[^>]*>\s*(Bloco\s+\d+\s*[–—-][^<]{1,120}?)\s*<br\s*\/?>/gi;

// Standalone brand header that appears as its own <p> before Bloco 1:
// <p><span color=purple><strong>MedVoice – A Clínica Fala</strong><span fw=400><br/></span><span fw=400>MedHelpSpace Revalida</span></span></p>
const MV_STANDALONE_RE =
  /<p[^>]*>\s*<span[^>]*>\s*<strong[^>]*>(MedVoice[^<]*?)<\/strong>(?:<span[^>]*>\s*(?:<br\s*\/?>)?\s*<\/span>)*\s*<span[^>]*>(MedHelpSpace\s+Revalida)<\/span>\s*<\/span>\s*<\/p>/gi;

// The same info appears again as a sentence inside Bloco 1 — just delete it (standalone already shows it).
const MV_INLINE_RE =
  /Você\s+está\s+ouvindo\s+o\s+MedVoice[^<]*?Fala,\s*uma\s+experiência\s+do\s+(?:<a[^>]*>)?MedHelpSpace\s+Revalida(?:<\/a>)?[.!]?\s*/gi;

// Remove &nbsp;-only paragraphs that WP inserts as spacers after the brand header
const NBSP_P_RE = /<p[^>]*>\s*(?:&nbsp;| )\s*<\/p>/gi;

// Strip full-paragraph <strong> wrapper -- WP/Divi artifact in MedVoice transcripts
// Only matches when <strong> wraps the entire paragraph content (no text outside it)
const PARA_BOLD_RE = /(<p(?:\s[^>]*)?>)\s*<strong(?:\s[^>]*)?>([\s\S]*?)<\/strong>\s*(<\/p>)/gi;

function processHtml(html: string): string {
  let result = html
    .replace(INLINE_PURPLE_RE, 'class="prose-brand-color"')
    // Format the standalone brand header paragraph at the top of each lesson
    .replace(
      MV_STANDALONE_RE,
      (_m, title, sub) =>
        `<div class="mv-intro-block"><span class="mv-intro-title">${title.trim()}</span><span class="mv-intro-sub">${sub.trim()}</span></div>`,
    )
    // Delete the duplicate sentence buried inside Bloco 1 body content
    .replace(MV_INLINE_RE, "")
    // Remove &nbsp; spacer paragraphs
    .replace(NBSP_P_RE, "")
    // Use <div> not <span> so the browser properly closes any enclosing <p> (prevents overlap)
    .replace(BLOCO_A_RE, (_m, title) => `<div class="bloco-header">${title.trim()}</div>`)
    .replace(BLOCO_B_RE, (_m, title) => `<div class="bloco-header">${title.trim()}</div>`)
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
}: {
  pageId: number;
  selectedLessonId?: number;
  isTranscript?: boolean;
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

  const entries = lessons.map((l) => ({ id: l.id, title: l.title }));

  const activeIdx = selectedLessonId
    ? Math.max(0, lessons.findIndex((l) => l.id === selectedLessonId))
    : 0;
  const activeLesson = lessons[activeIdx];
  const prevLesson = activeIdx > 0 ? lessons[activeIdx - 1] : null;
  const nextLesson = activeIdx < lessons.length - 1 ? lessons[activeIdx + 1] : null;

  return (
    <div className="flex gap-8 lg:gap-10">
      <LessonSidebar entries={entries} activeId={activeLesson.id} pageId={pageId} />

      <div className="flex-1 min-w-0">
        {/* Section title */}
        <h2 className="text-xl font-bold mb-4 pb-2 border-b-2 border-brand text-foreground">
          {activeLesson.title}
        </h2>

        {/* Audio player */}
        {activeLesson.audio_url && (
          <AudioPlayer src={activeLesson.audio_url} title="MedVoice · Áudio" lessonId={activeLesson.id} />
        )}

        {/* Transcript */}
        {activeLesson.body_html ? (
          activeLesson.audio_url ? (
            /* Has audio: collapse transcript behind a toggle */
            <details className="transcript-toggle">
              <summary>Transcrição do áudio</summary>
              <div className="transcript-body">
                <div
                  className="prose-content prose-transcript"
                  dangerouslySetInnerHTML={{ __html: processHtml(activeLesson.body_html) }}
                />
              </div>
            </details>
          ) : (
            /* No audio yet (or non-transcript page): show content directly */
            <div
              className={`prose-content${isTranscript ? " prose-transcript" : ""}`}
              dangerouslySetInnerHTML={{ __html: processHtml(activeLesson.body_html) }}
            />
          )
        ) : (
          <p className="text-muted-foreground text-sm italic">Conteúdo em preparação.</p>
        )}

        {/* Complete button — text-only sections only (audio sections complete via 95% playback) */}
        {!activeLesson.audio_url && (
          <div className="mt-8 flex justify-end">
            <LessonCompleteButton lessonId={activeLesson.id} pageId={pageId} />
          </div>
        )}

        {/* Prev / Next navigation */}
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

          {nextLesson ? (
            <Link
              href={`?s=${nextLesson.id}`}
              scroll={false}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-w-0 max-w-[42%] justify-end"
            >
              <span className="truncate">{nextLesson.title}</span>
              <span className="text-brand shrink-0">→</span>
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">Concluído ✓</span>
          )}
        </div>
      </div>
    </div>
  );
}
