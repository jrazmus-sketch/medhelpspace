import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { getPageSiblings } from "@/lib/page-siblings";
import { safe } from "@/lib/sanitize";
import { TocPanel } from "./toc-panel";
import { PageCompleteFooter } from "./page-complete-footer";
import { EditableText } from "@/components/admin/editable-text";

interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

const HEADING_RE = /<h([23])[^>]*>(.*?)<\/h\1>/gi;
const TAG_RE = /<[^>]+>/g;
const INLINE_PURPLE_RE = /style="[^"]*color\s*:\s*#b046e9[^"]*"/gi;

function stripTags(html: string): string {
  return html.replace(TAG_RE, "");
}

function slugify(text: string, seen: Map<string, number>): string {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const count = seen.get(raw) ?? 0;
  seen.set(raw, count + 1);
  return count === 0 ? raw : `${raw}-${count}`;
}

function extractToc(html: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const seen = new Map<string, number>();
  let m: RegExpExecArray | null;
  HEADING_RE.lastIndex = 0;
  while ((m = HEADING_RE.exec(html)) !== null) {
    const level = parseInt(m[1], 10) as 2 | 3;
    const text = stripTags(m[2]);
    entries.push({ id: slugify(text, seen), text, level });
  }
  return entries;
}

function injectHeadingIds(html: string): string {
  const seen = new Map<string, number>();
  return html.replace(/<h([23])([^>]*)>(.*?)<\/h\1>/gi, (_, lvl, attrs, inner) => {
    const text = stripTags(inner);
    const id = slugify(text, seen);
    return `<h${lvl}${attrs} id="${id}">${inner}</h${lvl}>`;
  });
}

function processHtml(html: string): string {
  let out = injectHeadingIds(html);
  out = out.replace(INLINE_PURPLE_RE, 'class="prose-brand-color"');
  return out;
}

export async function PlainContentRenderer({
  pageId,
  view,
}: {
  pageId: number;
  view?: string | null;
}) {
  // view-specific wrapper: lets CSS color h3 brand-purple on the narrative
  // (resumos) and decision-rule (formula) page types without touching the
  // body HTML. New Markdown-authored content emits plain <h3>; legacy WP
  // content uses inline-color spans that processHtml already remaps.
  const wrapperClass =
    view === "resumos"
      ? "prose-content prose-resumo min-w-0 flex-1"
      : view === "formula"
        ? "prose-content prose-formula min-w-0 flex-1"
        : "prose-content min-w-0 flex-1";
  const supabase = createAdminClient();
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, body_html")
    .eq("page_id", pageId)
    .order("position")
    .limit(1);

  const lesson = lessons?.[0];
  const body = lesson?.body_html ?? "";

  if (!lesson || !body) {
    return <p className="text-muted-foreground text-sm">Conteúdo em preparação.</p>;
  }

  const toc = extractToc(body);
  const html = processHtml(body);
  const showToc = toc.length >= 3;

  // Completion footer — one read per page, so we mark the page's single lesson
  // row done. Reuses lesson_completions (feeds dashboard count + study-plan
  // progress, identical to text-lesson sections).
  let done = false;
  if (!USE_MOCK_DATA) {
    try {
      const userClient = await createClient();
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: completion } = await userClient
          .from("lesson_completions")
          .select("lesson_id")
          .eq("user_id", user.id)
          .eq("lesson_id", lesson.id)
          .maybeSingle();
        done = !!completion;
      }
    } catch {
      // Non-critical — footer starts un-completed; the write still records.
    }
  }
  const siblings = await getPageSiblings(pageId);

  return (
    <>
      <div className={showToc ? "flex gap-10" : undefined}>
        <EditableText
          as="div"
          variant="rich"
          table="lessons"
          id={lesson.id}
          field="body_html"
          className={wrapperClass}
          html={safe(html)}
          editHtml={body}
        />
        {showToc && <TocPanel entries={toc} />}
      </div>
      <PageCompleteFooter
        lessonId={lesson.id}
        pageId={pageId}
        initialDone={done}
        specialtyHref={siblings.specialtyHref}
        specialtyName={siblings.specialtyName}
      />
    </>
  );
}
