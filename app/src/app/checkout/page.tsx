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

  // Check for existing membership
  const { data: membership } = await supabase
    .from("user_cohort_memberships")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const alreadyMember = !!membership;

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
