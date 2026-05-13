"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { USE_MOCK_DATA } from "@/lib/mock-data";

export async function loginAction(formData: FormData) {
  if (USE_MOCK_DATA) {
    redirect("/app");
  }

  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string) ?? "";

  if (!email || !password) {
    redirect("/login?error=empty");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/app");
}
