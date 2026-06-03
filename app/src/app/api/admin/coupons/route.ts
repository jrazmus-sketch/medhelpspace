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
  startsAt?: string | null;
  expiresAt?: string | null;
  cohortSlugs?: string[] | null;
  notes?: string | null;
  active?: boolean;
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

  return { patch };
}

const ERROR_STATUS_OK = 400;

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
    if (error.code === "23505") return NextResponse.json({ errorKey: "errCodeTaken" }, { status: 409 });
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
    if (error.code === "23505") return NextResponse.json({ errorKey: "errCodeTaken" }, { status: 409 });
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

  // Refuse to hard-delete a coupon that's been used — preserve the redemption
  // audit trail. The UI offers "deactivate" for that case instead.
  const { data: coupon } = await admin.from("coupons").select("redemptions_used").eq("id", id).single();
  if (coupon && (coupon.redemptions_used as number) > 0) {
    return NextResponse.json({ errorKey: "deleteBlocked" }, { status: 409 });
  }

  const { error } = await admin.from("coupons").delete().eq("id", id);
  if (error) {
    console.error("coupon delete failed:", error);
    return NextResponse.json({ error: "Erro ao excluir cupom." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
