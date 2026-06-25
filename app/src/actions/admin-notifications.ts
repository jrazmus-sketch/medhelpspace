"use server";

// Server actions for the admin "Email notifications" settings card.
//
// INVARIANT (project-wide): a "use server" module exports ONLY async functions.
// Shared constants/types live in @/lib/admin-notify-types and are imported here,
// never re-exported.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ADMIN_ALERT_EVENTS,
  ADMIN_NOTIFY_DEFAULTS,
  ADMIN_NOTIFY_ELIGIBLE_ROLES,
  isAdminAlertEvent,
  isAdminNotifyFrequency,
  type AdminNotifyFrequency,
} from "@/lib/admin-notify-types";

function isEligibleRole(role: string | undefined): boolean {
  return !!role && (ADMIN_NOTIFY_ELIGIBLE_ROLES as readonly string[]).includes(role);
}

// Current admin's prefs, with code defaults filled for any event they've never set.
// Never throws to the client — returns { eligible: false } so the settings card
// simply hides for non-eligible roles (or in mock/dev with no Supabase).
export async function getMyNotificationPrefs(): Promise<{
  eligible: boolean;
  prefs: Record<string, AdminNotifyFrequency>;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { eligible: false, prefs: {} };

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!isEligibleRole(profile?.role as string | undefined)) {
      return { eligible: false, prefs: {} };
    }

    const { data: rows } = await admin
      .from("admin_notification_prefs")
      .select("event_type, frequency")
      .eq("user_id", user.id);

    const saved = new Map<string, string>(
      (rows ?? []).map((r) => [r.event_type as string, r.frequency as string]),
    );
    const prefs: Record<string, AdminNotifyFrequency> = {};
    for (const e of ADMIN_ALERT_EVENTS) {
      const f = saved.get(e);
      prefs[e] = f && isAdminNotifyFrequency(f) ? f : ADMIN_NOTIFY_DEFAULTS[e];
    }
    return { eligible: true, prefs };
  } catch (e) {
    console.error("getMyNotificationPrefs failed", e);
    return { eligible: false, prefs: {} };
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
  if (!isEligibleRole(profile?.role as string | undefined)) {
    return { error: "unauthorized" };
  }

  if (!isAdminAlertEvent(eventType)) return { error: "invalid_event" };
  if (!isAdminNotifyFrequency(frequency)) return { error: "invalid_frequency" };

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
