import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/pagbank/rate-limit";
import { getCohortProduct } from "@/lib/queries/cohort-products";

// Read-only preview of a coupon. Anonymous-callable so guests can validate a
// code before signing up. The per-user uniqueness check is deferred to redeem
// time (UNIQUE(coupon_id, user_id) on coupon_redemptions); this endpoint only
// confirms the code itself is currently usable.

const ERROR_MESSAGES: Record<string, string> = {
  COUPON_NOT_FOUND: "Cupom não encontrado.",
  COUPON_INACTIVE: "Cupom indisponível.",
  COUPON_NOT_YET_VALID: "Este cupom ainda não está válido.",
  COUPON_EXPIRED: "Cupom expirado.",
  COUPON_FULLY_REDEEMED: "Cupom esgotado.",
  COUPON_NOT_VALID_FOR_COHORT: "Cupom não é válido para esta turma.",
};

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um momento." }, { status: 429 });
  }

  let body: { code?: string; cohortSlug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const code = body.code?.trim().toUpperCase();
  const cohortSlug = body.cohortSlug?.trim();
  if (!code) return NextResponse.json({ error: "Informe o código do cupom." }, { status: 400 });
  if (!cohortSlug) return NextResponse.json({ error: "Turma inválida." }, { status: 400 });

  const product = await getCohortProduct(cohortSlug);
  if (!product) return NextResponse.json({ error: "Turma inválida." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("preview_coupon", {
    p_code: code,
    p_cohort_slug: cohortSlug,
    p_base_amount_cents: product.priceCents,
  });

  if (error) {
    // PG errors from RAISE EXCEPTION come back with `message` like "COUPON_EXPIRED" — map them.
    const key = (error.message ?? "").match(/COUPON_[A-Z_]+/)?.[0];
    if (key && ERROR_MESSAGES[key]) {
      return NextResponse.json({ error: ERROR_MESSAGES[key] }, { status: 400 });
    }
    console.error("preview_coupon failed:", error);
    return NextResponse.json({ error: "Erro ao validar cupom." }, { status: 500 });
  }

  // RPC returns a table-shaped result: array of rows. We get exactly one row.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return NextResponse.json({ error: "Cupom não encontrado." }, { status: 400 });
  }

  return NextResponse.json({
    code,
    discountCents: row.discount_cents as number,
    finalAmountCents: row.final_amount_cents as number,
    isFullDiscount: row.is_full_discount as boolean,
  });
}
