import { createAdminClient } from "@/lib/supabase/admin";
import { PagesClient } from "./pages-client";

export const metadata = { title: "Páginas" };

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const admin = createAdminClient();

  const query = admin
    .from("pages")
    .select("id, slug, title, page_type, status, view, notes, specialties(name)")
    .order("id");

  if (status === "draft" || status === "published") {
    query.eq("status", status);
  }

  const { data: pages } = await query;

  const rows = (pages ?? []).map((p) => ({
    id: p.id as number,
    slug: p.slug as string,
    title: p.title as string,
    page_type: p.page_type as string,
    status: p.status as string,
    view: p.view as string | null,
    notes: p.notes as string | null,
    specialty: (p.specialties as unknown as { name: string } | { name: string }[] | null) instanceof Array
      ? ((p.specialties as unknown as { name: string }[])[0]?.name ?? null)
      : ((p.specialties as unknown as { name: string } | null)?.name ?? null),
  }));

  return <PagesClient rows={rows} />;
}
