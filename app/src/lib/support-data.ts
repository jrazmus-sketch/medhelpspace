// Server-side data layer for member support tickets. All access goes through the
// service-role client with EXPLICIT ownership filtering by the verified user id
// (same pattern as the member content route): RLS is defense-in-depth, the gate
// lives in app code. Never import this from a client component.

import { createAdminClient } from "@/lib/supabase/admin";
import type { SupportCategory, SupportMessage, SupportTicket } from "@/lib/support";

export type TicketWithMessages = {
  ticket: SupportTicket;
  messages: SupportMessage[];
};

// All of the current member's tickets, newest activity first.
export async function getMyTickets(userId: string): Promise<SupportTicket[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_tickets")
    .select("*")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false });
  if (error) {
    console.error("getMyTickets failed", error);
    return [];
  }
  return (data ?? []) as SupportTicket[];
}

// One ticket + its thread, but ONLY if it belongs to `userId` (IDOR guard).
export async function getMyTicketWithMessages(
  userId: string,
  ticketId: number,
): Promise<TicketWithMessages | null> {
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!ticket) return null;

  const { data: messages } = await admin
    .from("support_ticket_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  return {
    ticket: ticket as SupportTicket,
    messages: (messages ?? []) as SupportMessage[],
  };
}

// Clear the member-unread flag once they open the thread. No-op if not the owner.
export async function markTicketReadByMember(userId: string, ticketId: number): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("support_tickets")
    .update({ member_unread: false })
    .eq("id", ticketId)
    .eq("user_id", userId)
    .eq("member_unread", true);
}

// Anti-double-submit / light spam guard: how many tickets this user opened in the
// last `seconds`. The route handler rejects a new ticket if this is non-zero.
export async function recentTicketCount(userId: string, seconds: number): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - seconds * 1000).toISOString();
  const { count } = await admin
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  return count ?? 0;
}

// Create a ticket + its opening message. Returns the new ticket id, or null on error.
export async function insertMemberTicket(args: {
  userId: string;
  email: string;
  displayName: string | null;
  category: SupportCategory;
  subject: string;
  message: string;
  pageUrl: string | null;
  userAgent: string | null;
}): Promise<number | null> {
  const admin = createAdminClient();

  // Best-effort: tag the ticket with the member's most recent cohort for triage.
  let cohortId: number | null = null;
  try {
    const { data: membership } = await admin
      .from("user_cohort_memberships")
      .select("cohort_id")
      .eq("user_id", args.userId)
      .order("cohort_id", { ascending: false })
      .limit(1)
      .maybeSingle();
    cohortId = (membership?.cohort_id as number | null) ?? null;
  } catch {
    /* cohort is optional context */
  }

  const { data: ticket, error } = await admin
    .from("support_tickets")
    .insert({
      user_id: args.userId,
      email: args.email,
      display_name: args.displayName,
      category: args.category,
      subject: args.subject,
      status: "open",
      page_url: args.pageUrl,
      user_agent: args.userAgent,
      cohort_id: cohortId,
      last_message_from: "member",
      admin_unread: true,
      member_unread: false,
    })
    .select("id")
    .single();

  if (error || !ticket) {
    console.error("insertMemberTicket failed", error);
    return null;
  }

  const ticketId = ticket.id as number;
  const { error: msgError } = await admin.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    author_id: args.userId,
    author_role: "member",
    body: args.message,
  });
  if (msgError) {
    console.error("insertMemberTicket message failed", msgError);
    // Roll back the orphan ticket so the inbox doesn't show an empty thread.
    await admin.from("support_tickets").delete().eq("id", ticketId);
    return null;
  }

  return ticketId;
}

// Append a member reply to a ticket they own. Returns true on success.
export async function insertMemberReply(args: {
  userId: string;
  ticketId: number;
  message: string;
}): Promise<boolean> {
  const admin = createAdminClient();

  // Ownership + current status in one read.
  const { data: ticket } = await admin
    .from("support_tickets")
    .select("id, status")
    .eq("id", args.ticketId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (!ticket) return false;

  const { error: msgError } = await admin.from("support_ticket_messages").insert({
    ticket_id: args.ticketId,
    author_id: args.userId,
    author_role: "member",
    body: args.message,
  });
  if (msgError) {
    console.error("insertMemberReply message failed", msgError);
    return false;
  }

  // A member reply reopens a resolved/closed ticket and flags it unread for staff.
  const status = ticket.status as string;
  const nextStatus = status === "resolved" || status === "closed" ? "open" : status;
  await admin
    .from("support_tickets")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_from: "member",
      admin_unread: true,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.ticketId);

  return true;
}
