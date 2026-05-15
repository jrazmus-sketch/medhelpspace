import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageEditClient } from "./edit-client";

export const metadata = { title: "Editar página" };

export default async function PageEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pageId = Number(id);
  if (isNaN(pageId)) notFound();

  const admin = createAdminClient();

  const [{ data: page }, { data: specialties }, { data: tracks }, { data: modules }, { data: lessons }] =
    await Promise.all([
      admin
        .from("pages")
        .select("id, slug, title, page_type, status, view, specialty_id, track_id, content_module_id, notes")
        .eq("id", pageId)
        .single(),
      admin.from("specialties").select("id, name").order("display_order"),
      admin.from("tracks").select("id, name").order("id"),
      admin.from("content_modules").select("id, name").order("id"),
      admin
        .from("lessons")
        .select("id, position, title, body_html, audio_url")
        .eq("page_id", pageId)
        .order("position"),
    ]);

  if (!page) notFound();

  return (
    <PageEditClient
      page={page as PageRow}
      specialties={(specialties ?? []) as SpecialtyOption[]}
      tracks={(tracks ?? []) as TrackOption[]}
      modules={(modules ?? []) as ModuleOption[]}
      lessons={(lessons ?? []) as LessonRow[]}
    />
  );
}

// ── Local types (server → client) ─────────────────────────────────────────────

export type PageRow = {
  id: number;
  slug: string;
  title: string;
  page_type: string;
  status: string;
  view: string | null;
  specialty_id: number | null;
  track_id: number | null;
  content_module_id: number | null;
  notes: string | null;
};

export type SpecialtyOption = { id: number; name: string };
export type TrackOption = { id: number; name: string };
export type ModuleOption = { id: number; name: string };

export type LessonRow = {
  id: number;
  position: number;
  title: string;
  body_html: string | null;
  audio_url: string | null;
};
