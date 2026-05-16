import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCharge, getPagBankEnv, getWebhookBaseUrl } from "@/lib/pagbank/api";
import type { PagBankChargeRequest } from "@/lib/pagbank/types";

// Hardcoded product config — prices are a business decision, not a DB concern
const COHORT_PRODUCTS: Record<string, { name: string; amountCents: number }> = {
  "revalida-2026-2": { name: "Revalida 2026.2", amountCents: 399000 },
  "revalida-2027-1": { name: "Revalida 2027.1", amountCents: 499000 },
};

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
    console.error("Failed to create order:", orderError);
    return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 });
  }

  const webhookUrl = `${getWebhookBaseUrl()}/api/pagbank/webhook`;
  const env = getPagBankEnv();

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
  const isSandbox = env === "sandbox";

  await admin.from("orders").update({
    pagbank_charge_id: charge.id,
    status: mapChargeStatus(charge.status),
    pix_qr_text: qrCode?.text ?? null,
    // QR code PNG: sandbox has different domain from the stored URL pattern
    pix_qr_image_url: qrCode
      ? qrCode.links?.find((l) => l.rel === "QRCODE.PNG")?.href ??
        `https://${isSandbox ? "sandbox." : ""}api.pagseguro.com/qrcode/${qrCode.id}/png`
      : null,
    pix_expires_at: qrCode?.expiration_date ?? null,
    cc_installments: paymentMethod === "credit_card" ? installments : null,
    cc_brand: ccBrand,
    pagbank_response: charge as unknown as Record<string, unknown>,
  }).eq("id", order.id);

  // If CC was immediately paid (rare but possible), provision now
  if (charge.status === "PAID") {
    await provisionMembership(admin, user.id, cohort.id);
  }

  return NextResponse.json({
    orderId: order.id,
    chargeId: charge.id,
    status: charge.status,
    // Pix
    pixQrText: qrCode?.text ?? null,
    pixQrImageUrl: qrCode
      ? qrCode.links?.find((l) => l.rel === "QRCODE.PNG")?.href ??
        `https://${isSandbox ? "sandbox." : ""}api.pagseguro.com/qrcode/${qrCode.id}/png`
      : null,
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

async function provisionMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  cohortId: number,
) {
  await admin
    .from("user_cohort_memberships")
    .upsert({ user_id: userId, cohort_id: cohortId }, { onConflict: "user_id,cohort_id" });
}
