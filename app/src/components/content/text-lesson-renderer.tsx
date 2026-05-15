import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { LessonSidebar } from "./lesson-sidebar";
import { AudioPlayer } from "./audio-player";

const INLINE_PURPLE_RE = /style="[^"]*color\s*:\s*#b046e9[^"]*"/gi;

// Actual MedVoice DB structure — Bloco title is a colored span followed by <br/>:
//   Case A: <span style="color:#7e04bf;">Bloco N – Title</span><br />  (span closes before br)
//   Case B: <span style="color:#000000;">Bloco N – Title<br />body</span>  (br inside span)
const BLOCO_A_RE = /<span[^>]*>\s*(Bloco\s+\d+\s*[–—-][^<]{1,120}?)\s*<\/span>\s*<br\s*\/?>/gi;
const BLOCO_B_RE = /<span[^>]*>\s*(Bloco\s+\d+\s*[–—-][^<]{1,120}?)\s*<br\s*\/?>/gi;

// Every MedVoice transcript opens with this fixed sentence — reformat as a branded header.
// DB text: "Você está ouvindo o MedVoice – A Clínica Fala, uma experiência do MedHelpSpace Revalida."
const MV_INTRO_RE =
  /Você\s+está\s+ouvindo\s+o\s+(MedVoice\s*[–—-]\s*A\s+Cl[íi]nica\s+Fala),?\s*(?:uma\s+experiência\s+do\s+)(MedHelpSpace\s+Revalida)[.!]?/gi;

function processHtml(html: string): string {
  return html
    .replace(INLINE_PURPLE_RE, 'class="prose-brand-color"')
    .replace(
      MV_INTRO_RE,
      (_m, title, sub) =>
        `<span class="mv-intro-block"><span class="mv-intro-title">${title.trim()}</span><span class="mv-intro-sub">${sub.trim()}</span></span>`,
    )
    .replace(BLOCO_A_RE, (_m, title) => `<span class="bloco-header">${title.trim()}</span>`)
    .replace(BLOCO_B_RE, (_m, title) => `<span class="bloco-header">${title.trim()}</span>`);
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
      <LessonSidebar entries={entries} activeId={activeLesson.id} />

      <div className="flex-1 min-w-0">
        {/* Section title */}
        <h2 className="text-xl font-bold mb-4 pb-2 border-b-2 border-brand text-foreground">
          {activeLesson.title}
        </h2>

        {/* Audio player */}
        {activeLesson.audio_url && (
          <AudioPlayer src={activeLesson.audio_url} title="MedVoice · Áudio" />
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

        {/* Prev / Next navigation */}
        <div className="mt-10 pt-6 border-t border-border flex items-center justify-between gap-4">
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
