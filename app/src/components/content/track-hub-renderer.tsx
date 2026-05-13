import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
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
      .select("id, slug, name, display_order")
      .order("display_order"),
  ]);

  const pages = (trackPages ?? []).filter((p) => p.specialty_id != null);

  if (pages.length === 0) {
    return <p className="text-muted-foreground text-sm">Conteúdo em preparação.</p>;
  }

  type Spec = { id: number; slug: string; name: string; display_order: number };
  const specMap = new Map<number, Spec>(
    (specialties ?? []).map((s) => [s.id as number, s as Spec]),
  );

  // Group by specialty, preserving display_order
  const groupMap = new Map<number, { spec: Spec; pages: typeof pages }>();
  for (const page of pages) {
    const spec = specMap.get(page.specialty_id!);
    if (!spec) continue;
    if (!groupMap.has(spec.id)) {
      groupMap.set(spec.id, { spec, pages: [] });
    }
    groupMap.get(spec.id)!.pages.push(page);
  }

  const groups = [...groupMap.values()].sort(
    (a, b) => (a.spec.display_order ?? 99) - (b.spec.display_order ?? 99),
  );

  if (groups.length <= 1) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {pages.map((page) => {
          const spec = specMap.get(page.specialty_id!);
          return spec ? (
            <PageCard
              key={page.id}
              label={page.title}
              href={`/app/${spec.slug}/${page.slug}`}
            />
          ) : null;
        })}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map(({ spec, pages: groupPages }) => (
        <section key={spec.id}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
