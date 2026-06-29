import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MESSAGE_MAX } from "@/lib/support";
import { insertMemberReply } from "@/lib/support-data";

// POST /api/support/[id]/reply — member adds a message to their own ticket.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let payload: { message?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (message.length < 1 || message.length > MESSAGE_MAX) {
    return NextResponse.json({ error: "invalid_message" }, { status: 400 });
  }

  // insertMemberReply enforces ownership (IDOR guard) — null/false if not theirs.
  const ok = await insertMemberReply({ userId: user.id, ticketId, message });
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
