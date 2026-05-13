import { createClient } from "@/lib/supabase/server";
import { AdminHeader } from "@/components/layout/admin-header";
import { redirect } from "next/navigation";

export const metadata = { title: { template: "%s | Admin", default: "Painel Admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role === "member") redirect("/app");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AdminHeader />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
