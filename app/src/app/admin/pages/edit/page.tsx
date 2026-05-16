import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

// Resolves a page slug to its ID and redirects to the page editor.
// Used by the admin bar's "Edit this page" link on member-facing content.
export default async function ResolvePageEditPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;
  if (!slug) redirect("/admin/pages");

  const admin = createAdminClient();
  const { data: page } = await admin
    .from("pages")
    .select("id")
    .eq("slug", slug)
    .single();

  if (!page) redirect("/admin/pages");
  redirect(`/admin/pages/${page.id}/edit`);
}
