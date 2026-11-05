import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Stethoscope } from "lucide-react";
import { SiteText } from "@/components/landing/site-text";
import { SocialLinks } from "@/components/marketing/social-links";
import { ProductCard } from "@/components/home/product-card";
import { LegacyHashForward } from "@/components/home/legacy-hash-forward";

/**
 * MedHelpSpace home page — the two-product chooser (Karina 2026-11-05).
 *
 * www.medhelpspace.com.br is the address in the TikTok/Instagram bios, so it
 * no longer opens the Revalida sales page directly (that moved to /revalida);
 * it presents the two products as two clickable cards, each going to its own
 * sales page. Deliberately simple: no nav, no pricing, no WhatsApp button —
 * each product page carries its own.
 *
 * Copy is editable inline (site_content, `home.*`); product NAMES are the brand
 * lockups and stay in code. Public + dark-only like every marketing page
 * (lib/theme-scope.ts). Static: nothing here reads per-visitor data.
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

const DISPLAY = { fontFamily: "var(--font-bricolage)" } as const;
const FOOT_LINK =
  "inline-flex min-h-11 items-center px-1 text-sm transition-colors hover:text-[var(--lp-fg)] sm:min-h-0";

export default function HomePage() {
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

      <main className="flex flex-1 flex-col justify-center px-4 pb-10 pt-9 sm:px-6 sm:pb-12 sm:pt-20 md:px-8">
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

          <div className="mt-7 grid gap-3 sm:mt-14 sm:gap-6 md:grid-cols-2">
            <ProductCard
              product="revalida"
              href="/revalida"
              ariaLabel="Conhecer o MedHelpSpace Revalida"
              accent="var(--brand)"
              icon={<GraduationCap className="h-6 w-6" />}
              name={
                <>
                  MedHelpSpace{" "}
                  <span
                    style={{
                      // The Revalida wordmark fill — same literal brand hues as
                      // landing-nav / BrandLockup.
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
              cta={<SiteText k="home.revalida.cta" fallback="Conhecer" />}
            />
            <ProductCard
              product="clinact"
              href="/clinact"
              ariaLabel="Conhecer o ClinAct"
              accent="var(--brand-text)"
              icon={<Stethoscope className="h-6 w-6" />}
              name={<span className="text-brand-text">ClinAct</span>}
              description={
                <SiteText k="home.clinact.desc" fallback="Treino de raciocínio clínico com casos interativos." />
              }
              cta={<SiteText k="home.clinact.cta" fallback="Conhecer" />}
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
