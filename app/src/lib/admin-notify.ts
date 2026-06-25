// Admin notifications — SERVER ONLY (createAdminClient + Resend via lib/email).
//
// Two responsibilities:
//   1. recordAdminAlert() — append the event to admin_alerts (the source of truth
//      for the daily digest) AND, if this is the first time we've seen this event
//      (UNIQUE event_type+context_id), fire the per-event "instant" emails. The
//      unique gate makes the alert fire exactly once even when the Pix webhook and
//      the status poll both finalize the same order concurrently.
//   2. getAdminRecipients() — resolve which eligible admins want a given event at a
//      given frequency, honouring per-admin prefs with a code default fallback.
//
// Everything here is best-effort: a failure to alert admins must NEVER break the
// purchase / refund / cron path that called it. Hence the blanket try/catch + log.

import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmailToMany } from "@/lib/email";
import {
  ADMIN_ALERT_EVENTS,
  ADMIN_NOTIFY_DEFAULTS,
  ADMIN_NOTIFY_ELIGIBLE_ROLES,
  EVENT_EMAIL_KIND,
  type AdminAlertEvent,
  type AdminNotifyFrequency,
} from "@/lib/admin-notify-types";

export type AdminRecipient = { id: string; email: string };

// Format integer centavos as Brazilian currency, e.g. 49700 → "R$ 497,00".
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// "PIX" | "CREDIT_CARD" (or undefined) → human label for the alert email.
export function paymentMethodLabel(type?: string): string {
  if (type === "PIX") return "Pix";
  if (type === "CREDIT_CARD") return "Cartão de crédito";
  return "—";
}

// Eligible admins whose EFFECTIVE frequency for `event` equals `target`.
// Effective frequency = saved admin_notification_prefs row, else the code default
// (ADMIN_NOTIFY_DEFAULTS[event]). Eligibility is gated by role first.
export async function getAdminRecipients(
  event: AdminAlertEvent,
  target: AdminNotifyFrequency,
): Promise<AdminRecipient[]> {
  try {
    const admin = createAdminClient();
    const { data: admins, error } = await admin
      .from("profiles")
      .select("id, email, role")
      .in("role", ADMIN_NOTIFY_ELIGIBLE_ROLES as unknown as string[]);
    if (error || !admins || admins.length === 0) return [];

    const ids = admins.map((a) => a.id as string);
    const { data: prefs } = await admin
      .from("admin_notification_prefs")
      .select("user_id, frequency")
      .eq("event_type", event)
      .in("user_id", ids);

    const prefMap = new Map<string, string>(
      (prefs ?? []).map((p) => [p.user_id as string, p.frequency as string]),
    );
    const def = ADMIN_NOTIFY_DEFAULTS[event];

    return admins
      .filter((a) => typeof a.email === "string" && (a.email as string).length > 0)
      .filter((a) => (prefMap.get(a.id as string) ?? def) === target)
      .map((a) => ({ id: a.id as string, email: a.email as string }));
  } catch (e) {
    console.error("getAdminRecipients failed", event, target, e);
    return [];
  }
}

// Send the per-event "instant" email to every eligible admin who opted in.
async function notifyAdminsInstant(
  event: AdminAlertEvent,
  vars: Record<string, string>,
): Promise<void> {
  const recipients = await getAdminRecipients(event, "instant");
  if (recipients.length === 0) return;
  try {
    await sendTemplateEmailToMany({
      kind: EVENT_EMAIL_KIND[event],
      recipients: recipients.map((r) => r.email),
      vars,
    });
  } catch (e) {
    console.error("notifyAdminsInstant send failed", event, e);
  }
}

// Record an alert and (if first-seen) fire instant emails. `contextId` is the
// dedup key — pass the order id so concurrent finalizers fire one alert/email set.
export async function recordAdminAlert(args: {
  event: AdminAlertEvent;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
  contextId: string;
  emailVars: Record<string, string>;
}): Promise<void> {
  const { event, title, body = "", metadata = {}, contextId, emailVars } = args;

  let shouldNotify = false;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("admin_alerts").insert({
      event_type: event,
      title,
      body,
      metadata,
      context_id: contextId,
    });
    if (error) {
      // 23505 = a concurrent caller already recorded this exact event → it owns
      // the instant send; we must NOT send again.
      if (error.code === "23505") return;
      // Any other error (e.g. table missing during a rollback): the log row is
      // best-effort, so still attempt the instant email rather than swallow it.
      console.error("recordAdminAlert insert failed", event, contextId, error);
      shouldNotify = true;
    } else {
      shouldNotify = true;
    }
  } catch (e) {
    console.error("recordAdminAlert threw", event, contextId, e);
    shouldNotify = true; // best-effort
  }

  if (shouldNotify) {
    await notifyAdminsInstant(event, emailVars);
  }
}

// For the daily digest cron: every eligible admin who wants AT LEAST ONE event at
// 'daily', with the list of those events. Admins with no 'daily' events are omitted.
export async function getAdminDailySubscriptions(): Promise<
  { id: string; email: string; events: AdminAlertEvent[] }[]
> {
  try {
    const admin = createAdminClient();
    const { data: admins, error } = await admin
      .from("profiles")
      .select("id, email, role")
      .in("role", ADMIN_NOTIFY_ELIGIBLE_ROLES as unknown as string[]);
    if (error || !admins || admins.length === 0) return [];

    const ids = admins.map((a) => a.id as string);
    const { data: prefs } = await admin
      .from("admin_notification_prefs")
      .select("user_id, event_type, frequency")
      .in("user_id", ids);

    const prefMap = new Map<string, string>(
      (prefs ?? []).map((p) => [`${p.user_id}|${p.event_type}`, p.frequency as string]),
    );

    const out: { id: string; email: string; events: AdminAlertEvent[] }[] = [];
    for (const a of admins) {
      const email = a.email as string | null;
      if (!email) continue;
      const events = ADMIN_ALERT_EVENTS.filter(
        (e) => (prefMap.get(`${a.id}|${e}`) ?? ADMIN_NOTIFY_DEFAULTS[e]) === "daily",
      );
      if (events.length > 0) out.push({ id: a.id as string, email, events: [...events] });
    }
    return out;
  } catch (e) {
    console.error("getAdminDailySubscriptions failed", e);
    return [];
  }
}
