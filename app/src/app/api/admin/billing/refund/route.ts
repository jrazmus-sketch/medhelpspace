import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminAlert, formatBRL } from "@/lib/admin-notify";
import { isSyntheticCouponCharge } from "@/lib/pagbank/order-rules";

// A claim older than this is treated as abandoned (the request died between
// claiming and finishing). Re-running is safe: PagBank refuses to cancel a
// charge twice, and the order only flips from 'paid'.
const REFUND_CLAIM_STALE_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  // Auth + role check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["super_admin", "billing_admin"].includes(profile.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let body: { orderId: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const { orderId } = body;
  if (!orderId) {
    return NextResponse.json({ error: "orderId obrigatório" }, { status: 400 });
  }

  // Reason is optional but recorded for the audit trail. Cap the length so a
  // pasted blob can't bloat the audit_log details JSON.
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  const { data: order } = await admin
    .from("orders")
    .select("id, status, pagbank_charge_id, pagbank_response, user_id, cohort_id, amount_cents, promotion_id")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  if (order.status !== "paid") {
    return NextResponse.json({ error: "Só pedidos pagos podem ser estornados" }, { status: 409 });
  }

  // Card orders persist the charge id at charge-create time; Pix orders only get
  // it once finalize.ts flips them to paid. For older Pix orders predating that
  // fix, recover it from the stored charge snapshot (pagbank_response is the
  // settled PagBankCharge, so .id is the CHAR_… we cancel).
  const responseChargeId =
    (order.pagbank_response as { id?: string } | null)?.id ?? null;
  const chargeId = (order.pagbank_charge_id as string | null) ?? responseChargeId;
  // A 100%-coupon order never reached PagBank: its charge id is a synthetic
  // COUPON_… stub at R$ 0. "Refunding" it is revoking the access — calling
  // PagBank with that id only ever failed, which made these orders unrefundable.
  const couponOnly = isSyntheticCouponCharge(chargeId, order.amount_cents as number);
  if (!chargeId && !couponOnly) {
    return NextResponse.json({ error: "Charge ID do PagBank não encontrado" }, { status: 422 });
  }

  // Claim the order BEFORE touching money. The read above is not a lock: two
  // concurrent requests (a double click, two admins) both saw status='paid' and
  // both asked PagBank to cancel. Only one request can move the claim from
  // empty, so only one reaches PagBank.
  const staleClaim = new Date(Date.now() - REFUND_CLAIM_STALE_MS).toISOString();
  const { data: claimed } = await admin
    .from("orders")
    .update({ refund_claimed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "paid")
    .or(`refund_claimed_at.is.null,refund_claimed_at.lt.${staleClaim}`)
    .select("id");
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: "Este pedido já está sendo estornado." }, { status: 409 });
  }
  const releaseClaim = () => admin.from("orders").update({ refund_claimed_at: null }).eq("id", orderId);

  if (!couponOnly) {
    // Call PagBank refund endpoint
    const env = process.env.PAGBANK_ENVIRONMENT ?? "production";
    const token = env === "sandbox"
      ? process.env.PAGBANK_ACCESS_TOKEN_SANDBOX
      : process.env.PAGBANK_ACCESS_TOKEN;
    const baseUrl = env === "sandbox"
      ? "https://sandbox.api.pagseguro.com"
      : "https://api.pagseguro.com";

    // PagBank requires amount.value on /cancel even for a FULL refund — an empty
    // body is rejected with HTTP 400 ("amount.value required"). We refund the full
    // settled amount (amount_cents was reconciled to equal the charge in
    // finalize.ts), in centavos.
    let pbRes: Response;
    try {
      pbRes = await fetch(`${baseUrl}/charges/${chargeId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: { value: order.amount_cents } }),
      });
    } catch (err) {
      console.error("PagBank refund request failed:", orderId, err);
      await releaseClaim();
      return NextResponse.json({ error: "Não foi possível falar com o PagBank. Tente de novo." }, { status: 502 });
    }

    if (!pbRes.ok) {
      const errBody = await pbRes.text();
      console.error("PagBank refund failed:", pbRes.status, errBody);
      await releaseClaim();
      // Surface PagBank's own validation message (error_messages[].description)
      // so an operator sees *why*, not just the status code.
      let detail = "";
      try {
        const parsed = JSON.parse(errBody) as {
          error_messages?: { description?: string; parameter_name?: string }[];
        };
        detail = (parsed.error_messages ?? [])
          .map((m) => [m.parameter_name, m.description].filter(Boolean).join(": "))
          .filter(Boolean)
          .join("; ");
      } catch {
        /* non-JSON body — fall back to the status code alone */
      }
      return NextResponse.json(
        { error: `PagBank recusou o estorno: ${pbRes.status}${detail ? ` — ${detail}` : ""}` },
        { status: 502 },
      );
    }
  }

  // Flip only from 'paid' — never over a status a concurrent webhook already
  // wrote (e.g. its own 'refunded' for the same cancellation).
  await admin.from("orders").update({ status: "refunded" }).eq("id", orderId).eq("status", "paid");

  // Revoke access — unless ANOTHER paid order still covers this turma (the
  // refunded one was a duplicate payment). Refunding the extra charge must not
  // take away the access the other payment bought.
  const { data: stillPaid } = await admin
    .from("orders")
    .select("id")
    .eq("user_id", order.user_id as string)
    .eq("cohort_id", order.cohort_id as number)
    .eq("status", "paid")
    .neq("id", orderId)
    .limit(1)
    .maybeSingle();
  const keepAccess = !!stillPaid;

  if (!keepAccess) {
    await Promise.all([
      admin
        .from("user_cohort_memberships")
        .delete()
        .eq("user_id", order.user_id as string)
        .eq("cohort_id", order.cohort_id as number),
      // A launch-condition order whose membership was already moved onto the next
      // turma no longer sits on order.cohort_id — revoke the moved row too. Scoped by
      // provenance, so a turma the buyer paid for separately is never touched.
      order.promotion_id != null
        ? admin
            .from("user_cohort_memberships")
            .delete()
            .eq("user_id", order.user_id as string)
            .eq("promotion_id", order.promotion_id as number)
            .eq("rolled_over_from_cohort_id", order.cohort_id as number)
        : Promise.resolve(),
    ]);
  }

  // Audit trail (best-effort — the money has already moved, so a failed log
  // must not surface as a refund failure to the operator).
  const { error: auditErr } = await admin.from("admin_audit_log").insert({
    actor_user_id: user.id,
    action: "order_refunded",
    target_user_id: order.user_id as string,
    details: {
      order_id: orderId,
      charge_id: chargeId,
      amount_cents: order.amount_cents,
      payment_method_charge_id_source: order.pagbank_charge_id ? "column" : "response",
      coupon_only: couponOnly,
      access_kept_by_other_paid_order: keepAccess ? (stillPaid?.id as string) : null,
      reason: reason || null,
    },
  });
  if (auditErr) {
    console.error("Refund audit log failed:", orderId, auditErr);
  }

  // Alert admins of the refund — instant emails to opted-in admins + an
  // admin_alerts row for the daily digest. Best-effort: the money already moved,
  // so a failed alert must not surface as a refund failure to the operator.
  try {
    const [{ data: buyer }, { data: cohort }, { data: actor }] = await Promise.all([
      admin
        .from("profiles")
        .select("email, display_name")
        .eq("id", order.user_id as string)
        .maybeSingle(),
      admin.from("cohorts").select("name").eq("id", order.cohort_id as number).maybeSingle(),
      admin.from("profiles").select("display_name, email").eq("id", user.id).maybeSingle(),
    ]);
    const buyerName =
      ((buyer?.display_name as string | null) ||
        (buyer?.email as string | null)?.split("@")[0] ||
        "Aluno") as string;
    const actorName =
      ((actor?.display_name as string | null) ||
        (actor?.email as string | null)?.split("@")[0] ||
        "Admin") as string;
    await recordAdminAlert({
      event: "refund",
      title: `Estorno — ${cohort?.name ?? "turma"} (${formatBRL(order.amount_cents as number)})`,
      body: `${actorName} estornou a compra de ${buyerName}.`,
      metadata: {
        order_id: orderId,
        charge_id: chargeId,
        amount_cents: order.amount_cents,
        actor_user_id: user.id,
        reason: reason || null,
      },
      contextId: orderId,
      emailVars: {
        buyerName,
        buyerEmail: (buyer?.email as string | null) ?? "—",
        cohortName: (cohort?.name as string | null) ?? "—",
        amount: formatBRL(order.amount_cents as number),
        actorName,
        reason: reason || "—",
        orderId,
      },
    });
  } catch (e) {
    console.error("admin refund alert failed", orderId, e);
  }

  return NextResponse.json({ ok: true });
}
