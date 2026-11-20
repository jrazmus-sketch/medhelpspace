import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Administração → Financeiro: mark (or unmark) orders as INTERNAL TESTS (Karina 2026-11-19).
// It writes ONLY orders.internal_test — the same flag the Notas Fiscais screen sets — and an audit row per order.
// Nothing is deleted, no money moves, PagBank is never called, and memberships are never touched: a test stays in
// the database as history and is simply left out of the financial view, its indicators and the default export
// (and, as before, out of the NFS-e backlog, the dashboard sales and Meta purchase events). Reversible with
// test=false.
const MAX_IDS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["super_admin", "billing_admin"].includes(profile.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let body: { orderIds?: unknown; test?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }
  const ids = Array.isArray(body.orderIds)
    ? [...new Set(body.orderIds.filter((x): x is string => typeof x === "string" && UUID.test(x)))]
    : [];
  if (ids.length === 0 || ids.length > MAX_IDS || typeof body.test !== "boolean") {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }
  const test = body.test;

  const { data: found, error: readErr } = await admin
    .from("orders")
    .select("id, user_id, amount_cents, status, internal_test")
    .in("id", ids);
  if (readErr) {
    console.error("billing test read failed", readErr);
    return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 });
  }
  const rows = (found ?? []) as { id: string; user_id: string; amount_cents: number; status: string; internal_test: boolean }[];
  if (rows.length !== ids.length) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  }

  const changing = rows.filter((r) => r.internal_test !== test);
  if (changing.length > 0) {
    const { error: updErr } = await admin
      .from("orders")
      .update({ internal_test: test })
      .in("id", changing.map((r) => r.id));
    if (updErr) {
      console.error("billing test update failed", updErr);
      return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 });
    }
    // Audit (best-effort), one row per order — same actions as the Notas Fiscais screen.
    const { error: auditErr } = await admin.from("admin_audit_log").insert(
      changing.map((r) => ({
        actor_user_id: user.id,
        action: test ? "nfse_test_marked" : "nfse_test_unmarked",
        target_user_id: r.user_id,
        details: { product: "revalida", order_id: r.id, amount_cents: r.amount_cents, status: r.status, source: "financeiro" },
      })),
    );
    if (auditErr) console.error("billing test audit failed", auditErr);
  }

  return NextResponse.json({ ok: true, changed: changing.length });
}
