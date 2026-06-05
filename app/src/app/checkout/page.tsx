import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnnouncementBar } from "@/components/landing/announcement-bar";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing/landing-footer";
import { CheckoutClient } from "./checkout-client";
import { getCohortProduct } from "@/lib/queries/cohort-products";
import { getInstallmentOptions } from "@/lib/pagbank/api";

export const metadata = { title: "Finalizar compra — MedHelpSpace" };

// Always render against live auth + order state. A buyer who generated a Pix QR is
// silently logged in; serving a stale (logged-out) checkout would re-show the signup
// step and collide with their own just-created account.
export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string }>;
}) {
  const { cohort: cohortSlug } = await searchParams;

  // Unknown or not-for-sale cohort → back to store
  const config = cohortSlug ? await getCohortProduct(cohortSlug) : null;
  if (!config) {
    redirect("/loja");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Guest checkout: anonymous visitors see the form with inline signup/login fields.
  // The charge route handles auth in the same POST as the charge itself.

  let userEmail = "";
  let userName = "";
  let alreadyMember = false;
  let initialBilling: Record<string, string> | null = null;
  let initialPixResult: {
    orderId: string;
    chargeId: string;
    pixQrText: string;
    pixQrImageUrl: string | null;
    pixExpiresAt: string | null;
  } | null = null;

  if (user) {
    // Block only if user has an ACTIVE membership in this specific cohort.
    // An expired membership, or a membership in a different cohort, should not block.
    const now = new Date().toISOString();
    const { data: memberships } = await supabase
      .from("user_cohort_memberships")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("cohort:cohorts(slug, membership_starts_at, membership_ends_at)")
      .eq("user_id", user.id);

    alreadyMember = (memberships ?? []).some((m) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (m as any).cohort as { slug: string; membership_starts_at: string; membership_ends_at: string } | null;
      if (!c) return false;
      return (
        c.slug === cohortSlug &&
        c.membership_starts_at <= now &&
        c.membership_ends_at >= now
      );
    });

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "display_name, billing_first_name, billing_last_name, billing_cpf, billing_cep, billing_address, billing_number, billing_neighborhood, billing_city, billing_state, billing_phone",
      )
      .eq("id", user.id)
      .single();

    userEmail = user.email ?? "";
    userName = profile?.display_name ?? "";

    // Prefill the billing form for returning buyers (only when we have data).
    if (profile?.billing_cpf) {
      initialBilling = {
        firstName: profile.billing_first_name ?? "",
        lastName: profile.billing_last_name ?? "",
        cpf: profile.billing_cpf ?? "",
        cep: profile.billing_cep ?? "",
        address: profile.billing_address ?? "",
        number: profile.billing_number ?? "",
        neighborhood: profile.billing_neighborhood ?? "",
        city: profile.billing_city ?? "",
        state: profile.billing_state ?? "",
        phone: profile.billing_phone ?? "",
      };
    }

    // Resume a still-valid pending Pix order. If the buyer generated a QR and then
    // navigated away (or hit the browser back button), bring them straight back to
    // the same QR instead of a fresh form — the charge route would reuse this order
    // anyway, and this avoids the signup-step collision entirely.
    if (!alreadyMember) {
      const admin = createAdminClient();
      const nowIso = new Date().toISOString();
      const { data: pending } = await admin
        .from("orders")
        .select("id, pagbank_order_id, pix_qr_text, pix_qr_image_url, pix_expires_at")
        .eq("user_id", user.id)
        .eq("cohort_id", config.id)
        .eq("payment_method", "pix")
        .eq("status", "pending")
        .gt("pix_expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pending?.pix_qr_text && pending?.pagbank_order_id) {
        initialPixResult = {
          orderId: pending.id as string,
          chargeId: pending.pagbank_order_id as string,
          pixQrText: pending.pix_qr_text as string,
          pixQrImageUrl: (pending.pix_qr_image_url as string | null) ?? null,
          pixExpiresAt: (pending.pix_expires_at as string | null) ?? null,
        };
      }
    }
  }

  // Default installment ladder (mainstream brands) for first paint — refined
  // client-side once the card BIN is known. Tolerate a PagBank outage: the card
  // form falls back to fetching/à-vista if this is empty.
  const initialInstallments = await getInstallmentOptions(config.priceCents).catch(() => []);

  return (
    <div className="min-h-screen bg-background">
      <AnnouncementBar />
      <LandingNav embedded />

      <main className="px-5 py-12 md:px-8 md:py-20">
        <div className="mx-auto max-w-4xl">
          <CheckoutClient
            cohortSlug={cohortSlug!}
            cohortName={config.name}
            priceLabel={config.priceLabel}
            amountCents={config.priceCents}
            isLoggedIn={!!user}
            userEmail={userEmail}
            userName={userName}
            alreadyMember={alreadyMember}
            pagbankPublicKey={process.env.NEXT_PUBLIC_PAGBANK_PUBLIC_KEY ?? ""}
            initialInstallments={initialInstallments}
            initialBilling={initialBilling}
            initialPixResult={initialPixResult}
          />
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
