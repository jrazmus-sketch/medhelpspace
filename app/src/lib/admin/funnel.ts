import { createAdminClient } from "@/lib/supabase/admin";

// Server-only read model for the top-of-funnel beacons shown on /admin/leads.
// funnel_events records the two PRE-capture steps ('landing' | 'quiz_start'),
// now tagged with `funnel` (matches leads.source) so each funnel tab shows its
// own Landed/Started. Everything from email capture onward comes from the leads
// table and is computed CLIENT-side in leads-client.tsx, so every number on the
// page shares one filter definition (test/archived exclusion, date range,
// funnel tab).
//
// Internal traffic: an event counts as internal when EITHER
//   • is_internal = true — its browser carried the mhs_internal cookie the
//     proxy sets for admin-role users (see proxy.ts + /api/funnel-event), or
//   • its session_id belongs to a lead later marked is_test — this catches
//     incognito QA runs that signed up, retroactively and at read time (no
//     backfill needed when a lead's flag changes).
// The dashboard hides internal events unless QA mode is on. Events from before
// the cookie shipped that never became a test lead can't be attributed and
// stay counted (footnoted in the UI).
//
// Rows are compacted to per-day counts so the payload stays small no matter how
// long the beacon runs; the client slices by day for the range switcher.

export type FunnelEventDay = {
  day: string; // 'YYYY-MM-DD' (UTC)
  eventType: "landing" | "quiz_start";
  funnel: string; // matches leads.source ('simulado-honesto' | 'flashcards-50' | 'simulado-100')
  source: string | null; // utm_source; null = organic
  internal: boolean; // team browser or test-lead session — see header comment
  count: number;
};

export async function getFunnelEventDays(): Promise<FunnelEventDay[]> {
  const admin = createAdminClient();
  const [{ data: events }, { data: testLeads }] = await Promise.all([
    admin
      .from("funnel_events")
      .select("event_type, funnel, utm_source, created_at, session_id, is_internal")
      .limit(100000),
    admin
      .from("leads")
      .select("funnel_session_id")
      .eq("is_test", true)
      .not("funnel_session_id", "is", null),
  ]);

  const testSessions = new Set(
    (testLeads ?? []).map((l) => l.funnel_session_id as string),
  );

  const bucket = new Map<string, FunnelEventDay>();
  for (const e of events ?? []) {
    const day = (e.created_at as string).slice(0, 10);
    const eventType = e.event_type as FunnelEventDay["eventType"];
    const funnel = (e.funnel as string | null) ?? "simulado-honesto";
    const source = (e.utm_source as string | null) ?? null;
    const internal =
      Boolean(e.is_internal) || testSessions.has(e.session_id as string);
    const key = `${day}|${eventType}|${funnel}|${source ?? ""}|${internal ? 1 : 0}`;
    const existing = bucket.get(key);
    if (existing) existing.count++;
    else bucket.set(key, { day, eventType, funnel, source, internal, count: 1 });
  }
  return [...bucket.values()];
}
