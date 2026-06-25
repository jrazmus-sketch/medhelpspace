import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Safe: this route runs after Supabase's recovery flow has already exchanged
  // the link token for a session via /auth/callback. The session cookie identifies
  // the user; no client-supplied origin or redirect is involved here, so there's
  // nothing for an attacker to spoof.
  const { password } = await request.json();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Don't silently sign the user in on the recovery session. A reset is often
  // triggered because the account may be compromised or access was lost, so
  // revoke ALL sessions (scope: "global" — including any attacker's) and clear
  // this request's cookies. The client then redirects to /login for a fresh
  // manual login with the new password.
  await supabase.auth.signOut({ scope: "global" });
  return NextResponse.json({ ok: true });
}
