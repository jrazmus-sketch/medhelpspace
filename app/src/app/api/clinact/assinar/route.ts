import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/pagbank/rate-limit";
import { onlyDigits } from "@/lib/br";
import { CLINACT_PLANS, type ClinactPlanKey } from "@/lib/clinact/plans";
import { subscribeToClinact, subscriptionsUnavailable } from "@/lib/clinact/subscribe";

// ClinAct subscription checkout.
//
// Deliberately much smaller than the Revalida charge route: no guest checkout
// (signing up first is the decided flow), no coupons, no installments — a
// subscription is charged in full each period — and no NF-e billing address,
// which PagBank's subscriber does not ask for.
//
// THE CVV. PagBank refuses POST /subscriptions without `security_code` in plain
// text, even though the card itself arrives encrypted. So it is accepted here,
// passed straight through, and never stored, logged or attached to an error.
// See lib/pagbank/subscriptions.ts for the evidence behind that.
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um instante." }, { status: 429 });
  }

  // The live site must never charge against the sandbox — see
  // subscriptionsUnavailable().
  if (subscriptionsUnavailable()) {
    return NextResponse.json(
      { error: "Assinatura indisponível no momento." },
      { status: 503 },
    );
  }

  let body: {
    planKey?: string;
    encryptedCard?: string;
    securityCode?: string;
    holderName?: string;
    cpf?: string;
    attemptId?: string;
    phone?: { area?: string; number?: string };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  // Signing in is required: the subscription is tied to an account, and the
  // access it grants is written against that user.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login para assinar." }, { status: 401 });
  }

  const planKey = body.planKey as ClinactPlanKey | undefined;
  if (!planKey || !(planKey in CLINACT_PLANS)) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }
  if (!body.encryptedCard) {
    return NextResponse.json({ error: "Dados do cartão não recebidos." }, { status: 400 });
  }
  const securityCode = (body.securityCode ?? "").trim();
  if (securityCode.length < 3 || securityCode.length > 4) {
    return NextResponse.json({ error: "Código de segurança inválido." }, { status: 400 });
  }
  const holderName = (body.holderName ?? "").trim();
  if (holderName.length < 3) {
    return NextResponse.json({ error: "Informe o nome como está no cartão." }, { status: 400 });
  }
  const cpf = onlyDigits(body.cpf ?? "");
  if (cpf.length !== 11) {
    return NextResponse.json({ error: "CPF inválido." }, { status: 400 });
  }
  // The browser generates this once per checkout attempt and keeps it across
  // retries: it becomes the reference_id and the idempotency keys, which is
  // what stops a double submit from becoming a double charge.
  const attemptId = (body.attemptId ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
  if (attemptId.length < 8) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  // PagBank refuses to create a subscriber without a phone, so this is not
  // optional however much we would prefer a shorter form.
  const area = onlyDigits(body.phone?.area ?? "");
  const phoneNumber = onlyDigits(body.phone?.number ?? "");
  if (area.length !== 2 || phoneNumber.length < 8 || phoneNumber.length > 9) {
    return NextResponse.json({ error: "Informe um celular com DDD." }, { status: 400 });
  }
  const phone = { area, number: phoneNumber };

  const result = await subscribeToClinact({
    userId: user.id,
    email: user.email ?? "",
    name: holderName,
    taxId: cpf,
    planKey,
    encryptedCard: body.encryptedCard,
    securityCode,
    attemptId,
    phone,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
