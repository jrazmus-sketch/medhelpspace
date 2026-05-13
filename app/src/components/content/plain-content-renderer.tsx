import { createAdminClient } from "@/lib/supabase/admin";
import { TocPanel } from "./toc-panel";

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

export async function PlainContentRenderer({ pageId }: { pageId: number }) {
  const supabase = createAdminClient();
  const { data: lessons } = await supabase
    .from("lessons")
    .select("body_html")
    .eq("page_id", pageId)
    .order("position")
    .limit(1);

  const body = lessons?.[0]?.body_html ?? "";

  if (!body) {
    return <p className="text-muted-foreground text-sm">Conteúdo em preparação.</p>;
  }

  const toc = extractToc(body);
  const html = processHtml(body);
  const showToc = toc.length >= 3;

  return (
    <div className={showToc ? "flex gap-10" : undefined}>
      <article
        className="prose-content min-w-0 flex-1"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {showToc && <TocPanel entries={toc} />}
    </div>
  );
}
