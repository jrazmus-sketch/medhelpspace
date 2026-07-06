import type { Metadata } from "next";
import Link from "next/link";
import { FunnelBeacon } from "@/components/magnet/funnel-beacon";
import { FlashcardsGate } from "@/components/magnet/flashcards-gate";
import { FlashcardTeaser } from "@/components/magnet/flashcard-teaser";
import type { MagnetUtm } from "@/components/magnet/magnet-quiz";
import {
  getSampleFlashcardsForSpecialties,
  WEIGHTED_DECK_PLAN,
  WEIGHTED_DECK_STATS,
} from "@/lib/magnet/flashcards";

// PUBLIC, indexable, dark-only landing page — the gift-first A/B variant vs.
// /questoes-revalida. Email gate up front; the 50-card weighted deck is delivered by
// a magic link (see /flashcards-revalida/acesso). Lives OUTSIDE the /app gate.

export const metadata: Metadata = {
  title: "50 Flashcards Grátis do Revalida — Os Assuntos que Mais Caem",
  description:
    "Baixe grátis 50 flashcards da 1ª etapa do Revalida, dos 6 assuntos de altíssima incidência das provas de 2020 a 2025. Com revisão espaçada e correção na hora. Sem cartão.",
  alternates: { canonical: "/flashcards-revalida" },
};

export const dynamic = "force-dynamic"; // reads UTM from the query string

const MAX_INCIDENCE = Math.max(...WEIGHTED_DECK_PLAN.map((s) => s.pastExamQuestions));

export default async function FlashcardsRevalidaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
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

  // A few real cards from the top subjects for the flip teaser (light query — the
  // full 50-card weighted deck is only assembled on the post-magic-link /acesso page).
  // Never let a teaser-fetch hiccup 500 a paid-ads landing page — degrade to no teaser.
  const teaserCards = await getSampleFlashcardsForSpecialties([16, 17, 15, 14], 4).catch(
    () => [],
  );

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden text-foreground"
      style={{ background: "radial-gradient(ellipse 140% 85% at 50% -8%, #160a34 0%, #0a0620 44%, #030109 100%)" }}
    >
      <FunnelBeacon utm={utm} />

      {/* ── "ECG-world" backdrop (matches the front page) ──────────────────────
          A perspective-tilted glowing purple grid receding behind the hero,
          faded out before the content sections. CSS-only (no canvas) so the page
          stays a fast server component. */}
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
              "linear-gradient(rgba(140,100,240,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(140,100,240,0.16) 1px, transparent 1px), linear-gradient(rgba(110,80,210,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(110,80,210,0.07) 1px, transparent 1px)",
            backgroundSize: "84px 84px, 84px 84px, 21px 21px, 21px 21px",
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
            "radial-gradient(44% 32% at 82% 0%, rgba(192,132,232,0.20), transparent 60%), radial-gradient(42% 34% at 6% 14%, rgba(122,29,145,0.20), transparent 58%), radial-gradient(ellipse 90% 42% at 50% 110%, rgba(122,29,145,0.10), transparent 72%), linear-gradient(to right, rgba(3,1,9,0.5), transparent 15%, transparent 85%, rgba(3,1,9,0.5))",
        }}
      />

      {/* Subtle film grain for texture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] mix-blend-soft-light"
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
            Revalida · 1ª etapa
          </span>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero: pitch (left) + gate (right), vertically centered so neither
               column looks lopsided above the fold. ─────────────────────────── */}
        <section className="mx-auto grid max-w-6xl items-start gap-10 px-5 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-muted/30 px-3 py-1 text-xs font-semibold text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Grátis · sem cartão
            </span>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              50 flashcards dos assuntos que{" "}
              <span className="bg-gradient-to-r from-brand to-[#c084e8] bg-clip-text text-transparent">
                mais caem
              </span>{" "}
              no Revalida.
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              Um baralho pronto com os temas de <strong className="text-foreground">maior incidência</strong>{" "}
              da 1ª etapa — com revisão espaçada e correção na hora. Escolhidos por dados reais das provas
              de {WEIGHTED_DECK_STATS.examYears}.
            </p>

            {/* The one bold stat — the credibility hook. */}
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-border/80 bg-surface-1/50 p-4 backdrop-blur-sm">
              <div className="shrink-0 text-center">
                <div className="font-display text-3xl font-extrabold tabular-nums text-brand sm:text-4xl">
                  {WEIGHTED_DECK_STATS.sixSubjectSharePct}%
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  da prova
                </div>
              </div>
              <p className="text-sm leading-snug text-muted-foreground">
                Organizamos <strong className="text-foreground">{WEIGHTED_DECK_STATS.examQuestionsAnalyzed} questões</strong>{" "}
                das provas de {WEIGHTED_DECK_STATS.examYears} por tema.{" "}
                <strong className="text-foreground">{WEIGHTED_DECK_STATS.sixSubjectQuestions}</strong> delas se concentram em
                6 assuntos de altíssima incidência. Seus 50 flashcards saem dos temas mais relevantes deles.
              </p>
            </div>
          </div>

          {/* The gate — the focal point — with a compact "what you get" strip
              beneath it so the right column carries real weight (no more void). */}
          <div>
            <FlashcardsGate utm={utm} />
            <ul className="mt-5 space-y-2.5 px-1">
              {[
                <>
                  <strong className="text-foreground">50 flashcards</strong> dos 6 assuntos que mais caem
                </>,
                <>
                  <strong className="text-foreground">Revisão espaçada</strong> de verdade — não é PDF
                </>,
                <>
                  O link chega <strong className="text-foreground">na hora</strong>, no seu e-mail
                </>,
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-muted/60 text-[10px] font-bold text-brand"
                  >
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Card teaser (instant proof) — its own centered moment ───────────── */}
        {teaserCards.length > 0 && (
          <section className="mx-auto max-w-xl px-5 pb-8 sm:pb-12">
            <p className="mb-4 text-center font-mono text-xs uppercase tracking-wider text-brand">
              Veja um card de verdade
            </p>
            <FlashcardTeaser cards={teaserCards} />
          </section>
        )}

        {/* ── Why these 6 subjects (the "explain that" section) ────────────────── */}
        <section className="border-y border-border/60 bg-surface-1/30">
          <div className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-wider text-brand">Por que esses 6 assuntos?</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Escolhidos pela incidência real na prova
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Contamos quantas questões de cada assunto apareceram nas provas do Revalida de{" "}
                {WEIGHTED_DECK_STATS.examYears} ({WEIGHTED_DECK_STATS.topicsAnalyzed} temas,{" "}
                {WEIGHTED_DECK_STATS.examQuestionsAnalyzed} questões). Juntos, estes seis concentram{" "}
                {WEIGHTED_DECK_STATS.sixSubjectSharePct}% delas — e o seu baralho é proporcional a isso:
                mais cards nos assuntos que mais caem.
              </p>
            </div>

            <div className="mt-9 space-y-3">
              {WEIGHTED_DECK_PLAN.map((s, i) => (
                <div key={s.slug} className="flex items-center gap-3 sm:gap-4">
                  <div className="w-28 shrink-0 text-right text-sm font-medium text-foreground sm:w-40 sm:text-base">
                    {s.name}
                  </div>
                  <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-surface-2">
                    <div
                      className="flex h-full items-center justify-end rounded-lg bg-gradient-to-r from-brand/70 to-brand pr-2.5"
                      style={{ width: `${Math.round((s.pastExamQuestions / MAX_INCIDENCE) * 100)}%` }}
                    >
                      <span className="font-mono text-[11px] font-semibold tabular-nums text-brand-fg">
                        {s.pastExamQuestions}
                      </span>
                    </div>
                  </div>
                  <div className="w-16 shrink-0 text-left text-xs text-muted-foreground sm:w-20 sm:text-sm">
                    <span className="font-semibold text-foreground tabular-nums">{s.cards}</span> cards
                    {i === 0 && <span className="ml-1 hidden text-brand sm:inline">•</span>}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              barra = nº de questões nas provas de {WEIGHTED_DECK_STATS.examYears}
            </p>
          </div>
        </section>

        {/* ── Spaced-repetition proof ──────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
          <div className="grid items-center gap-8 sm:grid-cols-2">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-brand">Não é só um PDF</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Revisão espaçada de verdade
              </h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                Cada card que você acerta volta em intervalos cada vez maiores — e some do caminho. Errou?
                Ele volta amanhã e recomeça. É o sistema que garante que você não esquece na hora da prova.
              </p>
            </div>
            <div className="rounded-2xl border border-brand/20 bg-brand-muted/10 p-5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-brand">
                O intervalo cresce a cada acerto
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {[1, 6, 15, 38].map((d, i, arr) => (
                  <span key={d} className="flex items-center gap-1.5">
                    <span className="rounded-md bg-surface-1 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-foreground ring-1 ring-border">
                      {d} {d === 1 ? "dia" : "dias"}
                    </span>
                    {i < arr.length - 1 && <span aria-hidden className="text-muted-foreground">→</span>}
                  </span>
                ))}
                <span aria-hidden className="text-muted-foreground">→</span>
                <span className="text-xs text-muted-foreground">…e some do caminho</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Final CTA band ───────────────────────────────────────────────────── */}
        <section className="border-t border-border/60 bg-gradient-to-b from-brand-muted/10 to-transparent">
          <div className="mx-auto max-w-2xl px-5 py-14 text-center sm:py-20">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Comece pelos assuntos que mais caem — de graça.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
              Deixe seu e-mail e mandamos o link do baralho na hora. Sem cartão, sem pegadinha.
            </p>
            <div className="mx-auto mt-7 max-w-md text-left">
              <FlashcardsGate utm={utm} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-xs text-muted-foreground">
          <span>© MedHelpSpace</span>
          <span className="flex gap-4">
            <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link href="/termos" className="hover:text-foreground">Termos</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
