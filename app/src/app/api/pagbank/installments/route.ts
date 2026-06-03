import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInstallmentOptions } from "@/lib/pagbank/api";
import { COHORT_PRODUCTS } from "@/lib/pricing";

// Live installment ladder for the checkout card form. Returns the per-installment
// values with buyer-paid interest, exactly as PagBank will charge them. Pass the
// card BIN (first 6 digits) once known for brand-accurate rates.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const cohortSlug = request.nextUrl.searchParams.get("cohortSlug") ?? "";
  const bin = request.nextUrl.searchParams.get("bin") ?? undefined;

  const product = COHORT_PRODUCTS[cohortSlug];
  if (!product) {
    return NextResponse.json({ error: "Turma inválida" }, { status: 400 });
  }

  try {
    const options = await getInstallmentOptions(product.amountCents, { bin });
    return NextResponse.json({ options });
  } catch (err) {
    console.error("getInstallmentOptions failed:", err);
    return NextResponse.json({ error: "Erro ao consultar parcelamento" }, { status: 502 });
  }
}
