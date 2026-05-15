import { createAdminClient } from "@/lib/supabase/admin";
import { SpecialtyIcon } from "@/components/content/specialty-icon";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
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
    if (!groupMap.has(spec.id)) groupMap.set(spec.id, { spec, pages: [] });
    groupMap.get(spec.id)!.pages.push(page);
  }

  const groups = [...groupMap.values()].sort(
    (a, b) => (a.spec.display_order ?? 99) - (b.spec.display_order ?? 99),
  );

  // One page per specialty → specialty icon grid (no redundant section headers)
  const isFlat = groups.every((g) => g.pages.length === 1);

  if (isFlat) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {groups.map(({ spec, pages: groupPages }) => (
          <SpecialtyCard
            key={spec.id}
            spec={spec}
            href={`/app/${spec.slug}/${groupPages[0].slug}`}
          />
        ))}
      </div>
    );
  }

  // Multiple pages per some specialties → grouped sections
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

function SpecialtyCard({
  spec,
  href,
}: {
  spec: { slug: string; name: string };
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        background: "var(--surface-1)",
        borderRadius: "var(--radius)",
        padding: "18px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        textDecoration: "none",
        outline: "1px solid var(--surface-2)",
        outlineOffset: "-1px",
        transition: "background .12s",
      }}
      className="hover:bg-surface-2 group"
    >
      <SpecialtyIcon specialtySlug={spec.slug} size={28} />
      <div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "-.01em",
            color: "var(--foreground)",
            lineHeight: 1.25,
          }}
        >
          {spec.name}
        </div>
        <div
          style={{
            marginTop: 6,
            display: "flex",
            alignItems: "center",
            gap: 3,
            fontSize: 12,
            fontWeight: 500,
            color: "var(--brand)",
          }}
        >
          Ouvir <ChevronRight size={10} strokeWidth={2.5} />
        </div>
      </div>
    </Link>
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
