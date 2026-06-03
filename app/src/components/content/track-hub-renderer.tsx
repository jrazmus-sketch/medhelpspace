import { createAdminClient } from "@/lib/supabase/admin";
import { TrackHubAccordion } from "@/components/content/track-hub-accordion";
import { Card, CardContent } from "@/components/ui/card";
import { STUDY_TYPE_CONFIG, getStudyTypeKey } from "@/lib/page-type";
import Link from "next/link";

export async function TrackHubRenderer({
  trackId,
  excludePageId,
}: {
  trackId: number;
  excludePageId: number;
}) {
  const admin = createAdminClient();

  const [{ data: trackPages }, { data: specialties }] = await Promise.all([
    admin
      .from("pages")
      .select("id, slug, title, specialty_id")
      .eq("track_id", trackId)
      .neq("id", excludePageId)
      .order("title"),
    admin
      .from("specialties")
      .select("id, slug, name, display_order, group_label")
      .order("display_order"),
  ]);

  const pages = (trackPages ?? []).filter((p) => p.specialty_id != null);

  if (pages.length === 0) {
    return <p className="text-muted-foreground text-sm">Conteúdo em preparação.</p>;
  }

  // Stripe color for each accordion row — derived from the track's StudyTypeKey
  // (medvoice / audiocards / flashcards). Same color across all rows because the
  // entire hub is a single type-ground.
  const typeKey = getStudyTypeKey({ view: null, track_id: trackId, content_module_id: null });
  const accentColor = typeKey ? STUDY_TYPE_CONFIG[typeKey].color : undefined;

  type Spec = { id: number; slug: string; name: string; display_order: number; group_label: string | null };
  const specMap = new Map<number, Spec>(
    (specialties ?? []).map((s) => [s.id as number, s as Spec]),
  );

  // Group pages by specialty, preserving display_order
  const groupMap = new Map<number, { spec: Spec; pages: typeof pages }>();
  for (const page of pages) {
    const spec = specMap.get(page.specialty_id!);
    if (!spec) continue;
    if (!groupMap.has(spec.id)) groupMap.set(spec.id, { spec, pages: [] });
    groupMap.get(spec.id)!.pages.push(page);
  }

  const groups = [...groupMap.values()].sort(
    (a, b) => (a.spec.display_order ?? 99) - (b.spec.display_order ?? 99),
  );

  // One page per specialty → accordion grouped by exam area
  const isFlat = groups.every((g) => g.pages.length === 1);

  if (isFlat) {
    type SuperGroup = { label: string; iconSlug: string; minOrder: number; items: { spec: Spec; href: string }[] };
    const superMap = new Map<string, SuperGroup>();

    for (const { spec, pages: gPages } of groups) {
      const label = spec.group_label ?? spec.name;
      if (!superMap.has(label)) {
        // Groups with 1 specialty use that specialty's icon.
        // Multi-specialty groups (Clínica Médica) use the "clinica-medica" icon.
        const iconSlug = spec.group_label ? "clinica-medica" : spec.slug;
        superMap.set(label, { label, iconSlug, minOrder: spec.display_order, items: [] });
      }
      superMap.get(label)!.items.push({ spec, href: `/app/${spec.slug}/${gPages[0].slug}` });
    }

    const superGroups = [...superMap.values()].sort((a, b) => a.minOrder - b.minOrder);

    // Track hubs get an extra "Outros" section, empty for now — content TBD.
    if (typeKey === "flashcards" || typeKey === "medvoice" || typeKey === "audiocards") {
      superGroups.push({ label: "Outros", iconSlug: "outros", minOrder: 999, items: [] });
    }

    return <TrackHubAccordion groups={superGroups} accentColor={accentColor} />;
  }

  // Multiple pages per some specialties → grouped sections with page cards
  return (
    <div className="space-y-8">
      {groups.map(({ spec, pages: groupPages }) => (
        <section key={spec.id}>
          <h2
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted-2, #727272)",
              marginBottom: 14,
            }}
          >
            {spec.name}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {groupPages.map((page) => (
              <PageCard
                key={page.id}
                label={page.title}
                href={`/app/${spec.slug}/${page.slug}`}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PageCard({ label, href }: { label: string; href: string }) {
  return (
    <Card className="group border-brand/10 bg-card transition-colors hover:border-brand/40">
      <CardContent className="p-4">
        <Link
          href={href}
          className="block font-medium text-foreground group-hover:text-brand"
        >
          {label}
        </Link>
      </CardContent>
    </Card>
  );
}
