import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { BlurbNavHubRenderer } from "@/components/content/blurb-nav-hub-renderer";
import { TrackHubRenderer } from "@/components/content/track-hub-renderer";
import { ViewHubRenderer } from "@/components/content/view-hub-renderer";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { PageView } from "@/types/supabase";

const SECTION_CONFIG: Partial<Record<PageView | "hub", { label: string; order: number }>> = {
  hub:        { label: "",                    order: 0 },
  simulados:  { label: "Estudo por Questões", order: 1 },
  resumos:    { label: "Resumos",             order: 2 },
  formula:    { label: "Fórmulas",            order: 3 },
  flashcards: { label: "Flashcards",          order: 4 },
  audiocards: { label: "Audiocards",          order: 5 },
};

export default async function SpecialtyHubPage({
  params,
}: {
  params: Promise<{ specialty: string }>;
}) {
  const { specialty: slug } = await params;
  const supabase = await createClient();

  const { data: specialties } = await supabase
    .from("specialties")
    .select("*")
    .order("display_order");

  const spec = (specialties ?? []).find((s) => s.slug === slug);

  // Not a specialty slug — check if it's a track hub (medvoice, audiocards, flashcards)
  // or any other top-level hub page. Use admin client so hub pages never 404
  // due to RLS membership checks; content renderers still apply per-user RLS.
  if (!spec) {
    const admin = createAdminClient();
    const { data: page } = await admin
      .from("pages")
      .select("id, title, type, track_id, view")
      .eq("slug", slug)
      .single();

    if (!page) notFound();

    const body =
      page.track_id != null ? (
        <TrackHubRenderer trackId={page.track_id} excludePageId={page.id} />
      ) : page.type === "blurb-nav-hub" ? (
        <BlurbNavHubRenderer pageId={page.id} />
      ) : page.view != null ? (
        <ViewHubRenderer view={page.view} excludePageId={page.id} />
      ) : null;

    if (!body) notFound();

    return (
      <div style={{ maxWidth: 1280, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
        <Breadcrumbs className="mb-6" />
        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 600, letterSpacing: "-.025em", lineHeight: 1.15, margin: 0 }}>
            {page.title}
          </h1>
        </header>
        {body}
      </div>
    );
  }

  const admin = createAdminClient();

  const { data: hubPages } = await admin
    .from("pages")
    .select("*")
    .eq("specialty_id", spec.id)
    .eq("status", "publish")
    .eq("type", "blurb-nav-hub");

  const hubPageIds = (hubPages ?? []).map((p) => p.id);

  const { data: navItemsRaw } = hubPageIds.length
    ? await admin
        .from("nav_items")
        .select("*, target_page:pages!target_page_id(id, slug, view, track_id)")
        .in("source_page_id", hubPageIds)
        .not("target_page_id", "is", null)
        .order("position")
    : { data: [] };

  // Build view → hub page map
  const hubViewMap = new Map(
    (hubPages ?? []).map((p) => [p.id, (p.view ?? "hub") as PageView | "hub"]),
  );

  type NavItem = { id: number; source_page_id: number; label: string; position: number; target_page: { id: number; slug: string; view: string | null; track_id: number | null } | null };
  type Section = { view: PageView | "hub"; label: string; order: number; items: NavItem[] };

  const sectionsMap = new Map<string, Section>();
  for (const item of (navItemsRaw ?? []) as unknown as NavItem[]) {
    const view = hubViewMap.get(item.source_page_id) ?? "hub";
    const cfg = SECTION_CONFIG[view] ?? { label: String(view), order: 99 };
    if (!sectionsMap.has(view)) {
      sectionsMap.set(view, { view, label: cfg.label, order: cfg.order, items: [] });
    }
    sectionsMap.get(view)!.items.push(item);
  }

  const sections = [...sectionsMap.values()].sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs className="mb-4" />

      <header className="mb-8">
        <div className="flex items-center gap-3">
          {spec.emoji && <span className="text-4xl">{spec.emoji}</span>}
          <h1 className="text-3xl font-bold">{spec.name}</h1>
        </div>
      </header>

      {sections.length === 0 && (
        <p className="text-muted-foreground">Conteúdo em preparação para esta especialidade.</p>
      )}

      {sections.map((section) => (
        <section key={section.view} className="mb-8">
          {section.label && (
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {section.label}
            </h2>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {section.items.map((item) => (
              <Card
                key={item.id}
                className="group border-brand/10 bg-card transition-colors hover:border-brand/40"
              >
                <CardContent className="p-4">
                  {item.target_page?.slug ? (
                    <Link
                      href={`/app/${slug}/${item.target_page.slug}`}
                      className="block font-medium text-foreground group-hover:text-brand"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="block font-medium text-muted-foreground">{item.label}</span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
