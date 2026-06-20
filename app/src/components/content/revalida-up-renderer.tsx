import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { RevalidaUpSlides } from "./revalida-up-slides";

// One CaiuNaProva insight = one slide. Authored body_html is uniform:
//   <h2>CaiuNaProva – Tema</h2>
//   <h3>① …</h3> <ul>…✔ clues…</ul> <blockquote>…PADRÃO…</blockquote> <hr>  (×N)
// so we split on <hr> and, per chunk, separate heading / clues / the PADRÃO
// blockquote (hidden behind a reveal in the player).
export interface CaiuSlide {
  heading: string;        // <h3>…</h3>
  clues: string;          // the <ul> (+ any stray prose); no heading, no blockquote
  padrao: string | null;  // <blockquote>…</blockquote> or null (e.g. a recap with none)
}

function splitCaiuNaProva(body: string): CaiuSlide[] {
  const h2 = body.match(/<h2>[\s\S]*?<\/h2>/i);
  const rest = h2 ? body.slice((h2.index ?? 0) + h2[0].length) : body;
  return rest
    .split(/<hr\s*\/?>/i)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((chunk) => {
      const heading = (chunk.match(/<h3>[\s\S]*?<\/h3>/i) ?? [""])[0];
      const padrao = (chunk.match(/<blockquote>[\s\S]*?<\/blockquote>/i) ?? [null])[0] as
        | string
        | null;
      let clues = chunk;
      if (heading) clues = clues.replace(heading, "");
      if (padrao) clues = clues.replace(padrao, "");
      return { heading, clues: clues.trim(), padrao };
    })
    .filter((s) => s.heading || s.clues);
}

// Drop the redundant " Revalida UP" suffix for the "Próximo tema" label.
function cleanTitle(title: string): string {
  return title.replace(/\s*revalida\s*up\s*$/i, "").trim();
}

export async function RevalidaUpRenderer({
  pageId,
  specialtySlug,
}: {
  pageId: number;
  specialtySlug: string;
}) {
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

  const { data: page } = await supabase
    .from("pages")
    .select("specialty_id")
    .eq("id", pageId)
    .single();

  // "Voltar" → the Revalida Up topic list (keeps the student inside the section).
  const specialtyHref = `/app/medhelp-60d/revalida-up/${specialtySlug}`;
  let specialtyName = "";
  let nextHref: string | null = null;
  let nextTitle: string | null = null;

  if (page?.specialty_id) {
    const [{ data: spec }, { data: topics }] = await Promise.all([
      supabase.from("specialties").select("name").eq("id", page.specialty_id).maybeSingle(),
      supabase
        .from("pages")
        .select("id, slug, title")
        .eq("view", "revalida-up")
        .eq("status", "publish")
        .eq("specialty_id", page.specialty_id)
        .order("title"),
    ]);
    specialtyName = spec?.name ?? "";
    const list = topics ?? [];
    const i = list.findIndex((t) => t.id === pageId);
    const nxt = i >= 0 ? list[i + 1] : undefined;
    if (nxt) {
      nextHref = `/app/${specialtySlug}/${nxt.slug}`;
      nextTitle = cleanTitle(nxt.title);
    }
  }

  let done = false;
  if (!USE_MOCK_DATA) {
    try {
      const userClient = await createClient();
      const {
        data: { user },
      } = await userClient.auth.getUser();
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
      // Non-critical — completion stays false; the write still records on finish.
    }
  }

  return (
    <RevalidaUpSlides
      slides={splitCaiuNaProva(body)}
      fullHtml={body}
      lessonId={lesson.id}
      pageId={pageId}
      initialDone={done}
      nextHref={nextHref}
      nextTitle={nextTitle}
      specialtyHref={specialtyHref}
      specialtyName={specialtyName}
    />
  );
}
