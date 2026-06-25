import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import { formatBRL, getAdminDailySubscriptions } from "@/lib/admin-notify";
import { ADMIN_DIGEST_EMAIL_KIND, type AdminAlertEvent } from "@/lib/admin-notify-types";

// Daily admin digest. Summarizes the last 24h of admin_alerts (new purchases,
// payment problems, refunds) and emails ONE digest to each admin who chose
// 'daily' for at least one event — covering only their daily-subscribed events.
//
// Schedule: configured in app/vercel.json. Auth: "Authorization: Bearer <CRON_SECRET>"
// (Vercel sends this automatically). Mirrors api/cron/lifecycle-notifications.
//
// Dedup: one digest per admin per day via email_log (kind='admin-digest',
// context_id=date) using the same insert-first reserve pattern as the lifecycle cron.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function todayKey() {
  return new Date().toISOString().split("T")[0];
}
function fmtDatePtBr() {
  return new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function GET(request: NextRequest) {
  // Vercel Cron auth: Bearer header must match CRON_SECRET env.
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`, "utf8");
  const actual = Buffer.from(authHeader ?? "", "utf8");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const subscriptions = await getAdminDailySubscriptions();
  if (subscriptions.length === 0) {
    return NextResponse.json({ ok: true, note: "no daily subscribers", sent: 0 });
  }

  const supabase = createAdminClient();
  const dateKey = todayKey();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: alerts, error: alertsErr } = await supabase
    .from("admin_alerts")
    .select("event_type, metadata, created_at")
    .gte("created_at", since);
  if (alertsErr) {
    console.error("admin-digest: alerts query failed", alertsErr);
    return NextResponse.json({ error: "alerts_query_failed" }, { status: 500 });
  }

  // Aggregate counts (+ summed amounts) per event type.
  const counts: Record<AdminAlertEvent, { n: number; cents: number }> = {
    new_purchase: { n: 0, cents: 0 },
    payment_problem: { n: 0, cents: 0 },
    refund: { n: 0, cents: 0 },
  };
  for (const row of alerts ?? []) {
    const e = row.event_type as AdminAlertEvent;
    if (!(e in counts)) continue;
    counts[e].n += 1;
    const md = (row.metadata ?? {}) as Record<string, unknown>;
    if (typeof md.amount_cents === "number") counts[e].cents += md.amount_cents;
  }

  function lineFor(e: AdminAlertEvent): string | null {
    const c = counts[e];
    if (c.n === 0) return null;
    if (e === "new_purchase")
      return `<p style="margin:0 0 10px;font-size:14px;color:#374151;">💳 <strong>${c.n} nova(s) compra(s)</strong> · ${formatBRL(c.cents)}</p>`;
    if (e === "refund")
      return `<p style="margin:0 0 10px;font-size:14px;color:#374151;">↩️ <strong>${c.n} estorno(s)</strong> · ${formatBRL(c.cents)}</p>`;
    return `<p style="margin:0 0 10px;font-size:14px;color:#b91c1c;">⚠️ <strong>${c.n} pagamento(s) retido(s)</strong> para revisão</p>`;
  }

  async function reserve(userId: string): Promise<boolean> {
    const { error } = await supabase
      .from("email_log")
      .insert({ user_id: userId, kind: ADMIN_DIGEST_EMAIL_KIND, context_id: dateKey });
    if (error?.code === "23505") return false; // already sent today
    if (error) {
      console.error("admin-digest: reserve failed", userId, error);
      return false;
    }
    return true;
  }

  const digestDate = fmtDatePtBr();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    // Only the events this admin subscribed to at 'daily' AND that actually occurred.
    const lines = sub.events.map(lineFor).filter((l): l is string => l !== null);
    if (lines.length === 0) {
      skipped++;
      continue;
    }
    const digestBody = `<p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">Resumo das últimas 24 horas:</p>${lines.join("")}`;

    if (!(await reserve(sub.id))) {
      skipped++;
      continue;
    }
    const res = await sendTemplateEmail({
      kind: ADMIN_DIGEST_EMAIL_KIND,
      to: sub.email,
      vars: { digestDate, digestBody },
    });
    if (!res.ok) {
      // Release the reservation so the next run can retry.
      await supabase
        .from("email_log")
        .delete()
        .eq("user_id", sub.id)
        .eq("kind", ADMIN_DIGEST_EMAIL_KIND)
        .eq("context_id", dateKey);
      console.error("admin-digest: send failed", sub.id, res.reason);
      failed++;
    } else {
      sent++;
    }
  }

  return NextResponse.json({
    ok: true,
    alerts: alerts?.length ?? 0,
    subscribers: subscriptions.length,
    sent,
    skipped,
    failed,
  });
}
