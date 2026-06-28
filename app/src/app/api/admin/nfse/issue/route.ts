import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Record the outcome of a MANUALLY-issued NFS-e (issued on the WebISS portal), or
// mark a paid order as "dispensada" (no nota needed). No money or external call —
// this only writes the tracking columns + an audit row.
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
    orderId?: string;
    action?: string;
    numero?: string;
    verificacao?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId) {
    return NextResponse.json({ error: "orderId obrigatório" }, { status: 400 });
  }

  const action = body.action === "skip" ? "skip" : "issue";
  // Cap lengths so a pasted blob can't bloat the row / audit JSON.
  const numero = typeof body.numero === "string" ? body.numero.trim().slice(0, 60) : "";
  const verificacao =
    typeof body.verificacao === "string" ? body.verificacao.trim().slice(0, 60) : "";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";

  if (action === "issue" && !numero) {
    return NextResponse.json(
      { error: "Informe o número da nota fiscal." },
      { status: 400 },
    );
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, status, user_id, nfse_status")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }
  if (order.status !== "paid") {
    return NextResponse.json(
      { error: "Só pedidos pagos podem ter nota fiscal." },
      { status: 409 },
    );
  }

  const update =
    action === "skip"
      ? {
          nfse_status: "skipped",
          nfse_notes: notes || null,
          nfse_issued_by: user.id,
          nfse_issued_at: new Date().toISOString(),
        }
      : {
          nfse_status: "issued",
          nfse_number: numero,
          nfse_verificacao: verificacao || null,
          nfse_notes: notes || null,
          nfse_issued_by: user.id,
          nfse_issued_at: new Date().toISOString(),
        };

  const { error: updErr } = await admin.from("orders").update(update).eq("id", orderId);
  if (updErr) {
    console.error("nfse issue update failed", orderId, updErr);
    return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 });
  }

  // Audit trail (best-effort).
  const { error: auditErr } = await admin.from("admin_audit_log").insert({
    actor_user_id: user.id,
    action: action === "skip" ? "nfse_skipped" : "nfse_issued",
    target_user_id: order.user_id as string,
    details: {
      order_id: orderId,
      nfse_number: action === "issue" ? numero : null,
      nfse_verificacao: action === "issue" ? verificacao || null : null,
      notes: notes || null,
    },
  });
  if (auditErr) {
    console.error("nfse audit log failed", orderId, auditErr);
  }

  return NextResponse.json({ ok: true });
}
