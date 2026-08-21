import type { Metadata } from "next";
import Link from "next/link";
import { FunnelBeacon } from "@/components/magnet/funnel-beacon";
import { SimuladoGate } from "@/components/magnet/simulado-gate";
import { SiteText } from "@/components/landing/site-text";
import type { MagnetUtm } from "@/components/magnet/magnet-quiz";
import { getActiveCohortOptions } from "@/lib/magnet/simulado";
// SimuladoPeek, SimuladoFaq and getSimuladoAreaCounts are no longer imported:
// the sections that used them were removed 2026-07-26 (see the note in <main>).
// The components and the loader are kept in the repo for an easy restore.

// PUBLIC, indexable, dark-only landing for the free 100-question simulado — the
// third lead funnel. The questions are 100 QUESTÕES INÉDITAS written in the style
// of the INEP 1ª etapa (not recycled past exams), delivered with a fully commented
// gabarito. The exam starts immediately after the form — no inbox round-trip — and
// the emailed link is for resuming. Lives OUTSIDE the /app gate. All copy is
// SiteText-wired (sim.*) so Karina can edit it in the visual editor.

// The link-preview card is DELIBERATELY separate from the Google snippet below.
// The <title>/description are written for a search result (keyword-first, long);
// the openGraph/twitter block is written for a WhatsApp group (short, benefit-first,
// "grátis" up front), because that is where this funnel actually gets shared.
//
// Both openGraph and twitter MUST be spelled out here. Next.js does NOT deep-merge
// them with the root layout — a page that omits openGraph inherits the layout's
// entire object, so /simulado-revalida previewed as the generic site card
// ("MedHelpSpace Revalida" + /og-image.png) no matter what title it set. Any new
// funnel page needs its own block for the same reason.
// Karina, 2026-08-21: the card has to name what only MedHelpSpace has (AudioCards,
// MedVoice, MemoreCards) and it has to push the click. So the title opens on the
// imperative + "grátis", the description names the differentiators and closes on the
// CTA, and og-simulado-revalida.png carries a literal "Começar agora →" button plus a
// "NA PLATAFORMA" strip listing the five products.
//
// The differentiators are deliberately framed as what is ON THE PLATFORM, never as
// part of the free offer: this URL lands on a form for the free 100-question simulado,
// and AudioCards/MedVoice are paid. Naming them as the giveaway would be a promise the
// landing page does not keep. Same reason "Sem cartão." stays out (Karina, 2026-07-26).
//
// Product names match the app's canonical spelling (see components/magnet/platform-peek).
// Keep the description at ~110 characters or less — WhatsApp truncates past that and
// the CTA is the first thing lost.
const OG_TITLE = "Faça grátis: simulado Revalida com 100 questões inéditas";
const OG_DESCRIPTION =
  "Gabarito comentado alternativa por alternativa. Na plataforma: MedVoice, AudioCards, Flashcards. Comece agora.";
const OG_IMAGE = "https://medhelpspace.com.br/og-simulado-revalida.png";

export const metadata: Metadata = {
  title: "Simulado Revalida Grátis | 100 Questões Estilo INEP | Gabarito Comentado",
  description:
    // "Sem cartão." was dropped here too (2026-07-26): Karina struck the claim
    // from the visible copy, and this is the same claim in the Google snippet.
    "Faça grátis um simulado com 100 questões inéditas no estilo INEP e gabarito comentado. Teste seu nível, identifique lacunas e descubra o que revisar.",
  alternates: { canonical: "/simulado-revalida" },
  openGraph: {
    siteName: "MedHelpSpace",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: "https://medhelpspace.com.br/simulado-revalida",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Simulado gratuito do Revalida com 100 questões inéditas — MedVoice, AudioCards, Flashcards, MemoreCards e Resumos",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export const dynamic = "force-dynamic"; // reads UTM from the query string

export default async function SimuladoRevalidaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const cohorts = await getActiveCohortOptions();
  const pick = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const utm: MagnetUtm = {
    source: pick("utm_source"),
    medium: pick("utm_medium"),
    campaign: pick("utm_campaign"),
    term: pick("utm_term"),
    content: pick("utm_content"),
    gclid: pick("gclid"),
  };

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden text-foreground"
      style={{ background: "radial-gradient(ellipse 140% 85% at 50% -8%, #1d1042 0%, #120a2b 44%, #08041a 100%)" }}
    >
      <FunnelBeacon utm={utm} funnel="simulado-100" />

      {/* ── "ECG-world" backdrop (matches the front page + flashcards funnel) ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[120vh] overflow-hidden"
        style={{
          maskImage: "linear-gradient(to bottom, #000 0%, #000 46%, transparent 92%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 46%, transparent 92%)",
        }}
      >
        <div
          className="absolute"
          style={{
            inset: "-25% -12%",
            backgroundImage:
              "linear-gradient(rgba(150,115,245,0.085) 1px, transparent 1px), linear-gradient(90deg, rgba(150,115,245,0.085) 1px, transparent 1px), linear-gradient(rgba(120,90,215,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(120,90,215,0.035) 1px, transparent 1px)",
            backgroundSize: "104px 104px, 104px 104px, 26px 26px, 26px 26px",
            transform: "perspective(1100px) rotateX(24deg)",
            transformOrigin: "50% 40%",
          }}
        />
      </div>

      {/* Layered ambient glows + edge vignette. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(44% 32% at 82% 0%, rgba(192,132,232,0.22), transparent 60%), radial-gradient(38% 26% at 70% 8%, rgba(240,170,140,0.09), transparent 62%), radial-gradient(42% 34% at 6% 14%, rgba(122,29,145,0.20), transparent 58%), radial-gradient(ellipse 90% 42% at 50% 110%, rgba(122,29,145,0.10), transparent 72%), linear-gradient(to right, rgba(3,1,9,0.5), transparent 15%, transparent 85%, rgba(3,1,9,0.5))",
        }}
      />

      {/* Subtle film grain for texture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.035] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Minimal brand bar */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-sm font-bold tracking-tight">
            MedHelp<span className="text-brand">Space</span>
          </Link>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <SiteText as="span" k="sim.topbar.label" fallback="Revalida · 1ª etapa" />
          </span>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero: pitch (left) + gate (right) ─────────────────────────────── */}
        {/* items-START, not items-center: the columns are never the same height,
            and centering a short column against a tall form leaves it floating in
            the middle with dead space above and below. */}
        <section className="mx-auto grid max-w-6xl items-start gap-10 px-5 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-muted/30 px-3 py-1 text-xs font-semibold text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              <SiteText as="span" k="sim.hero.badge" fallback="Grátis · 100 questões inéditas" />
            </span>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              <SiteText as="span" k="sim.hero.title_1" fallback="Simulado Revalida gratuito com" />{" "}
              <span className="bg-gradient-to-r from-brand to-[#c084e8] bg-clip-text text-transparent">
                <SiteText as="span" k="sim.hero.title_accent" fallback="100 questões inéditas" />
              </span>
              {/* autoSpace, not a literal {" "}: this tail is "." in the seed but
                  Karina edits it to real words ("e comentadas."). Without it the
                  word glues onto the accent span and can never wrap. */}
              <SiteText as="span" autoSpace k="sim.hero.title_2" fallback="." />
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              <SiteText
                as="span"
                multiline
                k="sim.hero.subhead"
                fallback="Treine com questões no estilo da prova do INEP, revise as cinco grandes áreas e use o gabarito comentado para compreender seus erros e direcionar melhor seus estudos."
              />
            </p>

            {/* The bold stat strip was removed 2026-07-26 (Karina): the "100" and
                its description repeated the headline and the first checklist item
                three lines below it. Keys sim.hero.stat / sim.hero.stat_label were
                dropped from site_content in the same patch. */}

            {/* "O que você vai receber" lives on the LEFT now: it's pitch, not form,
                and it gives this column the height it was missing. */}
            <ul className="mt-6 space-y-2.5">
              {[
                { k: "sim.get.0", fallback: "100 questões inéditas no estilo da 1ª etapa" },
                { k: "sim.get.1", fallback: "Clínica Médica, Cirurgia, Pediatria, GO e Saúde Coletiva" },
                { k: "sim.get.2", fallback: "Gabarito com comentários sobre todas as alternativas" },
                { k: "sim.get.3", fallback: "Sem limite de tempo — seu progresso fica salvo" },
              ].map((item) => (
                <li key={item.k} className="flex items-start gap-2.5 text-[15px] text-muted-foreground">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-muted/60 text-[10px] font-bold text-brand"
                  >
                    ✓
                  </span>
                  <SiteText as="span" k={item.k} fallback={item.fallback} />
                </li>
              ))}
            </ul>

            {/* The three things that actually dissolve the hesitation, said where
                the hesitation happens rather than after signup. */}
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
              {[
                { k: "sim.hero.re_0", fallback: "Grátis" },
                { k: "sim.hero.re_1", fallback: "Sem cronômetro" },
                { k: "sim.hero.re_2", fallback: "Pare e volte quando quiser" },
              ].map((item) => (
                <span key={item.k} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="text-brand">
                    ✓
                  </span>
                  <SiteText as="span" k={item.k} fallback={item.fallback} />
                </span>
              ))}
            </div>

            {/* The "mesmas 100 questões que entregamos aos nossos alunos" quote-bar
                was removed 2026-07-26 (Karina). Key sim.hero.trust dropped from
                site_content in the same patch. */}
          </div>

          {/* Right column: the form, and only the form. */}
          <div className="lg:sticky lg:top-8">
            <SimuladoGate utm={utm} cohorts={cohorts} />
          </div>
        </section>

        {/* ── EVERYTHING BELOW THE HERO WAS REMOVED 2026-07-26 (Karina) ───────
            She confirmed explicitly: this is the page a Google ad lands on, and
            she wants the hero and nothing else. Removed, in page order:

              <SimuladoPeek />          product screenshots ("Veja por dentro")
              five grandes áreas        the per-área question counts grid
              "Como funciona"           the 3-step Cadastre-se / Resolva / Revise
              <SimuladoFaq />           the FAQ accordion
              final CTA band            headline + a second copy of SimuladoGate

            The COMPONENTS are intentionally still in the repo, and their
            site_content rows (sim.peek.*, sim.blocos.*, sim.how.*, sim.faq.*,
            sim.final.*) are intentionally still in the database. Unlike the three
            hero keys dropped in the same patch, this is a scope decision that is
            easy to reverse and a large body of Karina's copy — deleting it to
            keep the visual editor tidy would be trading something expensive for
            something cheap. Those keys are DORMANT: they will show in the editor
            and edits to them will not appear anywhere.

            Restoring is re-adding the JSX; nothing else has to change. */}
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-xs text-muted-foreground">
          <span>
            <SiteText as="span" k="sim.footer.copyright" fallback="© MedHelpSpace" />
          </span>
          <span className="flex gap-4">
            <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link href="/termos" className="hover:text-foreground">Termos</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
