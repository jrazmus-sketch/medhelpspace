"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugifyTitle } from "@/lib/clinact/slug";

// /admin/clinact/taxonomia — ClinAct's OWN specialties and topics (Karina
// 2026-10-13: "taxonomia própria do ClinAct, independente do Revalida"). These
// tables are read only by ClinAct; Revalida's `specialties` / `topics` are
// never touched from here. Same conventions as actions/clinact-page.ts: only
// async exports, expected outcomes RETURNED (prod redacts thrown messages).
//
// What protects the students:
//   - a specialty or topic used by a PUBLISHED case cannot be deactivated (its
//     name would vanish from the library and from the finished case);
//   - nothing used by ANY case can be deleted — deactivate it instead;
//   - a slug is fixed at creation, so renaming never moves an address.

const CONTENT_ROLES = ["super_admin", "content_admin"];

export type TaxonomyResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "invalid" | "duplicate" | "in_use" | "reserved" | "failed" };

async function actor(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await createAdminClient().from("profiles").select("role").eq("id", user.id).single();
  return CONTENT_ROLES.includes((profile?.role as string) ?? "") ? user.id : null;
}

async function audit(actorId: string, action: string, details: Record<string, unknown>) {
  const { error } = await createAdminClient().from("admin_audit_log").insert({ actor_user_id: actorId, action, details });
  if (error) console.error("clinact taxonomy audit failed", action, error);
}

function refresh() {
  revalidatePath("/admin/clinact", "layout");
  revalidatePath("/clinact/treinar", "layout");
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length >= 2 && name.length <= 80 ? name : null;
}

async function usage(column: "specialty_id" | "topic_id", id: number): Promise<{ cases: number; published: number } | null> {
  const { data, error } = await createAdminClient().from("clinact_cases").select("status").eq(column, id);
  if (error) return null;
  return { cases: data.length, published: data.filter((c) => c.status === "published").length };
}

// ── Specialties ──────────────────────────────────────────────────────────────

export async function createClinactSpecialty(rawName: string): Promise<TaxonomyResult> {
  const who = await actor();
  if (!who) return { ok: false, error: "forbidden" };
  const name = cleanName(rawName);
  if (!name) return { ok: false, error: "invalid" };
  const slug = slugifyTitle(name);
  if (!slug) return { ok: false, error: "invalid" };
  // /clinact/treinar/casos is a static sibling of /clinact/treinar/[especialidade].
  if (slug === "casos") return { ok: false, error: "reserved" };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("clinact_specialties").select("slug, display_order");
  // An inactive row with the same name still owns the slug: reactivate it instead.
  if ((existing ?? []).some((r) => r.slug === slug)) return { ok: false, error: "duplicate" };
  const nextOrder = Math.max(0, ...(existing ?? []).map((r) => Number(r.display_order) || 0)) + 10;
  const { data, error } = await admin
    .from("clinact_specialties")
    .insert({ slug, name, display_order: nextOrder })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "duplicate" };
    console.error("createClinactSpecialty failed", error);
    return { ok: false, error: "failed" };
  }
  await audit(who, "clinact_specialty_create", { id: data.id, slug, name });
  refresh();
  return { ok: true };
}

export async function updateClinactSpecialty(id: number, patch: { name?: string; active?: boolean }): Promise<TaxonomyResult> {
  const who = await actor();
  if (!who) return { ok: false, error: "forbidden" };
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };

  const admin = createAdminClient();
  const { data: before } = await admin.from("clinact_specialties").select("id, slug, name, active").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "invalid" };

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (!name) return { ok: false, error: "invalid" };
    update.name = name;
  }
  if (patch.active !== undefined) {
    if (typeof patch.active !== "boolean") return { ok: false, error: "invalid" };
    if (!patch.active) {
      const used = await usage("specialty_id", id);
      if (!used) return { ok: false, error: "failed" };
      if (used.published > 0) return { ok: false, error: "in_use" };
    }
    update.active = patch.active;
  }
  if (!Object.keys(update).length) return { ok: true };

  const { error } = await admin.from("clinact_specialties").update({ ...update, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error("updateClinactSpecialty failed", error);
    return { ok: false, error: "failed" };
  }
  await audit(who, "clinact_specialty_update", {
    id,
    slug: before.slug,
    before: { name: before.name, active: before.active },
    after: { name: update.name ?? before.name, active: update.active ?? before.active },
  });
  refresh();
  return { ok: true };
}

/** Swap a specialty with its neighbour, then renumber 10, 20, 30… so the order stays unambiguous. */
export async function moveClinactSpecialty(id: number, by: -1 | 1): Promise<TaxonomyResult> {
  const who = await actor();
  if (!who) return { ok: false, error: "forbidden" };
  if (!Number.isInteger(id) || (by !== -1 && by !== 1)) return { ok: false, error: "invalid" };

  const admin = createAdminClient();
  const { data: rows, error: readError } = await admin
    .from("clinact_specialties")
    .select("id, slug, name, display_order")
    .order("display_order")
    .order("name");
  if (readError || !rows) return { ok: false, error: "failed" };
  const i = rows.findIndex((r) => Number(r.id) === id);
  const j = i + by;
  if (i < 0) return { ok: false, error: "invalid" };
  if (j < 0 || j >= rows.length) return { ok: true };
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];

  const now = new Date().toISOString();
  const changed = next
    .map((r, k) => ({ id: Number(r.id), slug: r.slug, name: r.name, display_order: (k + 1) * 10, old: Number(r.display_order) }))
    .filter((r) => r.display_order !== r.old);
  for (const r of changed) {
    const { error } = await admin.from("clinact_specialties").update({ display_order: r.display_order, updated_at: now }).eq("id", r.id);
    if (error) {
      console.error("moveClinactSpecialty failed", error);
      return { ok: false, error: "failed" };
    }
  }
  await audit(who, "clinact_specialty_update", {
    id,
    slug: rows[i].slug,
    order: { before: rows.map((r) => r.name), after: next.map((r) => r.name) },
  });
  refresh();
  return { ok: true };
}

export async function deleteClinactSpecialty(id: number): Promise<TaxonomyResult> {
  const who = await actor();
  if (!who) return { ok: false, error: "forbidden" };
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };

  const admin = createAdminClient();
  const { data: before } = await admin.from("clinact_specialties").select("id, slug, name").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "invalid" };
  const used = await usage("specialty_id", id);
  if (!used) return { ok: false, error: "failed" };
  const { count: topics } = await admin.from("clinact_topics").select("id", { count: "exact", head: true }).eq("specialty_id", id);
  if (used.cases > 0 || (topics ?? 0) > 0) return { ok: false, error: "in_use" };

  const { error } = await admin.from("clinact_specialties").delete().eq("id", id);
  if (error) {
    console.error("deleteClinactSpecialty failed", error);
    return { ok: false, error: error.code === "23503" ? "in_use" : "failed" };
  }
  await audit(who, "clinact_specialty_delete", { id, slug: before.slug, name: before.name });
  refresh();
  return { ok: true };
}

// ── Topics ───────────────────────────────────────────────────────────────────

export async function createClinactTopic(specialtyId: number, rawName: string): Promise<TaxonomyResult> {
  const who = await actor();
  if (!who) return { ok: false, error: "forbidden" };
  const name = cleanName(rawName);
  if (!name || !Number.isInteger(specialtyId)) return { ok: false, error: "invalid" };
  const slug = slugifyTitle(name);
  if (!slug) return { ok: false, error: "invalid" };

  const admin = createAdminClient();
  const { data: specialty } = await admin.from("clinact_specialties").select("id, name").eq("id", specialtyId).maybeSingle();
  if (!specialty) return { ok: false, error: "invalid" };
  const { data, error } = await admin.from("clinact_topics").insert({ specialty_id: specialtyId, slug, name }).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "duplicate" };
    console.error("createClinactTopic failed", error);
    return { ok: false, error: "failed" };
  }
  await audit(who, "clinact_topic_create", { id: data.id, specialty: specialty.name, slug, name });
  refresh();
  return { ok: true };
}

export async function updateClinactTopic(id: number, patch: { name?: string; active?: boolean }): Promise<TaxonomyResult> {
  const who = await actor();
  if (!who) return { ok: false, error: "forbidden" };
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };

  const admin = createAdminClient();
  const { data: before } = await admin.from("clinact_topics").select("id, slug, name, active, specialty_id").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "invalid" };

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (!name) return { ok: false, error: "invalid" };
    update.name = name;
  }
  if (patch.active !== undefined) {
    if (typeof patch.active !== "boolean") return { ok: false, error: "invalid" };
    if (!patch.active) {
      const used = await usage("topic_id", id);
      if (!used) return { ok: false, error: "failed" };
      if (used.published > 0) return { ok: false, error: "in_use" };
    }
    update.active = patch.active;
  }
  if (!Object.keys(update).length) return { ok: true };

  const { error } = await admin.from("clinact_topics").update({ ...update, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error("updateClinactTopic failed", error);
    return { ok: false, error: "failed" };
  }
  await audit(who, "clinact_topic_update", {
    id,
    slug: before.slug,
    before: { name: before.name, active: before.active },
    after: { name: update.name ?? before.name, active: update.active ?? before.active },
  });
  refresh();
  return { ok: true };
}

export async function deleteClinactTopic(id: number): Promise<TaxonomyResult> {
  const who = await actor();
  if (!who) return { ok: false, error: "forbidden" };
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };

  const admin = createAdminClient();
  const { data: before } = await admin.from("clinact_topics").select("id, slug, name").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "invalid" };
  const used = await usage("topic_id", id);
  if (!used) return { ok: false, error: "failed" };
  if (used.cases > 0) return { ok: false, error: "in_use" };

  const { error } = await admin.from("clinact_topics").delete().eq("id", id);
  if (error) {
    console.error("deleteClinactTopic failed", error);
    return { ok: false, error: error.code === "23503" ? "in_use" : "failed" };
  }
  await audit(who, "clinact_topic_delete", { id, slug: before.slug, name: before.name });
  refresh();
  return { ok: true };
}
