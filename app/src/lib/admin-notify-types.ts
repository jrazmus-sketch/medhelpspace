// Pure constants + types for admin notifications — NO server imports, NO DB.
//
// Lives apart from lib/admin-notify.ts (which pulls in the admin Supabase client
// and Resend, so it is server-only) precisely so the "use client" settings UI can
// import the event list, defaults, and types without dragging server code into the
// client bundle.

// The business events an admin can be notified about. Adding a new event means:
//   1. extend this list + ADMIN_NOTIFY_DEFAULTS + EVENT_EMAIL_KIND below,
//   2. add an `admin-<event>` template (email-render.ts defaults + seed SQL),
//   3. call recordAdminAlert(...) at the trigger point,
//   4. add the i18n label/desc keys for the settings UI.
export const ADMIN_ALERT_EVENTS = [
  "new_purchase",
  "payment_problem",
  "refund",
] as const;

export type AdminAlertEvent = (typeof ADMIN_ALERT_EVENTS)[number];

export type AdminNotifyFrequency = "instant" | "daily" | "off";

// Effective frequency when an admin has no saved pref row for an event.
// Purchases / payment problems matter immediately; refunds are opt-in to avoid
// pinging every billing admin about a co-admin's routine refund.
export const ADMIN_NOTIFY_DEFAULTS: Record<AdminAlertEvent, AdminNotifyFrequency> = {
  new_purchase: "instant",
  payment_problem: "instant",
  refund: "off",
};

// Roles eligible to receive these (financial) alerts at all. An admin outside
// this set never receives them regardless of saved prefs.
export const ADMIN_NOTIFY_ELIGIBLE_ROLES = ["super_admin", "billing_admin"] as const;

// event_type → email_templates.kind for the per-event instant email.
export const EVENT_EMAIL_KIND: Record<AdminAlertEvent, string> = {
  new_purchase: "admin-new-purchase",
  payment_problem: "admin-payment-problem",
  refund: "admin-refund",
};

export const ADMIN_DIGEST_EMAIL_KIND = "admin-digest";

export function isAdminAlertEvent(v: string): v is AdminAlertEvent {
  return (ADMIN_ALERT_EVENTS as readonly string[]).includes(v);
}

export function isAdminNotifyFrequency(v: string): v is AdminNotifyFrequency {
  return v === "instant" || v === "daily" || v === "off";
}
