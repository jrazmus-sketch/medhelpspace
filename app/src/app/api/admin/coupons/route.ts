import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin CRUD for coupons. Gated to super_admin + billing_admin (same tier as
// /admin/billing). Validation here is defense-in-depth — the DB also enforces
// CHECK constraints, the case-insensitive unique index, and the percent range.

// Valid cohort slugs come from the DB (the cohort catalog), not a hardcoded list,
// so coupons can be scoped to any existing turma.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCohortSlugs(admin: any): Promise<Set<string>> {
  const { data } = await admin.from("cohorts").select("slug");
  return new Set<string>((data ?? []).map((r: { slug: string }) => r.slug));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireBillingAdmin(): Promise<{ admin: any } | { error: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["super_admin", "billing_admin"].includes(profile.role as string)) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { admin };
}

type CouponInput = {
  code?: string;
  discountType?: "percent" | "fixed_cents";
  discountValue?: number;
  maxRedemptions?: number | null;
  maxUsesPerUser?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  cohortSlugs?: string[] | null;
  notes?: string | null;
  active?: boolean;
  /** false = restore an archived ("excluído") coupon. It comes back inactive. */
  archived?: boolean;
};

// Validate + normalize the mutable fields. Returns a clean row patch or an error key.
function buildPatch(b: CouponInput, requireAll: boolean, validSlugs: Set<string>): { patch: Record<string, unknown> } | { errorKey: string } {
  const patch: Record<string, unknown> = {};

  if (requireAll || b.code !== undefined) {
    const code = (b.code ?? "").trim().toUpperCase();
    if (!code) return { errorKey: "errCodeRequired" };
    patch.code = code;
  }

  const type = b.discountType;
  if (requireAll || type !== undefined) {
    if (type !== "percent" && type !== "fixed_cents") return { errorKey: "errValueRequired" };
    patch.discount_type = type;
  }

  if (requireAll || b.discountValue !== undefined) {
    const v = b.discountValue;
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v <= 0) {
      return { errorKey: "errValueRequired" };
    }
    // Validate against the resolved type (the one in this patch, else the existing one is
    // re-checked by the DB CHECK constraint on percent range as a backstop).
    if ((patch.discount_type ?? type) === "percent" && (v < 1 || v > 100)) {
      return { errorKey: "errPercentRange" };
    }
    if ((patch.discount_type ?? type) === "fixed_cents" && v <= 0) {
      return { errorKey: "errFixedPositive" };
    }
    patch.discount_value = v;
  }

  if (b.maxRedemptions !== undefined) {
    const m = b.maxRedemptions;
    if (m === null) patch.max_redemptions = null;
    else if (typeof m === "number" && Number.isInteger(m) && m > 0) patch.max_redemptions = m;
    else return { errorKey: "errValueRequired" };
  }

  // NULL = unlimited uses per person (testing coupons); DB default is 1.
  if (b.maxUsesPerUser !== undefined) {
    const m = b.maxUsesPerUser;
    if (m === null) patch.max_uses_per_user = null;
    else if (typeof m === "number" && Number.isInteger(m) && m > 0) patch.max_uses_per_user = m;
    else return { errorKey: "errValueRequired" };
  }

  if (b.startsAt !== undefined) patch.starts_at = b.startsAt || null;
  if (b.expiresAt !== undefined) patch.expires_at = b.expiresAt || null;

  // Window sanity: only when both ends are known in this request.
  const s = patch.starts_at as string | null | undefined;
  const e = patch.expires_at as string | null | undefined;
  if (s && e && new Date(s) >= new Date(e)) return { errorKey: "errWindow" };

  if (b.cohortSlugs !== undefined) {
    if (b.cohortSlugs === null || (Array.isArray(b.cohortSlugs) && b.cohortSlugs.length === 0)) {
      patch.applies_to_cohort_slugs = null; // all cohorts
    } else if (Array.isArray(b.cohortSlugs) && b.cohortSlugs.every((s2) => validSlugs.has(s2))) {
      patch.applies_to_cohort_slugs = b.cohortSlugs;
    } else {
      return { errorKey: "errValueRequired" };
    }
  }

  if (b.notes !== undefined) patch.notes = (b.notes ?? "").trim() || null;
  if (b.active !== undefined) patch.active = !!b.active;
  if (b.archived === false) patch.archived_at = null;

  return { patch };
}

const ERROR_STATUS_OK = 400;

// A code is unique across live AND archived coupons (coupons_code_upper_uniq), so a
// clash with an archived one gets its own message: restore it rather than recreate it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function codeTakenKey(admin: any, code: unknown): Promise<string> {
  if (typeof code !== "string" || !code) return "errCodeTaken";
  const exact = code.replace(/[%_\\]/g, "\\$&"); // ilike = case-insensitive equality here
  const { data } = await admin.from("coupons").select("archived_at").ilike("code", exact).maybeSingle();
  return data?.archived_at ? "errCodeArchived" : "errCodeTaken";
}

export async function POST(request: NextRequest) {
  const gate = await requireBillingAdmin();
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  let body: CouponInput;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const validSlugs = await fetchCohortSlugs(admin);
  const built = buildPatch(body, /* requireAll */ true, validSlugs);
  if ("errorKey" in built) return NextResponse.json({ errorKey: built.errorKey }, { status: ERROR_STATUS_OK });

  const { data, error } = await admin.from("coupons").insert(built.patch).select("*").single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ errorKey: await codeTakenKey(admin, built.patch.code) }, { status: 409 });
    }
    console.error("coupon create failed:", error);
    return NextResponse.json({ error: "Erro ao criar cupom." }, { status: 500 });
  }
  return NextResponse.json({ coupon: data });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireBillingAdmin();
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  let body: CouponInput & { id?: number };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const validSlugs = await fetchCohortSlugs(admin);
  const built = buildPatch(body, /* requireAll */ false, validSlugs);
  if ("errorKey" in built) return NextResponse.json({ errorKey: built.errorKey }, { status: ERROR_STATUS_OK });
  if (Object.keys(built.patch).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const { data, error } = await admin.from("coupons").update(built.patch).eq("id", body.id).select("*").single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ errorKey: await codeTakenKey(admin, built.patch.code) }, { status: 409 });
    }
    // coupons_archived_inactive: an archived coupon cannot be switched on.
    if (error.code === "23514" && String(error.message).includes("coupons_archived_inactive")) {
      return NextResponse.json({ errorKey: "errArchived" }, { status: 409 });
    }
    console.error("coupon update failed:", error);
    return NextResponse.json({ error: "Erro ao atualizar cupom." }, { status: 500 });
  }
  return NextResponse.json({ coupon: data });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireBillingAdmin();
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { data: coupon } = await admin.from("coupons").select("redemptions_used").eq("id", id).maybeSingle();
  if (!coupon) return NextResponse.json({ error: "Cupom não encontrado." }, { status: 404 });

  // An embaixador's code is their attribution link: archiving it would silently stop
  // their sales from being credited. Swap the coupon on the ambassador first.
  const { count: ambassadorRefs } = await admin
    .from("ambassadors")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", id)
    .neq("status", "terminated");
  if ((ambassadorRefs ?? 0) > 0) return NextResponse.json({ errorKey: "deleteAmbassador" }, { status: 409 });

  // A used coupon is ARCHIVED, never deleted (schema-patch-coupon-archive.sql): orders
  // point at it, and coupon_redemptions would cascade away with it. Archived = gone from
  // the list and switched off for good (the DB keeps it inactive); history intact.
  if ((coupon.redemptions_used as number) > 0) return archive(admin, id);

  const { error } = await admin.from("coupons").delete().eq("id", id);
  if (error) {
    // Unused but still referenced (e.g. an order that never completed) → archive too.
    if (error.code === "23503") return archive(admin, id);
    console.error("coupon delete failed:", error);
    return NextResponse.json({ error: "Erro ao excluir cupom." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, archived: false });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function archive(admin: any, id: number): Promise<NextResponse> {
  const { error } = await admin
    .from("coupons")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("id", id);
  if (error) {
    console.error("coupon archive failed:", error);
    return NextResponse.json({ error: "Erro ao excluir cupom." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, archived: true });
}
