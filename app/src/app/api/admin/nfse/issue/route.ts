import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayKeyBR, toDateKeyBR } from "@/lib/br-date";

// Records what Karina did BY HAND on the national Emissor (Portal Nacional) for
// one sale — a Revalida order or a ClinAct invoice. Nothing here issues,
// cancels or changes any nota, and no money moves: it only writes the tracking
// columns + an audit row (Karina 2026-10-27: "serve apenas para controle").
//
//   issue    — the nota exists: número, data de emissão, chave (optional)
//   cancel   — the nota was cancelled on the portal (only an issued one)
//   uncancel — undo a cancel recorded by mistake
//   refund / unrefund — ClinAct only: the charge was returned in the PagBank
//              panel. A Revalida refund is the order's own status, set by the
//              refund flow, never by this route.
type Kind = "revalida" | "clinact";
type Action = "issue" | "cancel" | "uncancel" | "refund" | "unrefund";
const ACTIONS: Action[] = ["issue", "cancel", "uncancel", "refund", "unrefund"];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  let body: {
    kind?: string;
    id?: string;
    action?: string;
    numero?: string;
    verificacao?: string;
    issuedOn?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const kind: Kind = body.kind === "clinact" ? "clinact" : "revalida";
  const id = typeof body.id === "string" ? body.id : "";
  const action = ACTIONS.find((a) => a === body.action);
  if (!id || !action) {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }
  if ((action === "refund" || action === "unrefund") && kind !== "clinact") {
    return NextResponse.json(
      { error: "O reembolso de uma turma é feito pelo próprio pedido, não aqui." },
      { status: 400 },
    );
  }

  // Cap lengths so a pasted blob can't bloat the row / audit JSON.
  const numero = typeof body.numero === "string" ? body.numero.trim().slice(0, 60) : "";
  const verificacao =
    typeof body.verificacao === "string" ? body.verificacao.trim().slice(0, 80) : "";

  const table = kind === "clinact" ? "clinact_invoices" : "orders";
  const { data: current } = await admin
    .from(table)
    .select(kind === "clinact" ? "id, user_id, nfse_status, refunded_at" : "id, user_id, status, nfse_status")
    .eq("id", id)
    .maybeSingle();
  const row = current as unknown as {
    user_id: string;
    nfse_status: string | null;
    status?: string;
    refunded_at?: string | null;
  } | null;
  if (!row) {
    return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  }
  if (kind === "revalida" && row.status !== "paid" && row.status !== "refunded") {
    return NextResponse.json(
      { error: "Só vendas pagas ou reembolsadas podem ter nota fiscal." },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();
  let update: Record<string, unknown>;
  let issuedAt: string | null = null;

  switch (action) {
    case "issue": {
      if (!numero) {
        return NextResponse.json({ error: "Informe o número da NFS-e." }, { status: 400 });
      }
      // Data de emissão: a real calendar date, not in the future (Brasília).
      const issuedOn = typeof body.issuedOn === "string" ? toDateKeyBR(body.issuedOn) : "";
      if (!issuedOn || issuedOn > todayKeyBR()) {
        return NextResponse.json({ error: "Informe uma data de emissão válida." }, { status: 400 });
      }
      // Noon in Brasília keeps it on that calendar day whoever reads it later.
      issuedAt = new Date(`${issuedOn}T12:00:00-03:00`).toISOString();
      update = {
        nfse_status: "issued",
        nfse_number: numero,
        nfse_verificacao: verificacao || null,
        nfse_issued_at: issuedAt,
        nfse_issued_by: user.id,
        nfse_cancelled_at: null,
      };
      break;
    }
    case "cancel":
      if (row.nfse_status !== "issued") {
        return NextResponse.json(
          { error: "Só uma NFS-e registrada como emitida pode ser marcada como cancelada." },
          { status: 409 },
        );
      }
      update = { nfse_status: "cancelled", nfse_cancelled_at: nowIso };
      break;
    case "uncancel":
      if (row.nfse_status !== "cancelled") {
        return NextResponse.json({ error: "Esta NFS-e não está cancelada." }, { status: 409 });
      }
      update = { nfse_status: "issued", nfse_cancelled_at: null };
      break;
    case "refund":
      update = { refunded_at: row.refunded_at ?? nowIso };
      break;
    case "unrefund":
      update = { refunded_at: null };
      break;
  }

  const { error: updErr } = await admin.from(table).update(update).eq("id", id);
  if (updErr) {
    console.error("nfse record failed", kind, id, updErr);
    return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 });
  }

  // Audit trail (best-effort).
  const auditAction = {
    issue: "nfse_issued",
    cancel: "nfse_cancelled",
    uncancel: "nfse_uncancelled",
    refund: "clinact_refund_marked",
    unrefund: "clinact_refund_unmarked",
  }[action];
  const { error: auditErr } = await admin.from("admin_audit_log").insert({
    actor_user_id: user.id,
    action: auditAction,
    target_user_id: row.user_id,
    details: {
      product: kind,
      [kind === "clinact" ? "invoice_id" : "order_id"]: id,
      nfse_number: action === "issue" ? numero : null,
      nfse_verificacao: action === "issue" ? verificacao || null : null,
      nfse_issued_at: issuedAt,
    },
  });
  if (auditErr) {
    console.error("nfse audit log failed", kind, id, auditErr);
  }

  return NextResponse.json({ ok: true, issuedAt });
}
