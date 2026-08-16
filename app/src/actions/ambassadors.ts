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
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", input.userEmail.trim())
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
    terminatedForCause: boolean;
    terminationReason: string | null;
  },
) {
  const { userId, admin } = await requireBilling();
  if (input.commissionRateBps < 0 || input.commissionRateBps > 10000) {
    return { ok: false as const, error: "RATE_OUT_OF_RANGE" as const };
  }

  const { data: before } = await admin
    .from("ambassadors")
    .select("code, status, commission_rate_bps, contract_ends_on")
    .eq("id", ambassadorId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    status: input.status,
    commission_rate_bps: input.commissionRateBps,
    contract_ends_on: input.contractEndsOn,
    coupon_id: input.couponId,
    terminated_for_cause: input.terminatedForCause,
    termination_reason: input.terminationReason,
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

/** Reject the note (cl. 7.6): the balance stays put and rolls to the next cycle. */
export async function rejeitarNota(payoutId: number, reason: string) {
  const { userId, admin } = await requireBilling();
  if (!reason.trim()) return { ok: false as const, error: "REASON_REQUIRED" as const };

  const { error } = await admin
    .from("payouts")
    .update({ status: "rejeitada", rejection_reason: reason.trim() })
    .eq("id", payoutId);
  if (error) throw new Error(error.message);

  await writeAudit(userId, "ambassador_payout_rejected", { payout_id: payoutId, reason });
  revalidatePath("/admin/embaixadores");
  return { ok: true as const };
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
