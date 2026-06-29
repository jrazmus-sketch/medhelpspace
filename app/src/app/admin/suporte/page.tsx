import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getSupportTicketsList } from "@/lib/admin/support-tickets";
import { SuporteClient } from "./suporte-client";

export const metadata = { title: "Suporte" };

// Support inbox is staffed by super/support/billing admins (content_admin excluded).
const INBOX_ROLES = ["super_admin", "support_admin", "billing_admin"];

export default async function AdminSuportePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role as string | undefined;
  if (!role || !INBOX_ROLES.includes(role)) redirect("/admin");

  const tickets = await getSupportTicketsList();
  return <SuporteClient initialTickets={tickets} />;
}
