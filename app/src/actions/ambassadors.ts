"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayKeyBR } from "@/lib/br-date";

// Admin actions for the Programa de Embaixadores.
//
// Two conventions this file follows, both learned the hard way:
//
//   1. Only async functions are exported. A "use server" module that exports a
//      type or a const crashes every route that imports it.
//   2. Expected outcomes are RETURNED as discriminated values, never thrown.
//      Next.js redacts thrown Server Action messages in production, so
//      `throw new Error("BELOW_MINIMUM")` + a client-side message match works in
//      dev and silently degrades to a generic error on Vercel. `throw` is
//      reserved here for genuinely unexpected failures (auth, real DB errors)
//      where a generic client message is the right outcome anyway.
//
// The monthly cycle is clause 7.5 of the contract, in order:
//   closing   → commissions released up to the last day of the previous month
//   statement → available by the 2nd business day (this is `gerarFechamento`)
//   NFS-e     → sent by the ambassador up to the 5th business day
//   payment   → by the 15th (this is `registrarPagamento`)
//
// Money-facing, so everything is restricted to the billing tier.

const BILLING_ROLES = ["super_admin", "billing_admin"];

/** Minimum ordinary payout (cl. 7.2). */
const MIN_PAYOUT_CENTS = 20000;

async function requireBilling() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !BILLING_ROLES.includes(profile.role as string)) {
    throw new Error("Unauthorized");
  }
  return { userId: user.id, admin };
}

async function writeAudit(
  actorId: string,
  action: string,
  details: Record<string, unknown>,
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("admin_audit_log")
    .insert({ actor_user_id: actorId, action, details });
  // Never block the operation on its own audit entry.
  if (error) console.error("ambassador audit failed", action, error);
}

/** First day of the previous month, in the Brazilian calendar. */
function previousMonthStartBR(): string {
  const [y, m] = todayKeyBR().split("-").map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
}

/** Exclusive upper bound: first day of the month after `monthStart`. */
function nextMonthStart(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export async function criarEmbaixador(input: {
  userEmail: string;
  code: string;
  profileType: "embaixador" | "embaixador_aluno";
  accessCohortId: number | null;
  commissionRateBps: number;
  contractEndsOn: string | null;
  couponId: number | null;
}) {
  const { userId, admin } = await requireBilling();

  const code = input.code.trim().toUpperCase();
  if (!code) return { ok: false as const, error: "CODE_REQUIRED" as const };
  if (!/^[A-Z0-9._-]+$/.test(code)) {
    return { ok: false as const, error: "CODE_INVALID" as const };
  }
  if (input.commissionRateBps < 0 || input.commissionRateBps > 10000) {
    return { ok: false as const, error: "RATE_OUT_OF_RANGE" as const };
  }

  // The ambassador needs an account before they can see their panel.
  //
  // The match stays case-insensitive because addresses are stored as the member
  // typed them, but LIKE metacharacters are refused rather than escaped: none of
  // them belong in an address, and left in, "%@gmail.com" would silently make an
  // ambassador out of whichever account happened to match first.
  const email = input.userEmail.trim();
  if (/[%_*\\]/.test(email)) return { ok: false as const, error: "USER_NOT_FOUND" as const };
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (!profile) return { ok: false as const, error: "USER_NOT_FOUND" as const };

  const { error } = await admin.from("ambassadors").insert({
    user_id: profile.id,
    code,
    profile_type: input.profileType,
    // Only the embaixador-aluno receives free course access (cl. 2.2), so a
    // turma de acesso on any other profile would be meaningless.
    access_cohort_id:
      input.profileType === "embaixador_aluno" ? input.accessCohortId : null,
    commission_rate_bps: input.commissionRateBps,
    contract_ends_on: input.contractEndsOn,
    coupon_id: input.couponId,
    status: "pending",
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false as const, error: "CODE_OR_USER_TAKEN" as const };
    }
    throw new Error(error.message);
  }

  await writeAudit(userId, "ambassador_create", { code, email: input.userEmail });
  revalidatePath("/admin/embaixadores");
  return { ok: true as const };
}

export async function atualizarEmbaixador(
  ambassadorId: number,
  input: {
    status: "pending" | "active" | "terminated";
    commissionRateBps: number;
    contractEndsOn: string | null;
    couponId: number | null;
    terminationKind: "voluntaria" | "nao_renovacao" | "justa_causa" | null;
    terminationGround:
      | "fraude"
      | "compartilhamento_conteudo"
      | "violacao_credenciais"
      | "falta_uso_curso"
      | null;
    terminationReason: string | null;
  },
) {
  const { userId, admin } = await requireBilling();
  if (input.commissionRateBps < 0 || input.commissionRateBps > 10000) {
    return { ok: false as const, error: "RATE_OUT_OF_RANGE" as const };
  }

  const { data: before } = await admin
    .from("ambassadors")
    .select("code, status, commission_rate_bps, contract_ends_on, profile_type, access_cohort_id")
    .eq("id", ambassadorId)
    .maybeSingle();
  if (!before) return { ok: false as const, error: "NOT_FOUND" as const };

  // Activation is the gate, not creation: the coupon and the link only become
  // visible once active, so an ambassador must not reach that state without the
  // 5% coupon actually bound to them. Activating without it is how a sale gets
  // made that generates no commission — the failure Karina flagged (cl. 3.1).
  if (input.status === "active") {
    if (!input.couponId) {
      return { ok: false as const, error: "COUPON_REQUIRED" as const };
    }
    // cl. 1.4 / 2.2: the turma de acesso is what the free access is scoped to,
    // so an embaixador-aluno without one has an unresolvable benefit.
    if (before.profile_type === "embaixador_aluno" && !before.access_cohort_id) {
      return { ok: false as const, error: "ACCESS_COHORT_REQUIRED" as const };
    }
  }

  // cl. 12.6 limits immediate loss of course access to four enumerated grounds,
  // all tied to use of the course. Refusing a bare "justa causa" here is what
  // stops access being cut on an unsupported marking.
  if (input.status === "terminated") {
    if (!input.terminationKind) {
      return { ok: false as const, error: "TERMINATION_KIND_REQUIRED" as const };
    }
    if (input.terminationKind === "justa_causa" && !input.terminationGround) {
      return { ok: false as const, error: "TERMINATION_GROUND_REQUIRED" as const };
    }
  }

  const isTerminating = input.status === "terminated";
  const patch: Record<string, unknown> = {
    status: input.status,
    commission_rate_bps: input.commissionRateBps,
    contract_ends_on: input.contractEndsOn,
    coupon_id: input.couponId,
    termination_kind: isTerminating ? input.terminationKind : null,
    termination_ground:
      isTerminating && input.terminationKind === "justa_causa"
        ? input.terminationGround
        : null,
    // Kept in sync for the existing reads; the pair above is the authority.
    terminated_for_cause: isTerminating && input.terminationKind === "justa_causa",
    termination_reason: isTerminating ? input.terminationReason : null,
  };
  // Stamp the transition timestamps only as they actually happen, so a later
  // edit can't quietly rewrite when someone was activated or terminated.
  if (before?.status !== "active" && input.status === "active") {
    patch.activated_at = new Date().toISOString();
  }
  if (before?.status !== "terminated" && input.status === "terminated") {
    patch.terminated_at = new Date().toISOString();
  }

  const { error } = await admin.from("ambassadors").update(patch).eq("id", ambassadorId);
  if (error) throw new Error(error.message);

  await writeAudit(userId, "ambassador_update", {
    ambassador_id: ambassadorId,
    code: before?.code ?? null,
    termination_kind: isTerminating ? input.terminationKind : null,
    termination_ground: isTerminating ? input.terminationGround : null,
    changes: {
      status: { before: before?.status ?? null, after: input.status },
      commission_rate_bps: {
        before: before?.commission_rate_bps ?? null,
        after: input.commissionRateBps,
      },
    },
  });
  revalidatePath("/admin/embaixadores");
  return { ok: true as const };
}

/**
 * Monthly closing (cl. 7.5): gather every released commission not yet in a
 * payout and open one for the reference month.
 *
 * `isFinalSettlement` bypasses the R$200 minimum, which is what clause 7.3
 * requires when a contract ends — the balance is paid however small.
 */
export async function gerarFechamento(
  ambassadorId: number,
  opts?: { referenceMonth?: string; isFinalSettlement?: boolean },
) {
  const { userId, admin } = await requireBilling();

  const referenceMonth = opts?.referenceMonth ?? previousMonthStartBR();
  const isFinal = opts?.isFinalSettlement ?? false;
  const cutoff = nextMonthStart(referenceMonth);

  // Closing covers commissions RELEASED up to the end of the reference month.
  // Anything released later belongs to the next cycle, not this one.
  const { data: rows, error: selErr } = await admin
    .from("commissions")
    .select("id, amount_cents, released_at")
    .eq("ambassador_id", ambassadorId)
    .eq("status", "liberada")
    .is("payout_id", null)
    .lt("released_at", cutoff);
  if (selErr) throw new Error(selErr.message);

  if (!rows || rows.length === 0) {
    return { ok: false as const, error: "NOTHING_TO_SETTLE" as const };
  }

  // Negative adjustments are in this set too, so a chargeback reduces the
  // payout rather than being invoiced separately.
  const total = rows.reduce((acc, r) => acc + (r.amount_cents as number), 0);
  if (total <= 0) return { ok: false as const, error: "BALANCE_NOT_POSITIVE" as const };
  if (!isFinal && total < MIN_PAYOUT_CENTS) {
    return { ok: false as const, error: "BELOW_MINIMUM" as const };
  }

  const { data: payout, error: insErr } = await admin
    .from("payouts")
    .insert({
      ambassador_id: ambassadorId,
      reference_month: referenceMonth,
      total_cents: total,
      status: "aberto",
      is_final_settlement: isFinal,
    })
    .select("id")
    .single();
  if (insErr) {
    if (insErr.code === "23505") {
      return { ok: false as const, error: "MONTH_ALREADY_SETTLED" as const };
    }
    throw new Error(insErr.message);
  }

  // Attach the commissions and move them to "em análise" — the contract's own
  // wording for a note and request under verification.
  const ids = rows.map((r) => r.id as number);
  const { error: updErr } = await admin
    .from("commissions")
    .update({ payout_id: payout.id, status: "em_analise" })
    .in("id", ids)
    .eq("status", "liberada");
  if (updErr) throw new Error(updErr.message);

  await writeAudit(userId, "ambassador_payout_open", {
    ambassador_id: ambassadorId,
    payout_id: payout.id,
    reference_month: referenceMonth,
    total_cents: total,
    commissions: ids.length,
    final_settlement: isFinal,
  });
  revalidatePath("/admin/embaixadores");
  return { ok: true as const, payoutId: payout.id as number, totalCents: total };
}

/** Record the NFS-e received by e-mail (first cycle is manual — cl. 7.4). */
export async function registrarNota(
  payoutId: number,
  input: { nfNumber: string | null; nfUrl: string | null },
) {
  const { userId, admin } = await requireBilling();
  const { error } = await admin
    .from("payouts")
    .update({
      nf_number: input.nfNumber,
      nf_url: input.nfUrl,
      nf_received_at: new Date().toISOString(),
      status: "em_analise",
      rejection_reason: null,
    })
    .eq("id", payoutId);
  if (error) throw new Error(error.message);

  await writeAudit(userId, "ambassador_payout_nf", {
    payout_id: payoutId,
    nf_number: input.nfNumber,
  });
  revalidatePath("/admin/embaixadores");
  return { ok: true as const };
}

/**
 * Reject the note (cl. 7.6). The rejected payout stays as the record of what
 * happened, but its commissions are DETACHED and returned to 'liberada'.
 *
 * That detachment is the whole point. A closing only ever picks up commissions
 * with `payout_id IS NULL`, so leaving them attached to a rejected payout
 * stranded the balance until someone noticed and reopened by hand — while both
 * the panel and the Guia promise "nota atrasada ou corrigida: processada no
 * ciclo seguinte, sem perda ou expiração do saldo" (cl. 7.6, cl. 12.5).
 *
 * The balance rolls into the next month's closing, which is a different
 * reference month, so the one-payout-per-month index is not in the way.
 */
export async function rejeitarNota(payoutId: number, reason: string) {
  const { userId, admin } = await requireBilling();
  if (!reason.trim()) return { ok: false as const, error: "REASON_REQUIRED" as const };

  const { data: payout } = await admin
    .from("payouts")
    .select("id, status")
    .eq("id", payoutId)
    .maybeSingle();
  if (!payout) return { ok: false as const, error: "PAYOUT_NOT_FOUND" as const };
  // Once paid, a correction is a negative adjustment, never a rewrite (cl. 6).
  if (payout.status === "paga") return { ok: false as const, error: "ALREADY_PAID" as const };

  const { error } = await admin
    .from("payouts")
    .update({ status: "rejeitada", rejection_reason: reason.trim() })
    .eq("id", payoutId)
    .neq("status", "paga");
  if (error) throw new Error(error.message);

  // Release the commissions back into the pool so the next closing sweeps them.
  const { data: freed, error: cErr } = await admin
    .from("commissions")
    .update({ payout_id: null, status: "liberada" })
    .eq("payout_id", payoutId)
    .select("id");
  if (cErr) throw new Error(cErr.message);

  await writeAudit(userId, "ambassador_payout_rejected", {
    payout_id: payoutId,
    reason,
    commissions_returned: freed?.length ?? 0,
  });
  revalidatePath("/admin/embaixadores");
  return { ok: true as const, returned: freed?.length ?? 0 };
}

/** Payment made (by the 15th, cl. 7.5). Closes the payout and its commissions. */
export async function registrarPagamento(payoutId: number) {
  const { userId, admin } = await requireBilling();

  const { data: payout } = await admin
    .from("payouts")
    .select("id, ambassador_id, total_cents, status")
    .eq("id", payoutId)
    .maybeSingle();
  if (!payout) return { ok: false as const, error: "PAYOUT_NOT_FOUND" as const };
  if (payout.status === "paga") {
    return { ok: false as const, error: "ALREADY_PAID" as const };
  }

  const { error } = await admin
    .from("payouts")
    .update({ status: "paga", paid_at: new Date().toISOString() })
    .eq("id", payoutId)
    .neq("status", "paga");
  if (error) throw new Error(error.message);

  const { error: cErr } = await admin
    .from("commissions")
    .update({ status: "paga" })
    .eq("payout_id", payoutId);
  if (cErr) throw new Error(cErr.message);

  await writeAudit(userId, "ambassador_payout_paid", {
    payout_id: payoutId,
    ambassador_id: payout.ambassador_id,
    total_cents: payout.total_cents,
  });
  revalidatePath("/admin/embaixadores");
  return { ok: true as const };
}

/**
 * Undo a closing that shouldn't have happened. Only while nothing is paid —
 * once money has moved, the correction is a negative adjustment, not a rewrite
 * of history (cl. 6).
 */
export async function reabrirFechamento(payoutId: number) {
  const { userId, admin } = await requireBilling();

  const { data: payout } = await admin
    .from("payouts")
    .select("id, ambassador_id, status")
    .eq("id", payoutId)
    .maybeSingle();
  if (!payout) return { ok: false as const, error: "PAYOUT_NOT_FOUND" as const };
  if (payout.status === "paga") {
    return { ok: false as const, error: "ALREADY_PAID" as const };
  }

  const { error: cErr } = await admin
    .from("commissions")
    .update({ payout_id: null, status: "liberada" })
    .eq("payout_id", payoutId);
  if (cErr) throw new Error(cErr.message);

  const { error } = await admin.from("payouts").delete().eq("id", payoutId);
  if (error) throw new Error(error.message);

  await writeAudit(userId, "ambassador_payout_reopened", {
    payout_id: payoutId,
    ambassador_id: payout.ambassador_id,
  });
  revalidatePath("/admin/embaixadores");
  return { ok: true as const };
}

/**
 * Post a manual adjustment to the ledger — the mechanism for a PARTIAL refund.
 *
 * `orders` has no partial state (status is all-or-nothing) and no refunded-amount
 * column, so the platform cannot compute a proportional reversal on its own.
 * Rather than build partial refunds into checkout — outside the pilot's scope —
 * the correction is posted here against the original order, which is what the
 * ledger's `adjustment` kind already exists for (cl. 6).
 *
 * Enter the amount to REVERSE as a positive number; it is stored negative so the
 * ledger still sums to the balance. It lands 'liberada' and therefore joins the
 * next closing, reducing that payout instead of being invoiced separately.
 *
 * Guarded against the double-discount Karina asked about: an order whose sale
 * commission is already 'cancelada' has been reversed in full by the trigger, so
 * adjusting it again would take the money twice.
 */
export async function registrarAjuste(
  ambassadorId: number,
  input: { reverseCents: number; reason: string; orderId: string | null },
) {
  const { userId, admin } = await requireBilling();

  const reason = input.reason.trim();
  if (!reason) return { ok: false as const, error: "REASON_REQUIRED" as const };
  if (!Number.isInteger(input.reverseCents) || input.reverseCents <= 0) {
    return { ok: false as const, error: "AMOUNT_INVALID" as const };
  }

  let rateBps = 0;
  if (input.orderId) {
    const { data: sale } = await admin
      .from("commissions")
      .select("id, ambassador_id, amount_cents, status, rate_bps")
      .eq("order_id", input.orderId)
      .eq("kind", "sale")
      .maybeSingle();
    if (!sale) return { ok: false as const, error: "ORDER_NOT_ATTRIBUTED" as const };
    if (sale.ambassador_id !== ambassadorId) {
      return { ok: false as const, error: "ORDER_OTHER_AMBASSADOR" as const };
    }
    if (sale.status === "cancelada") {
      return { ok: false as const, error: "ALREADY_FULLY_REVERSED" as const };
    }
    if (input.reverseCents > (sale.amount_cents as number)) {
      return { ok: false as const, error: "EXCEEDS_COMMISSION" as const };
    }
    rateBps = sale.rate_bps as number;
  }

  const { error } = await admin.from("commissions").insert({
    ambassador_id: ambassadorId,
    order_id: input.orderId,
    kind: "adjustment",
    status: "liberada",
    base_amount_cents: 0,
    rate_bps: rateBps,
    amount_cents: -input.reverseCents,
    confirmed_at: new Date().toISOString(),
    release_on: todayKeyBR(),
    released_at: new Date().toISOString(),
    notes: reason,
  });
  if (error) throw new Error(error.message);

  await writeAudit(userId, "ambassador_adjustment", {
    ambassador_id: ambassadorId,
    order_id: input.orderId,
    reverse_cents: input.reverseCents,
    reason,
  });
  revalidatePath("/admin/embaixadores");
  return { ok: true as const };
}

/**
 * Confirm that the embaixador-aluno's free course access has been removed
 * (cl. 12.6). Removal stays a deliberate human act through the pilot — this
 * records it and performs the one narrow deletion it is allowed to.
 *
 * The hazard this guards against: `user_cohort_memberships` carries no source
 * column, so a membership granted by this programme is indistinguishable from
 * one somebody paid for. Deleting blind would take away purchased access, which
 * is the single thing Karina ruled out. So a paid order for that same cohort
 * short-circuits the deletion: the benefit is closed for the record, the access
 * stays, and the note says why.
 *
 * Scope is deliberately narrow — one row of one cohort. It never touches the
 * account, the profile, other cohorts, or any other product.
 */
export async function confirmarRetiradaAcesso(ambassadorId: number) {
  const { userId, admin } = await requireBilling();

  const { data: amb } = await admin
    .from("ambassadors")
    .select("id, user_id, code, profile_type, access_cohort_id, access_revoked_at")
    .eq("id", ambassadorId)
    .maybeSingle();
  if (!amb) return { ok: false as const, error: "NOT_FOUND" as const };
  if (amb.profile_type !== "embaixador_aluno" || !amb.access_cohort_id) {
    return { ok: false as const, error: "NO_COURSE_BENEFIT" as const };
  }
  if (amb.access_revoked_at) {
    return { ok: false as const, error: "ALREADY_REVOKED" as const };
  }

  // Only 'a_encerrar' is actionable; the panel shouldn't offer it otherwise, but
  // the state is re-derived here so a stale screen can't act early.
  const { data: status } = await admin.rpc("ambassador_access_status", {
    p_ambassador_id: ambassadorId,
  });
  if (status !== "a_encerrar") {
    return { ok: false as const, error: "NOT_DUE_YET" as const };
  }

  const { data: paidOrder } = await admin
    .from("orders")
    .select("id")
    .eq("user_id", amb.user_id as string)
    .eq("cohort_id", amb.access_cohort_id as number)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  let note: string;
  let removed = false;

  if (paidOrder) {
    note =
      "Benefício encerrado. Acesso à turma MANTIDO: o embaixador comprou essa turma separadamente (pedido " +
      String(paidOrder.id) +
      ").";
  } else {
    const { error: delErr } = await admin
      .from("user_cohort_memberships")
      .delete()
      .eq("user_id", amb.user_id as string)
      .eq("cohort_id", amb.access_cohort_id as number);
    if (delErr) throw new Error(delErr.message);
    removed = true;
    note = "Acesso gratuito da turma do Programa de Embaixadores retirado.";
  }

  const { error } = await admin
    .from("ambassadors")
    .update({
      access_revoked_at: new Date().toISOString(),
      access_revoked_by: userId,
      access_revoked_note: note,
    })
    .eq("id", ambassadorId)
    .is("access_revoked_at", null);
  if (error) throw new Error(error.message);

  await writeAudit(userId, "ambassador_access_revoked", {
    ambassador_id: ambassadorId,
    code: amb.code ?? null,
    cohort_id: amb.access_cohort_id,
    membership_removed: removed,
    kept_because_purchased: Boolean(paidOrder),
    note,
  });
  revalidatePath("/admin/embaixadores");
  return { ok: true as const, removed, keptBecausePurchased: Boolean(paidOrder) };
}
