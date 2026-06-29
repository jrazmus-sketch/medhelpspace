// Admin-side reads for the support inbox. Service-role client; the route/page +
// server actions gate access by role (super/support/billing). Mirrors the shape
// of lib/admin/member-detail.ts.

import { createAdminClient } from "@/lib/supabase/admin";
import type { SupportMessage, SupportStatus, SupportTicket } from "@/lib/support";

export type AdminTicketDetail = {
  ticket: SupportTicket;
  messages: SupportMessage[];
};

// Full inbox, unread-for-admin first, then most-recent activity.
export async function getSupportTicketsList(): Promise<SupportTicket[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_tickets")
    .select("*")
    .order("admin_unread", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("getSupportTicketsList failed", error);
    return [];
  }
  return (data ?? []) as SupportTicket[];
}

// Count of tickets needing attention — for the nav badge / dashboard tile.
export async function getSupportOpenCount(): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "in_progress"] satisfies SupportStatus[]);
  return count ?? 0;
}

export async function getAdminTicketDetail(ticketId: number): Promise<AdminTicketDetail | null> {
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
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
