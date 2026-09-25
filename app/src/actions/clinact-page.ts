"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLINACT_SECTIONS, CLINACT_ALWAYS_VISIBLE } from "@/components/clinact/sales/sections";
import { normalizeSectionRows } from "@/lib/site-sections-order";
import {
  SALES_IMAGE_EXT,
  SALES_IMAGE_MAX_BYTES,
  SALES_IMAGE_PREFIX,
  isSalesImageKey,
} from "@/lib/clinact/sales-images";
import { CLINACT_CDN_BASE } from "@/lib/clinact/types";

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

// ── Screenshot slots ─────────────────────────────────────────────────────────
// Upload goes to Bunny (same storage as ClinAct media) under a NEW name every
// time, so a replaced screenshot is never served stale from the CDN cache. The
// URL lands in site_content, where the page reads it.

type ImageResult = { ok: true; url: string } | { ok: false; error: "forbidden" | "invalid" | "bad_type" | "too_large" | "failed" };

export async function uploadSalesImage(formData: FormData): Promise<ImageResult> {
  const who = await actor();
  if (!who || !CONTENT_ROLES.includes(who.role)) return { ok: false, error: "forbidden" };

  const slot = formData.get("slot");
  const file = formData.get("file");
  if (!isSalesImageKey(slot) || !(file instanceof File) || file.size === 0) return { ok: false, error: "invalid" };
  if (file.size > SALES_IMAGE_MAX_BYTES) return { ok: false, error: "too_large" };
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!(SALES_IMAGE_EXT as readonly string[]).includes(ext) || !file.type.startsWith("image/")) {
    return { ok: false, error: "bad_type" };
  }

  const endpoint = process.env.BUNNY_STORAGE_ENDPOINT;
  const accessKey = process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY;
  if (!endpoint || !accessKey) {
    console.error("uploadSalesImage: Bunny env vars missing");
    return { ok: false, error: "failed" };
  }

  const name = `${slot.replace(/^clinact\./, "").replace(/\./g, "-")}-${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`;
  const remotePath = `${SALES_IMAGE_PREFIX}/${name}`;
  const res = await fetch(`${endpoint.replace(/\/$/, "")}/${remotePath}`, {
    method: "PUT",
    headers: { AccessKey: accessKey, "Content-Type": file.type },
    body: Buffer.from(await file.arrayBuffer()),
  });
  if (!res.ok) {
    console.error(`uploadSalesImage: Bunny PUT ${res.status}`, await res.text().catch(() => ""));
    return { ok: false, error: "failed" };
  }
  const url = `${CLINACT_CDN_BASE}/${remotePath}`;

  const { error } = await createAdminClient()
    .from("site_content")
    .upsert({ key: slot, value: url, updated_at: new Date().toISOString(), updated_by: who.userId }, { onConflict: "key" });
  if (error) {
    console.error("uploadSalesImage: site_content upsert failed", error);
    return { ok: false, error: "failed" };
  }

  await audit(who.userId, "clinact_page_image", { slot, url });
  revalidatePath("/clinact");
  revalidatePath("/admin/clinact/pagina");
  return { ok: true, url };
}

export async function removeSalesImage(slot: string): Promise<Result> {
  const who = await actor();
  if (!who || !CONTENT_ROLES.includes(who.role)) return { ok: false, error: "forbidden" };
  if (!isSalesImageKey(slot)) return { ok: false, error: "invalid" };

  const { error } = await createAdminClient().from("site_content").delete().eq("key", slot);
  if (error) {
    console.error("removeSalesImage failed", error);
    return { ok: false, error: "failed" };
  }
  await audit(who.userId, "clinact_page_image", { slot, url: null });
  revalidatePath("/clinact");
  revalidatePath("/admin/clinact/pagina");
  return { ok: true };
}
