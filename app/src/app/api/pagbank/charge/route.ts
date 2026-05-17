import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCharge, getWebhookBaseUrl } from "@/lib/pagbank/api";
import type { PagBankChargeRequest } from "@/lib/pagbank/types";
import { finalizePaidOrder } from "@/lib/pagbank/finalize";
import { COHORT_PRODUCTS } from "@/lib/pricing";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: {
    cohortSlug: string;
    paymentMethod: "pix" | "credit_card";
    installments?: number;
    encryptedCard?: string;
    cardHolder?: string;
    cpf?: string; // CPF digits only, required for credit_card
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const { cohortSlug, paymentMethod, installments = 1, encryptedCard, cardHolder, cpf } = body;

  const product = COHORT_PRODUCTS[cohortSlug];
  if (!product) {
    return NextResponse.json({ error: "Turma inválida" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Look up cohort
  const { data: cohort } = await admin
    .from("cohorts")
    .select("id, name")
    .eq("slug", cohortSlug)
    .single();

  if (!cohort) {
    return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });
  }

  // Check for existing active membership — prevent double-buy
  const { data: existingMembership } = await admin
    .from("user_cohort_memberships")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("cohort_id", cohort.id)
    .maybeSingle();

  if (existingMembership) {
    return NextResponse.json({ error: "Você já tem acesso a esta turma" }, { status: 409 });
  }

  // Pix: reuse a still-valid pending order if one exists, so a double-click or
  // page refresh doesn't produce two QR codes the user could accidentally pay.
  // The unique partial index idx_orders_one_pending_pix_per_user_cohort enforces
  // this at the DB level; we expire stale rows here so a long-abandoned order
  // doesn't block a fresh charge.
  if (paymentMethod === "pix") {
    const nowIso = new Date().toISOString();

    await admin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("user_id", user.id)
      .eq("cohort_id", cohort.id)
      .eq("payment_method", "pix")
      .eq("status", "pending")
      .lt("pix_expires_at", nowIso);

    const reusable = await findReusablePixOrder(admin, user.id, cohort.id, nowIso);
    if (reusable) return NextResponse.json(reusable);
  }

  // Create pending order in DB first so we have a reference_id for PagBank
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      user_id: user.id,
      cohort_id: cohort.id,
      amount_cents: product.amountCents,
      currency: "BRL",
      payment_method: paymentMethod,
      status: "pending",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    // 23505 = unique_violation. Concurrent Pix request won the race — return that one.
    if (paymentMethod === "pix" && orderError?.code === "23505") {
      const reusable = await findReusablePixOrder(admin, user.id, cohort.id, new Date().toISOString());
      if (reusable) return NextResponse.json(reusable);
    }
    console.error("Failed to create order:", orderError);
    return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 });
  }

  const webhookUrl = `${getWebhookBaseUrl()}/api/pagbank/webhook`;

  const chargeReq: PagBankChargeRequest = {
    reference_id: order.id,
    description: product.name,
    amount: { value: product.amountCents, currency: "BRL" },
    notification_urls: [webhookUrl],
    ...(cpf ? { customer: { tax_id: cpf } } : {}),
    payment_method:
      paymentMethod === "pix"
        ? { type: "PIX", installments: 1 }
        : {
            type: "CREDIT_CARD",
            installments,
            capture: true,
            card: {
              encrypted: encryptedCard!,
              holder: { name: cardHolder!, tax_id: cpf },
              store: false,
            },
          },
  };

  let charge;
  try {
    charge = await createCharge(chargeReq);
  } catch (err) {
    console.error("PagBank createCharge failed:", err);
    // Mark order as cancelled so it doesn't linger as pending
    await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    return NextResponse.json({ error: "Erro ao processar pagamento" }, { status: 502 });
  }

  // Update order with PagBank charge data
  const qrCode = charge.qr_codes?.[0];
  const ccBrand = charge.payment_method?.card?.brand ?? null;

  // Guard: PIX charge must include the documented QRCODE.PNG link.
  // A missing link means PagBank returned a malformed response — treat as API failure.
  if (paymentMethod === "pix" && qrCode && !qrCode.links?.find((l) => l.rel === "QRCODE.PNG")?.href) {
    console.error("PagBank PIX charge missing QRCODE.PNG link. charge.id:", charge.id, "qrCode:", qrCode);
    await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    return NextResponse.json({ error: "Erro ao processar pagamento (QR indisponível)" }, { status: 502 });
  }

  // Leave status as 'pending' when PAID; finalizePaidOrder atomically transitions
  // it under WHERE status != 'paid' so a concurrent webhook can't trigger the
  // purchase email twice.
  const willFinalize = charge.status === "PAID";

  await admin.from("orders").update({
    pagbank_charge_id: charge.id,
    status: willFinalize ? "pending" : mapChargeStatus(charge.status),
    pix_qr_text: qrCode?.text ?? null,
    // QR code PNG: sandbox has different domain from the stored URL pattern
    pix_qr_image_url: qrCode?.links?.find((l) => l.rel === "QRCODE.PNG")?.href ?? null,
    pix_expires_at: qrCode?.expiration_date ?? null,
    cc_installments: paymentMethod === "credit_card" ? installments : null,
    cc_brand: ccBrand,
    pagbank_response: charge as unknown as Record<string, unknown>,
  }).eq("id", order.id);

  if (willFinalize) {
    await finalizePaidOrder(admin, {
      orderId: order.id,
      userId: user.id,
      cohortId: cohort.id,
      charge,
    });
  }

  return NextResponse.json({
    orderId: order.id,
    chargeId: charge.id,
    status: charge.status,
    // Pix
    pixQrText: qrCode?.text ?? null,
    pixQrImageUrl: qrCode?.links?.find((l) => l.rel === "QRCODE.PNG")?.href ?? null,
    pixExpiresAt: qrCode?.expiration_date ?? null,
    // CC
    ccBrand,
  });
}

function mapChargeStatus(s: string): string {
  switch (s) {
    case "PAID":
    case "AUTHORIZED":
      return "paid";
    case "DECLINED":
      return "declined";
    case "CANCELED":
      return "cancelled";
    case "REFUNDED":
    case "CHARGEBACK":
      return "refunded";
    default:
      return "pending";
  }
}

async function findReusablePixOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  cohortId: number,
  nowIso: string,
) {
  const { data } = await admin
    .from("orders")
    .select("id, pagbank_charge_id, pix_qr_text, pix_qr_image_url, pix_expires_at")
    .eq("user_id", userId)
    .eq("cohort_id", cohortId)
    .eq("payment_method", "pix")
    .eq("status", "pending")
    .gt("pix_expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.pix_qr_text) return null;

  return {
    orderId: data.id,
    chargeId: data.pagbank_charge_id,
    status: "PENDING",
    pixQrText: data.pix_qr_text,
    pixQrImageUrl: data.pix_qr_image_url,
    pixExpiresAt: data.pix_expires_at,
    ccBrand: null,
  };
}
