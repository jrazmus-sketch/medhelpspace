import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstallmentOptions } from "@/lib/pagbank/api";
import { checkRateLimit, getClientIp } from "@/lib/pagbank/rate-limit";
import { COHORT_PRODUCTS } from "@/lib/pricing";

// Live installment ladder for the checkout card form. Returns the per-installment
// values with buyer-paid interest, exactly as PagBank will charge them. Pass the
// card BIN (first 6 digits) once known for brand-accurate rates. Pass couponCode
// to fold the discount into the simulated base so the ladder matches what the
// charge route will actually compute.
//
// Anonymous-callable so the guest checkout flow can show the ladder before the
// visitor signs up. We only call PagBank's read-only fees endpoint here — no
// charge state changes.
export async function GET(request: NextRequest) {
  // Per-IP rate limit covers the coupon enumeration vector below (an attacker
  // could otherwise probe codes via response-shape differences).
  if (!checkRateLimit(getClientIp(request.headers))) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um momento." }, { status: 429 });
  }

  const cohortSlug = request.nextUrl.searchParams.get("cohortSlug") ?? "";
  const bin = request.nextUrl.searchParams.get("bin") ?? undefined;
  const couponCode = request.nextUrl.searchParams.get("couponCode")?.trim().toUpperCase() ?? "";

  const product = COHORT_PRODUCTS[cohortSlug];
  if (!product) {
    return NextResponse.json({ error: "Turma inválida" }, { status: 400 });
  }

  // Apply coupon (read-only preview) to the base before simulating installments
  // so the ladder reflects the post-discount amount the buyer will actually pay.
  let baseAmountCents = product.amountCents;
  if (couponCode) {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("preview_coupon", {
      p_code: couponCode,
      p_cohort_slug: cohortSlug,
      p_base_amount_cents: product.amountCents,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.final_amount_cents != null) {
        baseAmountCents = row.final_amount_cents as number;
      }
    }
    // On preview error we silently fall back to the un-discounted base — the
    // charge route is the gate that ultimately validates the coupon, so a
    // mis-typed code here just means the ladder isn't pre-adjusted.
  }

  // 100%-off → no installments to show.
  if (baseAmountCents === 0) {
    return NextResponse.json({ options: [] });
  }

  try {
    const options = await getInstallmentOptions(baseAmountCents, { bin });
    return NextResponse.json({ options });
  } catch (err) {
    console.error("getInstallmentOptions failed:", err);
    return NextResponse.json({ error: "Erro ao consultar parcelamento" }, { status: 502 });
  }
}
