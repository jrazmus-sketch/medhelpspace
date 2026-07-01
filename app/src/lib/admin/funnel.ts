import { createAdminClient } from "@/lib/supabase/admin";

// Server-only read model for the paid-funnel dashboard on /admin/leads. Stitches
// the two data sources into one land→sale funnel, grouped by source:
//   • funnel_events (deny-all RLS)  → landing, quiz_start   (pre-capture steps)
//   • leads         (deny-all RLS)  → captures, verified, sales (post-capture)
// Both are keyed by utm_source, so the join is at the SOURCE level (not per-session)
// — which is exactly what a "funnel by campaign" view needs. Runs via service role.
//
// Aggregated in JS (mirrors getLeadsOverview). Volume is tiny for a $200 test; if
// funnel_events ever grows large this should move to a GROUP BY RPC.

export type FunnelStage = {
  landings: number; // distinct sessions that hit the landing (unique index dedups)
  quizStarts: number; // distinct sessions that clicked "Começar agora"
  captures: number; // leads created (Q5 soft capture)
  verified: number; // leads that confirmed the 6-digit code
  sales: number; // leads flipped to converted by a purchase
};

export type FunnelSourceRow = FunnelStage & { source: string | null };

export type FunnelOverview = {
  overall: FunnelStage;
  bySource: FunnelSourceRow[];
};

function emptyStage(): FunnelStage {
  return { landings: 0, quizStarts: 0, captures: 0, verified: 0, sales: 0 };
}

export async function getFunnelOverview(): Promise<FunnelOverview> {
  const admin = createAdminClient();

  const [{ data: events }, { data: leads }] = await Promise.all([
    admin.from("funnel_events").select("event_type, utm_source").limit(100000),
    admin.from("leads").select("utm_source, verified_at, converted_at").limit(100000),
  ]);

  const bucket = new Map<string, FunnelStage>();
  const keyOf = (s: string | null | undefined) => s ?? ""; // "" = organic / null
  const stageFor = (k: string): FunnelStage => {
    let b = bucket.get(k);
    if (!b) {
      b = emptyStage();
      bucket.set(k, b);
    }
    return b;
  };

  for (const e of events ?? []) {
    const b = stageFor(keyOf(e.utm_source as string | null));
    if (e.event_type === "landing") b.landings++;
    else if (e.event_type === "quiz_start") b.quizStarts++;
  }
  for (const l of leads ?? []) {
    const b = stageFor(keyOf(l.utm_source as string | null));
    b.captures++;
    if (l.verified_at) b.verified++;
    if (l.converted_at) b.sales++;
  }

  const overall = emptyStage();
  for (const b of bucket.values()) {
    overall.landings += b.landings;
    overall.quizStarts += b.quizStarts;
    overall.captures += b.captures;
    overall.verified += b.verified;
    overall.sales += b.sales;
  }

  const bySource: FunnelSourceRow[] = [...bucket.entries()]
    .map(([k, b]) => ({ source: k === "" ? null : k, ...b }))
    // Busiest sources first (by the widest of their top-of-funnel signals).
    .sort((a, b) => Math.max(b.landings, b.captures) - Math.max(a.landings, a.captures));

  return { overall, bySource };
}
