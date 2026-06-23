import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { COACH_KEYS } from "@/lib/onboarding/tips";

/**
 * Per-user onboarding walkthrough state.
 *
 *   POST { action: "dismiss", key }  → add a tip key to profiles.onboarding_dismissed
 *   POST { action: "reset" }         → clear it (re-enables every coachmark)
 *
 * Uses the USER-SCOPED client on purpose: the existing profiles_update_own RLS
 * policy (id = auth.uid(), role unchanged) is the access control. Writing
 * onboarding_* never touches role, so it passes. Reads are served by the
 * existing GET /api/profile (select *), so AuthProvider already carries the
 * fields — no separate fetch here.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: { action?: string; key?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { action, key } = payload;

  if (action === "reset") {
    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_dismissed: [] })
      .eq("id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "dismiss") {
    if (!key || !COACH_KEYS.has(key)) {
      return NextResponse.json({ error: "Unknown tip key" }, { status: 400 });
    }

    // Read-modify-write under the user's own row. Per-user + server-side, so the
    // only race is the same user dismissing two cards within a few ms; the local
    // store already hides both for the session, so a lost append self-heals on
    // the next dismiss. Dedup with a Set.
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_dismissed, onboarding_seen_at")
      .eq("id", user.id)
      .single();

    const current: string[] = profile?.onboarding_dismissed ?? [];
    const next = Array.from(new Set([...current, key]));

    const updates: Record<string, unknown> = { onboarding_dismissed: next };
    // Stamp first engagement once, so we can tell brand-new users apart later.
    if (!profile?.onboarding_seen_at) updates.onboarding_seen_at = new Date().toISOString();

    const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
