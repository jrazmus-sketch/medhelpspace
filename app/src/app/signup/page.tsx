import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { SignupPageClient } from "./signup-client";

export default async function SignupPage() {
  if (!USE_MOCK_DATA) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/app");
  }
  return <SignupPageClient />;
}
