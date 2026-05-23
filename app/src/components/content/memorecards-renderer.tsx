import { createAdminClient } from "@/lib/supabase/admin";
import { getPageSiblings } from "@/lib/page-siblings";
import { MemorecardsPlayer } from "./memorecards-player";

export interface SlideData {
  id: number;
  position: number;
  layout: "text" | "image" | "text_with_image";
  content_html: string | null;
  image_url: string | null;
  caption: string | null;
}

function stripInlineColors(html: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/(?:background-)?color\s*:\s*(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-z]+)\s*;?/gi, "")
    .replace(/style="\s*;?\s*"/g, "");
}

export async function MemorecardsRenderer({ pageId }: { pageId: number }) {
  const supabase = createAdminClient();
  const { data: slides } = await supabase
    .from("presentation_slides")
    .select("id, position, layout, content_html, image_url, caption")
    .eq("page_id", pageId)
    .order("position");

  if (!slides || slides.length === 0) {
    return <p className="text-muted-foreground text-sm">Conteúdo em preparação.</p>;
  }

  const normalized = slides.map((s) => ({
    ...s,
    content_html: stripInlineColors(s.content_html),
  }));

  const siblings = await getPageSiblings(pageId);

  return (
    <MemorecardsPlayer
      slides={normalized as SlideData[]}
      nextDeckHref={siblings.nextHref}
      nextDeckTitle={siblings.nextTitle}
      specialtyHref={siblings.specialtyHref}
      specialtyName={siblings.specialtyName}
    />
  );
}
