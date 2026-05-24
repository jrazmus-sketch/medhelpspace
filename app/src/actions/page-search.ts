"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PageSearchResult = {
  id: number;
  title: string;
  slug: string;
  type: string;
  specialty_id: number | null;
  specialty_name: string | null;
  updated_at: string | null;
};

export type PageSearchParams = {
  query?: string;
  type?: string;
  specialtyId?: number;
  includeDrafts?: boolean;
  sort?: "recent" | "alpha";
};

const MAX_RESULTS = 50;
const ALLOWED_ROLES = new Set(["super_admin", "content_admin"]);

async function requireContentAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !ALLOWED_ROLES.has(profile.role as string)) {
    throw new Error("Unauthorized");
  }
}

/**
 * Searches the `pages` table for the admin PagePicker. Admin-context query
 * (bypasses RLS via service-role client). Caps results at 50.
 */
export async function searchPages(
  params: PageSearchParams,
): Promise<PageSearchResult[]> {
  await requireContentAdmin();
  const admin = createAdminClient();

  // Build the base query joining specialty name
  let query = admin
    .from("pages")
    .select(
      "id, title, slug, type, specialty_id, updated_at, specialties:specialty_id(name)",
    );

  // Status filter: drafts are hidden by default
  if (!params.includeDrafts) {
    query = query.eq("status", "publish");
  }

  // Type filter
  if (params.type && params.type !== "all") {
    query = query.eq("type", params.type);
  }

  // Specialty filter
  if (typeof params.specialtyId === "number") {
    query = query.eq("specialty_id", params.specialtyId);
  }

  // Free-text search: title ILIKE OR slug ILIKE
  const q = params.query?.trim();
  if (q) {
    // Supabase .or() escapes commas, but ILIKE patterns shouldn't contain commas anyway.
    const sanitized = q.replace(/[%,]/g, " ").trim();
    if (sanitized.length > 0) {
      const pattern = `%${sanitized}%`;
      query = query.or(`title.ilike.${pattern},slug.ilike.${pattern}`);
    }
  }

  // Sort
  if (params.sort === "alpha") {
    query = query.order("title", { ascending: true });
  } else {
    query = query.order("updated_at", { ascending: false, nullsFirst: false });
  }

  query = query.limit(MAX_RESULTS);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id as number,
    title: row.title as string,
    slug: row.slug as string,
    type: row.type as string,
    specialty_id: (row.specialty_id as number | null) ?? null,
    specialty_name: row.specialties?.name ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  }));
}

/**
 * Resolves a single page id → title/slug/type, for displaying the trigger button
 * of the PagePicker when a target_page_id is already set. Cheap single-row lookup.
 */
export async function getPageSummary(pageId: number): Promise<PageSearchResult | null> {
  await requireContentAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pages")
    .select(
      "id, title, slug, type, specialty_id, updated_at, specialties:specialty_id(name)",
    )
    .eq("id", pageId)
    .single();
  if (error || !data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any;
  return {
    id: row.id as number,
    title: row.title as string,
    slug: row.slug as string,
    type: row.type as string,
    specialty_id: (row.specialty_id as number | null) ?? null,
    specialty_name: row.specialties?.name ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}
