import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementBar } from "@/components/landing/announcement-bar";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing/landing-footer";
import { CheckoutClient } from "./checkout-client";

const COHORT_CONFIG: Record<string, { name: string; priceLabel: string; amountCents: number }> = {
  "revalida-2026-2": { name: "Revalida 2026.2", priceLabel: "R$ 3.990", amountCents: 399000 },
  "revalida-2027-1": { name: "Revalida 2027.1", priceLabel: "R$ 4.990", amountCents: 499000 },
};

export const metadata = { title: "Finalizar compra — MedHelpSpace" };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string }>;
}) {
  const { cohort: cohortSlug } = await searchParams;

  // Unknown cohort → back to store
  const config = cohortSlug ? COHORT_CONFIG[cohortSlug] : null;
  if (!config) {
    redirect("/loja");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/checkout?cohort=${cohortSlug}`)}`);
  }

  // Block only if user has an ACTIVE membership in this specific cohort.
  // An expired membership, or a membership in a different cohort, should not block.
  const now = new Date().toISOString();
  const { data: memberships } = await supabase
    .from("user_cohort_memberships")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("cohort:cohorts(slug, membership_starts_at, membership_ends_at)")
    .eq("user_id", user.id);

  const alreadyMember = (memberships ?? []).some((m) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (m as any).cohort as { slug: string; membership_starts_at: string; membership_ends_at: string } | null;
    if (!c) return false;
    return (
      c.slug === cohortSlug &&
      c.membership_starts_at <= now &&
      c.membership_ends_at >= now
    );
  });

  // Fetch the user's display name for the form
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-background">
      <AnnouncementBar />
      <LandingNav />

      <main className="px-5 py-12 md:px-8 md:py-20">
        <div className="mx-auto max-w-4xl">
          <CheckoutClient
            cohortSlug={cohortSlug!}
            cohortName={config.name}
            priceLabel={config.priceLabel}
            amountCents={config.amountCents}
            userEmail={user.email ?? ""}
            userName={profile?.display_name ?? ""}
            alreadyMember={alreadyMember}
            pagbankPublicKey={process.env.NEXT_PUBLIC_PAGBANK_PUBLIC_KEY ?? ""}
          />
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
