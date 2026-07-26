import { createAdminClient } from "@/lib/supabase/admin";
import { getSpecialtyAccent } from "@/components/content/specialty-icon";
import { TopicCard, loadQuizStats } from "@/components/content/blurb-nav-hub-renderer";

// The MedHelp 60D "Simulados 100Q" grid: seven full 100-question mock exams.
//
// These are stored exactly like the public Geral simulados (view='simulados',
// type='h5p-quiz', specialty_id NULL) so they inherit the whole member quiz stack —
// the simulado player, progress stats, Revisão, the admin editor. What separates
// them is content_module_id = 1, which both keeps them out of the public catalogue
// and makes the [slug] route enforce the 60D unlock date on each one.
//
// A simulado with no questions yet renders as a disabled "em breve" card rather
// than being hidden, so the section reads as seven planned exams instead of
// looking half-built while Karina fills the rest.

const MEDHELP_60D_MODULE_ID = 1;

export async function Simulados100qGrid() {
  const admin = createAdminClient();

  const { data: pages } = await admin
    .from("pages")
    .select("id, slug, title")
    .eq("view", "simulados")
    .eq("type", "h5p-quiz")
    .eq("status", "publish")
    .is("specialty_id", null)
    .eq("content_module_id", MEDHELP_60D_MODULE_ID);

  const rows = (pages ?? []).slice().sort((a, b) => numFromSlug(a.slug) - numFromSlug(b.slug));
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Conteúdo em preparação.</p>
    );
  }

  const stats = await loadQuizStats(rows.map((r) => r.id));
  const accent = getSpecialtyAccent("geral");

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      {rows.map((page) => {
        const stat = stats.get(page.id);
        const ready = (stat?.total ?? 0) > 0;
        return (
          <TopicCard
            key={page.id}
            editable={{ table: "pages", id: page.id, field: "title" }}
            label={page.title}
            // null href = disabled card. loadQuizStats omits pages with no
            // questions, so an empty simulado also shows no misleading "0/0".
            href={ready ? `/app/geral/${page.slug}` : null}
            accent={accent}
            stats={stat}
          />
        );
      })}
    </div>
  );
}

function numFromSlug(slug: string): number {
  const m = slug.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}
