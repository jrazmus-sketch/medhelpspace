import { createAdminClient } from "@/lib/supabase/admin";
import { LessonSidebar } from "./lesson-sidebar";

const INLINE_PURPLE_RE = /style="[^"]*color\s*:\s*#b046e9[^"]*"/gi;

function processHtml(html: string): string {
  return html.replace(INLINE_PURPLE_RE, 'class="prose-brand-color"');
}

export async function TextLessonRenderer({ pageId }: { pageId: number }) {
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

  return (
    <div className="flex gap-8 lg:gap-10">
      <LessonSidebar entries={entries} />
      <div className="flex-1 min-w-0">
        {lessons.map((lesson, i) => (
          <section
            key={lesson.id}
            id={`section-${lesson.id}`}
            className="mb-12 scroll-mt-24"
          >
            <h2 className="text-xl font-bold mb-4 pb-2 border-b-2 border-brand text-foreground">
              {lesson.title}
            </h2>
            {lesson.audio_url && (
              <audio
                controls
                src={lesson.audio_url}
                className="w-full mb-5 rounded-lg"
              />
            )}
            {lesson.body_html ? (
              <div
                className="prose-content"
                dangerouslySetInnerHTML={{ __html: processHtml(lesson.body_html) }}
              />
            ) : (
              <p className="text-muted-foreground text-sm italic">Conteúdo em preparação.</p>
            )}
            {i < lessons.length - 1 && (
              <div className="mt-8 pt-6 border-t border-border">
                <a
                  href={`#section-${lessons[i + 1].id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-80 transition-opacity"
                >
                  Próxima seção: {lessons[i + 1].title}
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
