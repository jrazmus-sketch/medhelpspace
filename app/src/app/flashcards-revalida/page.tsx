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
    "Baixe grátis 50 flashcards da 1ª etapa do Revalida, dos 6 assuntos de maior incidência das provas de 2020 a 2025. Com revisão espaçada e correção na hora. Sem cartão.",
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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <FunnelBeacon utm={utm} />
      {/* Ambient brand glow + faint grid texture (atmosphere, not noise). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 40% at 78% 6%, rgba(192,132,232,0.16), transparent 60%), radial-gradient(50% 40% at 8% 30%, rgba(122,29,145,0.12), transparent 55%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "44px 44px",
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
        {/* ── Hero: copy + gate ────────────────────────────────────────────────── */}
        <section className="mx-auto grid max-w-6xl items-start gap-10 px-5 py-12 sm:py-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
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
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-border bg-surface-1/60 p-4">
              <div className="shrink-0 text-center">
                <div className="font-display text-3xl font-extrabold tabular-nums text-brand sm:text-4xl">
                  {WEIGHTED_DECK_STATS.sixSubjectSharePct}%
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  da prova
                </div>
              </div>
              <p className="text-sm leading-snug text-muted-foreground">
                Analisamos <strong className="text-foreground">{WEIGHTED_DECK_STATS.examQuestionsAnalyzed} questões</strong>{" "}
                das provas de {WEIGHTED_DECK_STATS.examYears}.{" "}
                <strong className="text-foreground">{WEIGHTED_DECK_STATS.sixSubjectQuestions}</strong> delas estão em
                6 assuntos. Seus 50 flashcards vêm exatamente deles.
              </p>
            </div>

            {/* Desktop teaser sits under the stat; on mobile it moves below the gate. */}
            <div className="mt-8 hidden lg:block">
              <FlashcardTeaser cards={teaserCards} />
            </div>
          </div>

          {/* The gate — the focal point. Sticky on desktop so it stays in view. */}
          <div className="lg:sticky lg:top-8">
            <FlashcardsGate utm={utm} />
            {/* Mobile teaser: right under the gate to reinforce before scrolling. */}
            <div className="mt-8 lg:hidden">
              <FlashcardTeaser cards={teaserCards} />
            </div>
          </div>
        </section>

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
                {WEIGHTED_DECK_STATS.examQuestionsAnalyzed} questões). Estes seis lideram — e o seu baralho é
                proporcional a isso: mais cards nos assuntos que mais caem.
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
