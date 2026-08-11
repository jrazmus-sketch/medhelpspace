import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DRIP_FUNNEL } from "@/lib/magnet/links";
import {
  SIM_SESSION_COOKIE,
  SIM_SESSION_MAX_AGE,
  SIMULADO_SET_VERSION,
} from "@/lib/magnet/simulado";

// Magic-link entry for the simulado funnel. The resume link in the delivery email
// (lead-sim-access) points here with ?t=<result_token>, and so does the {{accessUrl}}
// button in an admin broadcast — which is how an EXISTING lead from another funnel
// enters the exam without filling in a single field (we already hold their name,
// address and turma).
//
// This is a ROUTE HANDLER, not a page, and deliberately so: cookies cannot be
// modified while rendering a server component, only in a Server Action or a route
// handler. It exchanges the token for the httpOnly session cookie and redirects to
// the exam, so the token leaves the URL after one hop and never sits in the address
// bar of a page a candidate might screenshot or share.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = (url.searchParams.get("t") ?? "").trim();

  // No/unknown token: send them to the exam, which shows the "we couldn't find your
  // simulado" state (and picks up an existing session if they already have one).
  const provaUrl = new URL("/simulado-revalida/prova", url.origin);
  if (!token) return NextResponse.redirect(provaUrl);

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("id, verified_at, drip_funnel, completed_at, sim_completed_at")
    .eq("result_token", token)
    .maybeSingle();

  if (!lead) return NextResponse.redirect(provaUrl);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};

  // Clicking the emailed link IS the confirmation (magic-link trust model).
  if (!lead.verified_at) patch.verified_at = now;

  // FUNNEL HANDOVER. This link is the entry point for a lead who has never been
  // through the gate — an address captured by the flashcards or 15-question quiz
  // funnel, mailed a broadcast, arriving straight at question 1. Without this the
  // row keeps the other funnel's ownership, and /api/cron/simulado-drip (which
  // selects on drip_funnel = simulado AND sim_entered_at IS NOT NULL) never sees
  // them: they would sit the whole exam and receive zero follow-up — no finish
  // reminders, no sales spine — and read as "not in this funnel" on /admin/leads.
  //
  // Gated on OWNERSHIP CHANGING, exactly like startSimulado, which makes an
  // ordinary resume click a no-op and keeps a cross-funnel arrival from resuming
  // the simulado ladder at the other sequence's rung. The clock moves with the
  // ladder: pacing an 8-rung sequence from a months-old timestamp makes every
  // rung instantly due and fires the whole spine on consecutive days.
  //
  // NOT for someone who already submitted. startSimulado resets on every ownership
  // change, but it is only ever reached by someone deliberately filling the gate to
  // sit the exam; this route is reached by CLICKING A BROADCAST, a far lower-intent
  // act aimed at a whole list at once. A finisher who later joined another funnel
  // would have sim_sales_step rewound to 0 and be re-sent a sales spine they already
  // received — and they land on /resultado regardless, so there is no exam to enter.
  if (lead.drip_funnel !== DRIP_FUNNEL.simulado && lead.sim_completed_at == null) {
    patch.drip_funnel = DRIP_FUNNEL.simulado;
    patch.sim_entered_at = now;
    patch.sim_set_version = SIMULADO_SET_VERSION;
    patch.drip_step = 0;
    patch.sim_reminder_step = 0;
    patch.sim_sales_step = 0;
    // NEVER overwrite completed_at — it is the other funnel's drip clock.
    if (lead.completed_at == null) patch.completed_at = now;
  }

  if (Object.keys(patch).length > 0) {
    await admin.from("leads").update(patch).eq("id", lead.id);
  }

  const res = NextResponse.redirect(provaUrl);
  res.cookies.set(SIM_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SIM_SESSION_MAX_AGE,
  });
  return res;
}
