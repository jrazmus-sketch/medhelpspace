import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// Public top-of-funnel beacon for /questoes-revalida. Records the two PRE-capture
// steps a lead row can't see ('landing', 'quiz_start') so landing→capture rate is
// computable. Written via service role (funnel_events is deny-all RLS). Deduped by
// (session_id, event_type) — a refresh / re-mount is a no-op, not an inflated count.
// No PII: just a client-random session id + the ad attribution already in the URL.

export const dynamic = "force-dynamic";

const attr = (max: number) => z.string().trim().max(max).nullish();

const bodySchema = z.object({
  event: z.enum(["landing", "quiz_start"]),
  sessionId: z.string().trim().min(8).max(64),
  // Which lead funnel this beacon belongs to (matches leads.source). Older
  // clients omit it → default to the quiz funnel, where beacons originated.
  funnel: z
    .enum(["simulado-honesto", "flashcards-50", "simulado-100"])
    .default("simulado-honesto"),
  utm: z
    .object({
      source: attr(120),
      medium: attr(120),
      campaign: attr(200),
      term: attr(200),
      content: attr(200),
      gclid: attr(400),
    })
    .nullish(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { event, sessionId, funnel, utm } = parsed.data;
  const admin = createAdminClient();

  // Team browsers carry the httpOnly mhs_internal cookie (set by the proxy the
  // first time an admin-role user opens /admin). Their beacons are stamped
  // is_internal so /admin/leads can keep the team's own visits out of the
  // Landed/Started stats. Real visitors never have the cookie.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const isInternal = /(?:^|;\s*)mhs_internal=1(?:;|\s|$)/.test(cookieHeader);

  // ignoreDuplicates → a repeat beacon on the (session_id, event_type) unique index
  // is a silent no-op instead of a 23505. Best-effort: never surface a failure to
  // the funnel, analytics must not break the user flow.
  await admin
    .from("funnel_events")
    .upsert(
      {
        event_type: event,
        session_id: sessionId,
        funnel,
        is_internal: isInternal,
        utm_source: utm?.source ?? null,
        utm_medium: utm?.medium ?? null,
        utm_campaign: utm?.campaign ?? null,
        utm_term: utm?.term ?? null,
        utm_content: utm?.content ?? null,
        gclid: utm?.gclid ?? null,
      },
      { onConflict: "session_id,event_type,funnel", ignoreDuplicates: true },
    );

  return NextResponse.json({ ok: true });
}
