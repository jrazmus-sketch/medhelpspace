import { createAdminClient } from "@/lib/supabase/admin";
import { getSpecialtyAccent } from "@/components/content/specialty-icon";
import { TopicCard, loadQuizStats } from "@/components/content/blurb-nav-hub-renderer";

// The "Geral" simulados are cross-specialty full mock exams (no single specialty),
// so they don't live under a per-specialty hub. They're stored as view='simulados',
// type='h5p-quiz', specialty_id IS NULL, slug 'simulado-geral-<n>', and routed at
// /app/geral/<slug> (the [specialty] segment is cosmetic — the router resolves the
// page by slug). This renders them as a flat grid of boxes, matching the per-
// specialty hub's card grid.
export async function GeralSimuladosGrid() {
  const admin = createAdminClient();

  const { data: pages } = await admin
    .from("pages")
    .select("id, slug, title")
    .eq("view", "simulados")
    .eq("type", "h5p-quiz")
    .eq("status", "publish")
    .is("specialty_id", null);

  const rows = (pages ?? []).slice().sort((a, b) => numFromSlug(a.slug) - numFromSlug(b.slug));
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
        Conteúdo em preparação.
      </p>
    );
  }

  const stats = await loadQuizStats(rows.map((r) => r.id));
  const accent = getSpecialtyAccent("geral");

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 sm:gap-4">
      {rows.map((page) => (
        <TopicCard
          key={page.id}
          editable={{ table: "pages", id: page.id, field: "title" }}
          label={page.title}
          href={`/app/geral/${page.slug}`}
          accent={accent}
          stats={stats.get(page.id)}
        />
      ))}
    </div>
  );
}

function numFromSlug(slug: string): number {
  const m = slug.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}
