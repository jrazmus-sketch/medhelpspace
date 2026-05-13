import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

type NavItemRow = {
  id: number;
  label: string;
  position: number;
  target_page: {
    id: number;
    slug: string;
    specialty: { slug: string } | null;
  } | null;
};

export async function BlurbNavHubRenderer({ pageId }: { pageId: number }) {
  const admin = createAdminClient();

  const { data: items } = await admin
    .from("nav_items")
    .select(
      "id, label, position, target_page:pages!target_page_id(id, slug, specialty:specialties!specialty_id(slug))",
    )
    .eq("source_page_id", pageId)
    .not("target_page_id", "is", null)
    .order("position");

  if (!items || items.length === 0) {
    return <p className="text-muted-foreground text-sm">Conteúdo em preparação.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {(items as unknown as NavItemRow[]).map((item) => {
        const page = item.target_page;
        const href = page
          ? page.specialty
            ? `/app/${page.specialty.slug}/${page.slug}`
            : `/app/${page.slug}`
          : null;

        return (
          <Card
            key={item.id}
            className="group border-brand/10 bg-card transition-colors hover:border-brand/40"
          >
            <CardContent className="p-4">
              {href ? (
                <Link
                  href={href}
                  className="block font-medium text-foreground group-hover:text-brand"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="block font-medium text-muted-foreground">{item.label}</span>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
