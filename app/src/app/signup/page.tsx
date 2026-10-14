import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { safeDestination } from "@/lib/ambassadors/ref-link";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { SignupPageClient } from "./signup-client";

// An access page, nothing to search for: out of the sitemap and noindex (Karina
// 2026-10-14). Users still reach it normally.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  // Attacker-controlled, same guard as everywhere else `next` is honoured.
  const next = rawNext && safeDestination(rawNext) === rawNext ? rawNext : null;

  if (!USE_MOCK_DATA) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect(next ?? "/app");
  }
  return <SignupPageClient next={next} />;
}
