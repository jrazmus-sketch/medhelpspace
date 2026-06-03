import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCharge, getWebhookBaseUrl, getInstallmentOptions } from "@/lib/pagbank/api";
import type { PagBankChargeRequest } from "@/lib/pagbank/types";
import { finalizePaidOrder } from "@/lib/pagbank/finalize";
import { COHORT_PRODUCTS } from "@/lib/pricing";

export async function POST(request: NextRequest) {
  let body: {
    cohortSlug: string;
    paymentMethod: "pix" | "credit_card";
    installments?: number;
    encryptedCard?: string;
    cardHolder?: string;
    cpf?: string; // CPF digits only, required for credit_card
    cardBin?: string; // first 6 card digits, for brand-accurate installment rates
    // Guest checkout: client sends one of these when the visitor isn't logged in.
    // signup creates the account (auto-confirmed — payment proves the buyer is real);
    // login signs in an existing account before charging.
    signup?: { email: string; password: string; displayName?: string | null };
    login?: { email: string; password: string };
    couponCode?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const {
    cohortSlug,
    paymentMethod,
    installments = 1,
    encryptedCard,
    cardHolder,
    cpf,
    cardBin,
    signup,
    login,
    couponCode,
  } = body;

  const supabase = await createClient();
  let { data: { user } } = await supabase.auth.getUser();

  // Guest path: caller is not logged in but supplied signup or login credentials.
  // We create-and-sign-in (or just sign-in) here so the rest of the charge flow
  // — order insert, RLS checks, membership lookups — runs as an authenticated user.
  if (!user && signup) {
    if (!signup.email || !signup.password) {
      return NextResponse.json({ error: "E-mail e senha são obrigatórios." }, { status: 400 });
    }
    if (signup.password.length < 8) {
      return NextResponse.json({ error: "A senha deve ter no mínimo 8 caracteres." }, { status: 400 });
    }

    const adminAuth = createAdminClient();
    const { error: createErr } = await adminAuth.auth.admin.createUser({
      email: signup.email,
      password: signup.password,
      email_confirm: true, // payment is the real verification
      user_metadata: { display_name: signup.displayName ?? null },
    });
    if (createErr) {
      const msg = createErr.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        return NextResponse.json(
          { error: "Este e-mail já tem conta. Use a opção 'Já tem conta? Entrar'." },
          { status: 400 },
        );
      }
      console.error("Guest signup failed:", createErr);
      return NextResponse.json({ error: "Erro ao criar conta. Tente novamente." }, { status: 400 });
    }

    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: signup.email,
      password: signup.password,
    });
    if (signInErr || !signInData.user) {
      console.error("Post-signup sign-in failed:", signInErr);
      return NextResponse.json({ error: "Conta criada, mas falha ao iniciar sessão." }, { status: 500 });
    }
    user = signInData.user;
  } else if (!user && login) {
    if (!login.email || !login.password) {
      return NextResponse.json({ error: "E-mail e senha são obrigatórios." }, { status: 400 });
    }
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: login.email,
      password: login.password,
    });
    if (signInErr || !signInData.user) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 400 });
    }
    user = signInData.user;
  }

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

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
    const reqCouponCode = couponCode?.trim() ? couponCode.trim().toUpperCase() : null;

    // Cancel stale (expired) pending Pix orders, releasing any coupon they hold so
    // an abandoned QR doesn't permanently burn the buyer's one-use code or a cap slot.
    const { data: expired } = await admin
      .from("orders")
      .select("id")
      .eq("user_id", user.id)
      .eq("cohort_id", cohort.id)
      .eq("payment_method", "pix")
      .eq("status", "pending")
      .lt("pix_expires_at", nowIso);
    const expiredIds = (expired ?? []).map((o: { id: string }) => o.id);
    if (expiredIds.length) {
      await admin.from("orders").update({ status: "cancelled" }).in("id", expiredIds);
      await releaseRedemptionsForOrders(admin, expiredIds);
    }

    // Reuse a still-valid pending Pix order ONLY when its coupon state matches the
    // current request. If the buyer added, changed, or removed a coupon since
    // generating the QR, the existing QR is at the wrong amount — supersede it
    // (cancel + release its redemption) and fall through to mint a fresh,
    // correctly-priced order below.
    const reusable = await findReusablePixOrder(admin, user.id, cohort.id, nowIso);
    if (reusable) {
      if ((reusable.couponCode ?? null) === reqCouponCode) {
        return NextResponse.json(reusable);
      }
      await admin.from("orders").update({ status: "cancelled" }).eq("id", reusable.orderId);
      await releaseRedemptionsForOrders(admin, [reusable.orderId]);
    }
  }

  // Coupon redemption — atomic via redeem_coupon RPC (locks the coupon row,
  // inserts the redemption, bumps the counter). UNIQUE(coupon_id, user_id) on
  // coupon_redemptions enforces one-use-per-person at the DB level. We redeem
  // BEFORE order insert so that the redemption row is the gating constraint;
  // if anything below fails, the cleanup branch deletes the redemption + decrements
  // the counter so the user can try again with the same coupon.
  const baseAmountCents = product.amountCents;
  let couponId: number | null = null;
  let couponRedemptionId: number | null = null;
  let discountCents = 0;
  let baseAfterDiscount = baseAmountCents;
  let isFullDiscount = false;

  if (couponCode && couponCode.trim()) {
    const { data: rpcData, error: rpcErr } = await admin.rpc("redeem_coupon", {
      p_code: couponCode.trim().toUpperCase(),
      p_user_id: user.id,
      p_cohort_slug: cohortSlug,
      p_base_amount_cents: baseAmountCents,
    });
    if (rpcErr) {
      const code = (rpcErr.message ?? "").match(/COUPON_[A-Z_]+/)?.[0];
      const map: Record<string, string> = {
        COUPON_NOT_FOUND: "Cupom não encontrado.",
        COUPON_INACTIVE: "Cupom indisponível.",
        COUPON_NOT_YET_VALID: "Este cupom ainda não está válido.",
        COUPON_EXPIRED: "Cupom expirado.",
        COUPON_FULLY_REDEEMED: "Cupom esgotado.",
        COUPON_NOT_VALID_FOR_COHORT: "Cupom não é válido para esta turma.",
      };
      // unique_violation on (coupon_id, user_id) → user already used this code
      if (rpcErr.code === "23505") {
        return NextResponse.json({ error: "Você já usou este cupom." }, { status: 400 });
      }
      if (code && map[code]) {
        return NextResponse.json({ error: map[code] }, { status: 400 });
      }
      console.error("redeem_coupon failed:", rpcErr);
      return NextResponse.json({ error: "Erro ao aplicar cupom." }, { status: 500 });
    }
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!row) {
      return NextResponse.json({ error: "Cupom não encontrado." }, { status: 400 });
    }
    couponId = row.coupon_id as number;
    couponRedemptionId = row.redemption_id as number;
    discountCents = row.discount_cents as number;
    baseAfterDiscount = row.final_amount_cents as number;
    isFullDiscount = row.is_full_discount as boolean;
  }

  // Determine the authoritative amount to charge. For credit-card installments > 1,
  // the buyer pays PagBank's financing interest, so we re-simulate server-side and
  // charge the interest-inclusive total against the post-discount base. The client
  // never dictates the amount — it's recomputed here from the trusted base price.
  let chargeAmountCents = baseAfterDiscount;
  let interestCents = 0;

  if (!isFullDiscount && paymentMethod === "credit_card" && installments > 1) {
    let options;
    try {
      options = await getInstallmentOptions(baseAfterDiscount, { bin: cardBin });
    } catch (err) {
      console.error("Installment simulation failed:", err);
      await rollbackCouponRedemption(admin, couponId, couponRedemptionId);
      return NextResponse.json({ error: "Erro ao calcular o parcelamento" }, { status: 502 });
    }
    const plan = options.find((o) => o.installments === installments);
    if (!plan) {
      await rollbackCouponRedemption(admin, couponId, couponRedemptionId);
      return NextResponse.json(
        { error: "Parcelamento indisponível para este cartão" },
        { status: 400 },
      );
    }
    chargeAmountCents = plan.totalValue;
    interestCents = plan.totalValue - baseAfterDiscount;
  }

  // Create pending order. For 100%-off, we insert it as 'paid' immediately
  // (no PagBank round-trip below) and short-circuit to finalizePaidOrder.
  const initialStatus = isFullDiscount ? "pending" : "pending"; // both start pending; full-discount transitions below
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      user_id: user.id,
      cohort_id: cohort.id,
      amount_cents: chargeAmountCents,
      base_amount_cents: baseAmountCents,
      discount_cents: discountCents,
      coupon_id: couponId,
      interest_cents: interestCents,
      currency: "BRL",
      payment_method: paymentMethod,
      status: initialStatus,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    // 23505 = unique_violation. Concurrent Pix request won the race — return that one.
    if (paymentMethod === "pix" && orderError?.code === "23505" && !couponCode) {
      const reusable = await findReusablePixOrder(admin, user.id, cohort.id, new Date().toISOString());
      if (reusable) return NextResponse.json(reusable);
    }
    console.error("Failed to create order:", orderError);
    await rollbackCouponRedemption(admin, couponId, couponRedemptionId);
    return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 });
  }

  // Link the redemption row to the order so admins can trace it.
  if (couponRedemptionId) {
    await admin
      .from("coupon_redemptions")
      .update({ order_id: order.id })
      .eq("id", couponRedemptionId);
  }

  // 100%-off short-circuit: skip PagBank entirely, finalize as paid right here.
  if (isFullDiscount) {
    await finalizePaidOrder(admin, {
      orderId: order.id as string,
      userId: user.id,
      cohortId: cohort.id as number,
      // No real charge; pass a minimal stub so finalizePaidOrder can record it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      charge: { id: `COUPON_${couponId}_${order.id}`, status: "PAID", amount: { value: 0, currency: "BRL" } } as any,
    });
    return NextResponse.json({
      orderId: order.id,
      chargeId: null,
      status: "PAID",
      pixQrText: null,
      pixQrImageUrl: null,
      pixExpiresAt: null,
      ccBrand: null,
    });
  }

  const webhookUrl = `${getWebhookBaseUrl()}/api/pagbank/webhook`;

  const chargeReq: PagBankChargeRequest = {
    reference_id: order.id,
    description: product.name,
    amount: { value: chargeAmountCents, currency: "BRL" },
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
    // Release the coupon redemption so the buyer can retry — the order never
    // got off the ground, so this code shouldn't count as used.
    await rollbackCouponRedemption(admin, couponId, couponRedemptionId);
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
    await rollbackCouponRedemption(admin, couponId, couponRedemptionId);
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

// Undo a coupon redemption when the payment flow fails downstream — delete the
// redemption row and decrement the counter so the buyer can retry the same code.
// Best-effort: errors are logged but not surfaced (the user's primary error is
// the payment failure, not the cleanup).
async function rollbackCouponRedemption(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  couponId: number | null,
  redemptionId: number | null,
) {
  if (!redemptionId || !couponId) return;
  const { error: delErr } = await admin
    .from("coupon_redemptions")
    .delete()
    .eq("id", redemptionId);
  if (delErr) {
    console.error("rollbackCouponRedemption: delete failed", redemptionId, delErr);
    return;
  }
  const { error: decErr } = await admin.rpc("decrement_coupon_counter", {
    p_coupon_id: couponId,
  });
  if (decErr) {
    console.error("rollbackCouponRedemption: decrement failed", couponId, decErr);
  }
}

// Release coupon redemptions tied to a set of orders being cancelled (expired or
// superseded pending Pix orders), so an abandoned order doesn't permanently consume
// the buyer's one-use coupon or a global cap slot. Mirrors rollbackCouponRedemption
// but keyed by order id, for the bulk Pix-cleanup paths. Best-effort.
async function releaseRedemptionsForOrders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  orderIds: string[],
) {
  if (!orderIds.length) return;
  const { data: reds, error } = await admin
    .from("coupon_redemptions")
    .select("id, coupon_id")
    .in("order_id", orderIds);
  if (error || !reds?.length) return;

  const { error: delErr } = await admin
    .from("coupon_redemptions")
    .delete()
    .in("id", reds.map((r: { id: number }) => r.id));
  if (delErr) {
    console.error("releaseRedemptionsForOrders: delete failed", orderIds, delErr);
    return;
  }
  for (const r of reds as Array<{ coupon_id: number }>) {
    const { error: decErr } = await admin.rpc("decrement_coupon_counter", { p_coupon_id: r.coupon_id });
    if (decErr) console.error("releaseRedemptionsForOrders: decrement failed", r.coupon_id, decErr);
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
    .select("id, pagbank_charge_id, pix_qr_text, pix_qr_image_url, pix_expires_at, coupon:coupons(code)")
    .eq("user_id", userId)
    .eq("cohort_id", cohortId)
    .eq("payment_method", "pix")
    .eq("status", "pending")
    .gt("pix_expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.pix_qr_text) return null;

  // Normalized code of the coupon applied to this pending order (null if none) —
  // the caller compares it against the requested code to decide reuse vs supersede.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const couponCode = ((data as any).coupon?.code as string | undefined)?.toUpperCase() ?? null;

  return {
    orderId: data.id,
    chargeId: data.pagbank_charge_id,
    status: "PENDING",
    pixQrText: data.pix_qr_text,
    pixQrImageUrl: data.pix_qr_image_url,
    pixExpiresAt: data.pix_expires_at,
    couponCode,
    ccBrand: null,
  };
}
