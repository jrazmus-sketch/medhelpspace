"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLINACT_SECTIONS, CLINACT_ALWAYS_VISIBLE } from "@/components/clinact/sales/sections";
import { normalizeSectionRows } from "@/lib/site-sections-order";

// /admin/clinact/pagina — the sales page's structure, not its copy (the copy is
// edited in place through site_content). Same conventions as actions/clinact.ts:
// only async exports, and expected outcomes RETURNED, never thrown.
//
// Two tiers on purpose: arranging sections is content work (content_admin and
// super_admin); PUBLISHING puts a page that takes money in front of the public,
// so it is super_admin only.

const PAGE = "clinact";
const CONTENT_ROLES = ["super_admin", "content_admin"];

type Result = { ok: true } | { ok: false; error: "forbidden" | "invalid" | "failed" };

async function actor(): Promise<{ userId: string; role: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await createAdminClient().from("profiles").select("role").eq("id", user.id).single();
  return { userId: user.id, role: (profile?.role as string) ?? "member" };
}

async function audit(actorId: string, action: string, details: Record<string, unknown>) {
  const { error } = await createAdminClient().from("admin_audit_log").insert({ actor_user_id: actorId, action, details });
  if (error) console.error("clinact page audit failed", action, error);
}

export async function saveClinactSections(submitted: { key: string; visible: boolean }[]): Promise<Result> {
  const who = await actor();
  if (!who || !CONTENT_ROLES.includes(who.role)) return { ok: false, error: "forbidden" };

  const rows = normalizeSectionRows(
    CLINACT_SECTIONS.map((s) => s.key),
    Array.isArray(submitted) ? submitted : [],
    CLINACT_ALWAYS_VISIBLE,
  );
  if (!rows) return { ok: false, error: "invalid" };

  const admin = createAdminClient();
  const { data: before } = await admin.from("site_sections").select("key, visible, position").eq("page", PAGE).order("position");
  const now = new Date().toISOString();
  const { error } = await admin
    .from("site_sections")
    .upsert(rows.map((r) => ({ page: PAGE, ...r, updated_at: now })), { onConflict: "page,key" });
  if (error) {
    console.error("saveClinactSections failed", error);
    return { ok: false, error: "failed" };
  }

  await audit(who.userId, "clinact_page_sections", {
    before: (before ?? []).map((r) => `${r.key}${r.visible ? "" : " (oculta)"}`),
    after: rows.map((r) => `${r.key}${r.visible ? "" : " (oculta)"}`),
  });
  revalidatePath("/clinact");
  revalidatePath("/admin/clinact/pagina");
  return { ok: true };
}

export async function setClinactPagePublished(published: boolean): Promise<Result> {
  const who = await actor();
  if (!who || who.role !== "super_admin") return { ok: false, error: "forbidden" };
  if (typeof published !== "boolean") return { ok: false, error: "invalid" };

  const { error } = await createAdminClient()
    .from("site_pages")
    .upsert({ page: PAGE, published, updated_at: new Date().toISOString(), updated_by: who.userId }, { onConflict: "page" });
  if (error) {
    console.error("setClinactPagePublished failed", error);
    return { ok: false, error: "failed" };
  }

  await audit(who.userId, published ? "clinact_page_publish" : "clinact_page_unpublish", { page: PAGE });
  revalidatePath("/clinact");
  revalidatePath("/admin/clinact/pagina");
  return { ok: true };
}
