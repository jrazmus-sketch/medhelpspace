import type { Metadata } from "next";
import Link from "next/link";
import { SiteText } from "@/components/landing/site-text";
import { SocialLinks } from "@/components/marketing/social-links";
import { ProductCard } from "@/components/home/product-card";
import { OfferStripBar } from "@/components/home/offer-strip";
import { LegacyHashForward } from "@/components/home/legacy-hash-forward";
import { getCohortsForSale } from "@/lib/queries/cohort-products";
import { getLandingStats } from "@/lib/landing/stats";
import { getSiteContent } from "@/lib/queries/site-content";
import { isSalesImageUrl } from "@/lib/clinact/sales-images";
import { activePromotion } from "@/lib/clinact/plans";
import { FORMATS, FORMAT_COLOR_VARS } from "@/lib/clinact/types";
import { todayKeyBR } from "@/lib/br-date";
import { buildOfferStrip } from "@/lib/home/offers";

/**
 * MedHelpSpace home page — the two-product hub (Karina 2026-11-05).
 *
 * www.medhelpspace.com.br is the address in the TikTok/Instagram bios, so it
 * no longer opens the Revalida sales page directly (that moved to /revalida).
 * A bare "choose" page loses visitors at the extra click, so each card shows
 * its product: a real phone screenshot, live proof chips, the main button and
 * a free way in. A strip on top carries the running offers, computed from the
 * same data as the sales pages, and disappears when they end.
 *
 * Copy is editable inline (site_content `home.*`); product names are the brand
 * lockups, numbers are counted, offers are computed. Public + dark-only like
 * every marketing page (lib/theme-scope.ts).
 */

const TITLE = "MedHelpSpace — Revalida e ClinAct";
const DESCRIPTION =
  "MedHelpSpace Revalida: preparação para o Revalida INEP. ClinAct: treino de raciocínio clínico com casos interativos.";
const OG_IMAGE = "https://www.medhelpspace.com.br/og-home.png";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  // Spelled out in full: Next does NOT deep-merge openGraph/twitter. og:url is
  // omitted on purpose (see simulado-revalida/page.tsx).
  openGraph: {
    siteName: "MedHelpSpace",
    title: TITLE,
    description: DESCRIPTION,
    locale: "pt_BR",
    type: "website",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "MedHelpSpace — Revalida e ClinAct" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

// Hourly ISR, like the Revalida page: counts and offers are re-read at most an
// hour late, and the 00:01 BRT storefront refresh drops this page too, so an
// offer that ends at midnight leaves the strip with it.
export const revalidate = 3600;

const DISPLAY = { fontFamily: "var(--font-bricolage)" } as const;
const FOOT_LINK =
  "inline-flex min-h-11 items-center px-1 text-sm transition-colors hover:text-[var(--lp-fg)] sm:min-h-0";
const nf = new Intl.NumberFormat("pt-BR");

/** The Revalida phone screenshot (same capture as the sales page). */
const REVALIDA_SHOT = "/landing/shot-questoes.webp";

export default async function HomePage() {
  const [cohorts, stats, content] = await Promise.all([getCohortsForSale(), getLandingStats(), getSiteContent()]);
  const offers = buildOfferStrip(cohorts, activePromotion(todayKeyBR()));
  // ClinAct's screenshot is the admin-replaceable "casos" slot of its sales page
  // (/admin/clinact/pagina); no image set → the card simply shows no phone.
  const clinactShot = content["clinact.casos.image"]?.value;

  return (
    <div className="relative isolate flex min-h-svh flex-col overflow-hidden" style={{ background: "var(--lp-base)" }}>
      <LegacyHashForward />
      <div className="lp-grain" aria-hidden="true" />
      {/* Light from above, as on both sales pages — decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem]"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 50% 0%, color-mix(in srgb, var(--brand) 42%, transparent), transparent 72%)",
        }}
      />

      {offers ? <OfferStripBar strip={offers} /> : null}

      <main className="flex flex-1 flex-col justify-center px-4 pb-10 pt-8 sm:px-6 sm:pb-12 sm:pt-16 md:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <header className="text-center">
            <h1
              className="text-[clamp(2.4rem,11vw,4.75rem)] font-extrabold leading-none tracking-[-0.03em]"
              style={{ ...DISPLAY, color: "var(--lp-fg)" }}
            >
              MedHelp<span className="text-brand-text">Space</span>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base leading-relaxed sm:mt-4 sm:text-xl" style={{ color: "var(--lp-fg-85)" }}>
              <SiteText k="home.subtitle" fallback="Escolha o produto que você quer conhecer." />
            </p>
          </header>

          {/* Two columns only from lg: at md the cards would be phone-narrow with
              the desktop type size, and the title would run under the phone. */}
          <div className="mt-7 grid gap-4 sm:mt-12 sm:gap-6 lg:grid-cols-2">
            <ProductCard
              product="revalida"
              href="/revalida"
              ariaLabel="Conhecer o MedHelpSpace Revalida"
              accent="var(--brand)"
              // The Revalida wordmark fill (landing-nav / BrandLockup).
              stripe="linear-gradient(90deg, #a855f7 0%, #e879f9 100%)"
              shot={{ src: REVALIDA_SHOT }}
              name={
                <>
                  MedHelpSpace{" "}
                  <span
                    style={{
                      backgroundImage: "linear-gradient(120deg, #a855f7 0%, #e879f9 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      color: "transparent",
                    }}
                  >
                    Revalida
                  </span>
                </>
              }
              description={<SiteText k="home.revalida.desc" fallback="Preparação para o Revalida INEP." />}
              // Live counts — the same numbers as the sales page's "big numbers" band.
              proof={[
                { key: "q", label: `${nf.format(stats.questoes)} questões` },
                { key: "f", label: `${nf.format(stats.flashcards)} flashcards` },
                { key: "e", label: `${stats.especialidades} especialidades` },
              ]}
              cta={<SiteText k="home.revalida.cta" fallback="Conhecer" />}
              free={{
                label: <SiteText k="home.revalida.free" fallback="Teste 50 flashcards grátis" />,
                href: "/flashcards-revalida",
                // Same GA4 event as the sales page's free-flashcards link.
                event: { name: "click_free_flashcards" },
              }}
            />
            <ProductCard
              product="clinact"
              href="/clinact"
              ariaLabel="Conhecer o ClinAct"
              accent="var(--brand-text)"
              // The four format colours, in their fixed order (types.ts).
              stripe={`linear-gradient(90deg, ${FORMATS.map((f, i) => `${FORMAT_COLOR_VARS[f]} ${i * 25}% ${(i + 1) * 25}%`).join(", ")})`}
              shot={isSalesImageUrl(clinactShot) ? { src: clinactShot } : null}
              name={<span className="text-brand-text">ClinAct</span>}
              description={
                <SiteText k="home.clinact.desc" fallback="Treino de raciocínio clínico com casos interativos." />
              }
              // No case count: Karina's decision 5 (CLINACT-SALES-PAGE-SPEC.md) —
              // the library is "em expansão contínua", never a number.
              proof={[
                {
                  key: "fmt",
                  label: `${FORMATS.length} formatos`,
                  dot: FORMAT_COLOR_VARS[FORMATS[0]],
                },
                {
                  key: "sem",
                  label: <SiteText k="home.clinact.semanal" fallback="Novos casos toda semana" />,
                  dot: FORMAT_COLOR_VARS[FORMATS[2]],
                },
              ]}
              cta={<SiteText k="home.clinact.cta" fallback="Conhecer" />}
              free={{
                label: <SiteText k="home.clinact.free" fallback="Experimentar os 4 casos grátis" />,
                // Signup-first for the free cases (her decision 1), exactly like
                // the ClinAct sales page; a signed-in visitor goes straight in.
                href: "/signup?next=%2Fclinact%2Fgratis",
                hrefLoggedIn: "/clinact/gratis",
                event: { name: "click_free_clinact_cases" },
              }}
            />
          </div>

          {/* Members typing the bare address to log in: one tap to the right login,
              branded per product (a /clinact `next` shows the ClinAct lockup). */}
          <p className="mt-6 text-center text-sm sm:mt-10" style={{ color: "var(--lp-fg-85)" }}>
            Já é aluno?{" "}
            <Link href="/login" className="inline-flex min-h-11 items-center px-1 font-semibold text-brand-text underline-offset-4 hover:underline">
              Entrar no Revalida
            </Link>
            <span aria-hidden="true" style={{ color: "var(--lp-fg-40)" }}>·</span>
            <Link
              href="/login?next=%2Fclinact%2Ftreinar"
              className="inline-flex min-h-11 items-center px-1 font-semibold text-brand-text underline-offset-4 hover:underline"
            >
              Entrar no ClinAct
            </Link>
          </p>
        </div>
      </main>

      <footer className="border-t px-4 py-6 sm:px-6 md:px-8" style={{ borderColor: "var(--lp-border)" }}>
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <SocialLinks color="var(--lp-fg-75)" />
          <nav aria-label="Links legais e contato" className="flex flex-wrap items-center justify-center gap-x-4" style={{ color: "var(--lp-fg-75)" }}>
            <Link href="/termos" className={FOOT_LINK}>Termos de Uso</Link>
            <Link href="/privacidade" className={FOOT_LINK}>Política de Privacidade</Link>
            <a href="mailto:contato@medhelpspace.com.br" className={FOOT_LINK}>contato@medhelpspace.com.br</a>
          </nav>
        </div>
        <p className="mt-4 text-center text-xs" style={{ color: "var(--lp-fg-75)" }}>
          <SiteText k="footer.copyright" fallback="© 2026 MedHelpSpace. Todos os direitos reservados." />
        </p>
      </footer>
    </div>
  );
}
