import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { getMyTickets } from "@/lib/support-data";
import { SuporteClient } from "./suporte-client";
import type { SupportTicket } from "@/lib/support";

export const metadata = { title: "Suporte" };

// Auth-only (NOT membership-gated): an active member and a locked-out member both
// need to reach support. The /app layout's requireActiveMembership would bounce an
// expired member to /loja, so this page deliberately lives at the top level.
export default async function SuportePage() {
  let tickets: SupportTicket[] = [];

  if (!USE_MOCK_DATA) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    tickets = await getMyTickets(user.id);
  }

  return <SuporteClient initialTickets={tickets} />;
}
