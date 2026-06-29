import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isSupportCategory,
  SUPPORT_CATEGORY_LABELS,
  SUBJECT_MAX,
  MESSAGE_MIN,
  MESSAGE_MAX,
} from "@/lib/support";
import { insertMemberTicket, recentTicketCount } from "@/lib/support-data";
import { recordAdminAlert } from "@/lib/admin-notify";
import { sendTemplateEmail } from "@/lib/email";

// Member content is plain text; escape before it ever lands in an HTML email body.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

// POST /api/support — open a new support ticket (auth required; membership NOT
// required, so a locked-out member with a billing issue can still reach support).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let payload: {
    category?: unknown;
    subject?: unknown;
    message?: unknown;
    pageUrl?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const category = payload.category;
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const pageUrl = typeof payload.pageUrl === "string" ? payload.pageUrl.slice(0, 500) : null;

  if (!isSupportCategory(category)) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }
  if (subject.length < 1 || subject.length > SUBJECT_MAX) {
    return NextResponse.json({ error: "invalid_subject" }, { status: 400 });
  }
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    return NextResponse.json({ error: "invalid_message" }, { status: 400 });
  }

  // Light spam / double-submit guard: one new ticket per 20s per member.
  if ((await recentTicketCount(user.id, 20)) > 0) {
    return NextResponse.json({ error: "too_soon" }, { status: 429 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .single();
  const email = (profile?.email as string | null) ?? user.email ?? "";
  const displayName = (profile?.display_name as string | null) ?? null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 400) ?? null;

  const ticketId = await insertMemberTicket({
    userId: user.id,
    email,
    displayName,
    category,
    subject,
    message,
    pageUrl,
    userAgent,
  });
  if (!ticketId) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  const memberName = displayName || email.split("@")[0] || "Membro";
  const categoryLabel = SUPPORT_CATEGORY_LABELS[category];

  // Alert admins (in-app + instant email to opted-in staff). Best-effort — a
  // notification failure must never sink the ticket the member just submitted.
  await recordAdminAlert({
    event: "support_ticket",
    title: `Novo chamado de suporte — ${categoryLabel}`,
    body: `${memberName}: ${subject}`,
    metadata: { ticket_id: ticketId, member_id: user.id, category },
    contextId: `ticket-${ticketId}`,
    // Every member-controlled field lands in an HTML email body → escape each one,
    // not just the message. (categoryLabel is a fixed server constant; ticketId numeric.)
    emailVars: {
      memberName: escapeHtml(memberName),
      memberEmail: escapeHtml(email),
      ticketCategory: categoryLabel,
      ticketSubject: escapeHtml(subject),
      ticketBody: escapeHtml(message),
      ticketId: String(ticketId),
    },
  }).catch((e) => console.error("support_ticket admin alert failed", e));

  // Confirmation to the member — AWAITED (serverless freezes fire-and-forget sends).
  if (email) {
    await sendTemplateEmail({
      kind: "support-ticket-confirmation",
      to: email,
      vars: {
        displayName: escapeHtml(memberName),
        ticketSubject: escapeHtml(subject),
        ticketCategory: categoryLabel,
        ticketId: String(ticketId),
      },
    }).catch((e) => console.error("support confirmation email failed", ticketId, e));
  }

  return NextResponse.json({ ok: true, ticketId });
}
