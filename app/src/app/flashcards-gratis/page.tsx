import type { Metadata } from "next";
import Link from "next/link";
import { getFreeDeckCards } from "@/lib/magnet/flashcards";
import { MagnetFlashcards } from "@/components/magnet/magnet-flashcards";

// PUBLIC, indexable giveaway — lives OUTSIDE the /app gate. This is the real
// "baralho de flashcards" the D0 email + magnet results promise (deckUrl), and an
// SEO landing for the "flashcards revalida" long-tail (one of the paid-ads terms).
// Fully open (no email gate): the simulado is the capture; the deck is the gift +
// the funnel-in for cold SEO visitors (CTA → /questoes-revalida). Mirrors the lean
// chrome of /questoes-revalida. Public pages are dark-only (lib/theme-scope).

export const metadata: Metadata = {
  title: "Flashcards Revalida 1ª Etapa — Baralho Grátis com Revisão Espaçada",
  description:
    "Estude com flashcards das principais especialidades da 1ª etapa do Revalida. Vire o card, avalie se lembrou e veja como a revisão espaçada fixa o conteúdo. Grátis, sem cartão.",
  alternates: { canonical: "/flashcards-gratis" },
};

export const dynamic = "force-dynamic";

export default async function FlashcardsGratisPage() {
  const cards = await getFreeDeckCards();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-sm font-bold tracking-tight">
            MedHelp<span className="text-brand">Space</span>
          </Link>
          <span className="text-xs text-muted-foreground">Flashcards · 1ª etapa</span>
        </div>
      </header>

      <main className="flex-1 px-5 py-10 sm:py-14">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            Revalida · 1ª etapa
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Baralho de flashcards da 1ª etapa. De graça.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Vire cada card, responda se você lembrou e sinta como a{" "}
            <strong className="text-foreground">revisão espaçada</strong> fixa o conteúdo —
            recordar, não reler. Uma amostra das especialidades que você revisa no método completo.
          </p>
        </div>

        {cards.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Baralho em preparação. Volte em instantes.
          </p>
        ) : (
          <MagnetFlashcards
            cards={cards}
            ctaHref="/questoes-revalida"
            ctaLabel="Fazer o Simulado Honesto e receber meu plano →"
            doneTitle="Esse é o método."
            doneNote="No simulado você descobre exatamente onde focar — e recebe um plano até a prova."
          />
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-xs text-muted-foreground">
          <span>© MedHelpSpace</span>
          <span className="flex gap-4">
            <Link href="/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link href="/termos" className="hover:text-foreground">
              Termos
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
