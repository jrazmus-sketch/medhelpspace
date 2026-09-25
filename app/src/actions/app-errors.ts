"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Resolved": remove the error's row. If it happens again it comes back as a
 * new error (count 1, first seen now) — which is exactly the signal wanted
 * after a fix. super_admin only, like the page.
 */
export async function resolveAppError(id: number): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "super_admin" || !Number.isInteger(id)) return { ok: false };
  const { error } = await admin.from("app_errors").delete().eq("id", id);
  revalidatePath("/admin/erros");
  return { ok: !error };
}
