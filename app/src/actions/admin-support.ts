"use server";

// Admin support-inbox mutations. Staffed by super/support/billing admins (decision:
// same trio as MEMBER_ACCESS_ROLES). Replying notifies the member in-app + by email.
//
// INVARIANT: a "use server" module exports ONLY async functions. The role-check,
// audit-log, and text helpers below are module-internal (not exported).

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { sendTemplateEmail } from "@/lib/email";
import { getAdminTicketDetail, type AdminTicketDetail } from "@/lib/admin/support-tickets";
import { isSupportStatus, MESSAGE_MAX, type SupportMessage } from "@/lib/support";

const SUPPORT_INBOX_ROLES = ["super_admin", "support_admin", "billing_admin"];

async function requireSupportRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role as string | undefined;
  if (!role || !SUPPORT_INBOX_ROLES.includes(role)) throw new Error("Unauthorized");
  return { user, role };
}

async function writeAuditLog(
  actorId: string,
  action: string,
  targetUserId: string | null,
  details: Record<string, unknown>,
) {
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    actor_user_id: actorId,
    action,
    target_user_id: targetUserId,
    details,
  });
}

function excerpt(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

// Load a ticket + thread for the admin drawer, marking it read for staff.
export async function loadTicketDetail(ticketId: number): Promise<AdminTicketDetail | null> {
  await requireSupportRole();
  const detail = await getAdminTicketDetail(ticketId);
  if (!detail) return null;
  const admin = createAdminClient();
  await admin
    .from("support_tickets")
    .update({ admin_unread: false })
    .eq("id", ticketId)
    .eq("admin_unread", true);
  return detail;
}

export async function replyToTicket(
  ticketId: number,
  body: string,
): Promise<{ ok: true; message: SupportMessage } | { error: string }> {
  const { user } = await requireSupportRole();
  const text = typeof body === "string" ? body.trim() : "";
  if (text.length < 1 || text.length > MESSAGE_MAX) return { error: "invalid_message" };

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return { error: "not_found" };

  const { data: msg, error: msgErr } = await admin
    .from("support_ticket_messages")
    .insert({ ticket_id: ticketId, author_id: user.id, author_role: "admin", body: text })
    .select("*")
    .single();
  if (msgErr || !msg) return { error: "save_failed" };

  const nextStatus = ticket.status === "open" ? "in_progress" : (ticket.status as string);
  await admin
    .from("support_tickets")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_from: "admin",
      member_unread: true,
      admin_unread: false,
      handled_by: user.id,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);

  // ── Notify the member (best-effort; never sink the reply that's already saved) ──
  const memberId = ticket.user_id as string;
  const memberEmail = ticket.email as string;
  const memberName =
    (ticket.display_name as string | null) || memberEmail.split("@")[0] || "Membro";
  const subject = ticket.subject as string;

  const { error: notifErr } = await admin.from("user_notifications").insert({
    user_id: memberId,
    kind: "support_reply",
    title: "Resposta do suporte",
    body: excerpt(text, 120),
    href: `/suporte/${ticketId}`,
    icon: "mail",
  });
  if (notifErr) console.error("support reply notification failed", ticketId, notifErr);

  if (memberEmail) {
    await sendTemplateEmail({
      kind: "support-ticket-reply",
      to: memberEmail,
      vars: {
        // Member-controlled fields land in an HTML email body → escape each.
        displayName: escapeHtml(memberName),
        ticketSubject: escapeHtml(subject),
        replyExcerpt: escapeHtml(excerpt(text, 300)),
        ticketId: String(ticketId),
      },
    }).catch((e) => console.error("support reply email failed", ticketId, e));
  }

  await writeAuditLog(user.id, "support_ticket_reply", memberId, { ticket_id: ticketId });
  revalidatePath("/admin/suporte");
  return { ok: true, message: msg as SupportMessage };
}

export async function updateTicketStatus(
  ticketId: number,
  status: string,
): Promise<{ ok: true } | { error: string }> {
  const { user } = await requireSupportRole();
  if (!isSupportStatus(status)) return { error: "invalid_status" };

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("support_tickets")
    .select("user_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return { error: "not_found" };

  await admin
    .from("support_tickets")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", ticketId);

  await writeAuditLog(user.id, "support_ticket_status", ticket.user_id as string, {
    ticket_id: ticketId,
    status,
  });
  revalidatePath("/admin/suporte");
  return { ok: true };
}
