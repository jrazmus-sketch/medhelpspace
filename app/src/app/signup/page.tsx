import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { safeDestination } from "@/lib/ambassadors/ref-link";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { isClinactDestination } from "@/lib/clinact/destination";
import { CLINACT_SHARE_METADATA } from "@/lib/clinact/metadata";
import { SignupPageClient } from "./signup-client";

// An access page, nothing to search for: out of the sitemap and noindex (Karina
// 2026-10-14). Users still reach it normally.
// (Kept inside generateMetadata below — a page cannot export both.)
const NOINDEX: Metadata = { robots: { index: false, follow: true } };
// From ClinAct (a /clinact `next`) the tab and share card name ClinAct, never
// the root layout's "MedHelpSpace Revalida" (Karina 2026-11-03).
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}): Promise<Metadata> {
  const { next } = await searchParams;
  const safe = next && safeDestination(next) === next ? next : null;
  if (!isClinactDestination(safe)) return NOINDEX;
  return { ...NOINDEX, title: { absolute: "Criar conta | MedHelpSpace ClinAct" }, ...CLINACT_SHARE_METADATA };
}

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
