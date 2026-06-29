// Pure constants + types for admin notifications — NO server imports, NO DB.
//
// Lives apart from lib/admin-notify.ts (which pulls in the admin Supabase client
// and Resend, so it is server-only) precisely so the "use client" settings UI can
// import the event list, defaults, and types without dragging server code into the
// client bundle.

// The business events an admin can be notified about. Adding a new event means:
//   1. extend this list + ADMIN_NOTIFY_DEFAULTS + EVENT_EMAIL_KIND + ELIGIBLE_ROLES,
//   2. add an `admin-<event>` template (email-render.ts defaults + seed SQL),
//   3. call recordAdminAlert(...) at the trigger point,
//   4. add the i18n label/desc keys for the settings UI.
export const ADMIN_ALERT_EVENTS = [
  "new_purchase",
  "payment_problem",
  "refund",
  "support_ticket",
  "nfse_ready",
] as const;

export type AdminAlertEvent = (typeof ADMIN_ALERT_EVENTS)[number];

export type AdminNotifyFrequency = "instant" | "daily" | "off";

// Events with no real-time trigger — they describe a STANDING backlog detected by
// the daily cron (computed live), not a one-off moment. The settings UI hides the
// 'instant' option for these, and they are never passed to recordAdminAlert().
export const DAILY_ONLY_EVENTS = new Set<AdminAlertEvent>(["nfse_ready"]);

// Effective frequency when an admin has no saved pref row for an event.
// Purchases / payment problems / support tickets matter immediately; refunds are
// opt-in to avoid pinging every billing admin about a co-admin's routine refund.
export const ADMIN_NOTIFY_DEFAULTS: Record<AdminAlertEvent, AdminNotifyFrequency> = {
  new_purchase: "instant",
  payment_problem: "instant",
  refund: "off",
  support_ticket: "instant",
  // A standing backlog → digest by default (no instant path exists for it).
  nfse_ready: "daily",
};

// Roles eligible to receive each event AT ALL — gating is PER EVENT so a
// support_admin can get support tickets without seeing financial alerts, and a
// billing_admin gets the financial ones. An admin outside an event's set never
// receives it (and the settings UI hides that event's toggle for them).
export const ADMIN_NOTIFY_ELIGIBLE_ROLES: Record<AdminAlertEvent, readonly string[]> = {
  new_purchase: ["super_admin", "billing_admin"],
  payment_problem: ["super_admin", "billing_admin"],
  refund: ["super_admin", "billing_admin"],
  support_ticket: ["super_admin", "support_admin", "billing_admin"],
  nfse_ready: ["super_admin", "billing_admin"],
};

// Union of every role eligible for at least one event — for the broad profiles
// query before per-event filtering.
export const ANY_NOTIFY_ELIGIBLE_ROLE: readonly string[] = [
  ...new Set(Object.values(ADMIN_NOTIFY_ELIGIBLE_ROLES).flat()),
];

// Which events a given role may receive / configure.
export function eligibleEventsForRole(role: string | undefined | null): AdminAlertEvent[] {
  if (!role) return [];
  return ADMIN_ALERT_EVENTS.filter((e) => ADMIN_NOTIFY_ELIGIBLE_ROLES[e].includes(role));
}

// event_type → email_templates.kind for the per-event instant email.
export const EVENT_EMAIL_KIND: Record<AdminAlertEvent, string> = {
  new_purchase: "admin-new-purchase",
  payment_problem: "admin-payment-problem",
  refund: "admin-refund",
  support_ticket: "admin-support-ticket",
  // Digest-only: no per-event instant email is ever sent for this one.
  nfse_ready: "admin-nfse-ready",
};

export const ADMIN_DIGEST_EMAIL_KIND = "admin-digest";

export function isAdminAlertEvent(v: string): v is AdminAlertEvent {
  return (ADMIN_ALERT_EVENTS as readonly string[]).includes(v);
}

export function isAdminNotifyFrequency(v: string): v is AdminNotifyFrequency {
  return v === "instant" || v === "daily" || v === "off";
}
