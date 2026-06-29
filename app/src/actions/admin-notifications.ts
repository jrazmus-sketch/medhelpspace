"use server";

// Server actions for the admin "Email notifications" settings card.
//
// INVARIANT (project-wide): a "use server" module exports ONLY async functions.
// Shared constants/types live in @/lib/admin-notify-types and are imported here,
// never re-exported.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ADMIN_NOTIFY_DEFAULTS,
  eligibleEventsForRole,
  isAdminAlertEvent,
  isAdminNotifyFrequency,
  type AdminAlertEvent,
  type AdminNotifyFrequency,
} from "@/lib/admin-notify-types";

// Current admin's prefs, with code defaults filled for any event they've never set.
// Only the events the admin's role is eligible for are returned (per-event gating),
// so e.g. a support_admin sees the support-ticket toggle but not financial ones.
// Never throws to the client — returns { eligible: false } so the settings card
// simply hides for non-eligible roles (or in mock/dev with no Supabase).
export async function getMyNotificationPrefs(): Promise<{
  eligible: boolean;
  events: AdminAlertEvent[];
  prefs: Record<string, AdminNotifyFrequency>;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { eligible: false, events: [], prefs: {} };

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const events = eligibleEventsForRole(profile?.role as string | undefined);
    if (events.length === 0) return { eligible: false, events: [], prefs: {} };

    const { data: rows } = await admin
      .from("admin_notification_prefs")
      .select("event_type, frequency")
      .eq("user_id", user.id);

    const saved = new Map<string, string>(
      (rows ?? []).map((r) => [r.event_type as string, r.frequency as string]),
    );
    const prefs: Record<string, AdminNotifyFrequency> = {};
    for (const e of events) {
      const f = saved.get(e);
      prefs[e] = f && isAdminNotifyFrequency(f) ? f : ADMIN_NOTIFY_DEFAULTS[e];
    }
    return { eligible: true, events, prefs };
  } catch (e) {
    console.error("getMyNotificationPrefs failed", e);
    return { eligible: false, events: [], prefs: {} };
  }
}

export async function updateMyNotificationPref(
  eventType: string,
  frequency: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!isAdminAlertEvent(eventType)) return { error: "invalid_event" };
  if (!isAdminNotifyFrequency(frequency)) return { error: "invalid_frequency" };
  // Per-event eligibility: the role must be allowed to configure THIS event.
  if (!eligibleEventsForRole(profile?.role as string | undefined).includes(eventType)) {
    return { error: "unauthorized" };
  }

  const { error } = await admin.from("admin_notification_prefs").upsert(
    {
      user_id: user.id,
      event_type: eventType,
      frequency,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,event_type" },
  );
  if (error) return { error: "save_failed" };
  return { ok: true };
}
