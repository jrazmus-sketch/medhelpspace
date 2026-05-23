"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { EDIT_MODE_COOKIE } from "@/lib/edit-mode";

export async function setEditMode(enabled: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "member") throw new Error("Unauthorized");

  const store = await cookies();
  if (enabled) {
    store.set(EDIT_MODE_COOKIE, "on", {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  } else {
    store.delete(EDIT_MODE_COOKIE);
  }
  revalidatePath("/app", "layout");
}
