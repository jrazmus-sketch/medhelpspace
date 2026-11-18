"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { get60dAccess } from "@/lib/medhelp-60d";

// NOTE: a "use server" module may only export async functions.

const KEY = /^(formula|memore|sim|sim-correcao):[0-9]+$/;

/**
 * MedHelp 60D manual checklist: tick or untick one item of the schedule. The student's own row only (RLS), and only
 * while the module is open for them. Returns a value (Server Action errors are redacted in production).
 */
export async function setD60Check(itemKey: string, checked: boolean): Promise<{ ok: boolean }> {
  if (typeof itemKey !== "string" || !KEY.test(itemKey)) return { ok: false };
  const { unlocked } = await get60dAccess();
  if (!unlocked) return { ok: false };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = checked
    ? await supabase.from("medhelp60_checks").upsert({ user_id: user.id, item_key: itemKey }, { onConflict: "user_id,item_key", ignoreDuplicates: true })
    : await supabase.from("medhelp60_checks").delete().eq("user_id", user.id).eq("item_key", itemKey);
  if (error) return { ok: false };
  revalidatePath("/app/medhelp-60d");
  revalidatePath("/app/plano");
  return { ok: true };
}
