import Link from "next/link";
import { AnnouncementBar } from "@/components/landing/announcement-bar";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SiteText } from "@/components/landing/site-text";
import { Check, Lock, Unlock, Clock } from "lucide-react";
import { getCohortsForSale } from "@/lib/queries/cohort-products";
import { getCohortTiming, type CohortTiming } from "@/lib/cohort-timing";
import type { CohortProduct } from "@/types/supabase";

const INCLUDED = [
  "Estudo por Questões — questões oficiais + simulados comentados",
  "Resumos Narrativos — casos clínicos com raciocínio e conduta",
  "MedVoice — treinamento de decisão em áudios curtos",
  "Fórmula MedHelp — atalhos de prova, macetes e mnemônicos",
  "Audiocards — flashcards em áudio com o que já caiu",
  "Guia de estudos completo",
  "Acesso em celular, tablet e computador",
  "Tema claro e escuro",
  "Atualizações contínuas",
];

const INCLUDED_60D = [
  "Revalida Up — mini-resumos: padrão + decisão treinada",
  "MemoreCards — cards visuais de alta fixação por especialidade",
  "Simulados completos (100 questões) para treinar o dia da prova",
];

// The /loja page now sits in the same purple-dark "ECG world" as the hero
// (hero-section.tsx) instead of on flat black. Anchored at the top so the
// heading rests in a pool of brand light and the page sinks toward near-black.
const PAGE_RADIAL =
  "radial-gradient(ellipse 150% 100% at 50% -8%, #160a34 0%, #0b0620 44%, #030109 100%)";

export const metadata = {
  title: "Comprar — MedHelpSpace Revalida",
  description:
    "Escolha sua turma e comece agora. Acesso imediato, garantia de 7 dias.",
};

// Hourly ISR; admin price/sale edits also revalidatePath("/loja") for instant
// refresh (step 5).
export const revalidate = 3600;

export default async function LojaPage() {
  const cohorts = await getCohortsForSale();

  return (
    <div
      className="relative min-h-screen overflow-x-clip"
      style={{ background: PAGE_RADIAL }}
    >
      <AnnouncementBar />
      <LandingNav embedded />

      <main className="relative px-5 py-16 md:px-8 md:py-24">
        {/* Decorative atmosphere — scoped to <main> so the tilted "floor" grid
            lands behind the 60D note (above the opaque footer). All pointer-
            events-none / aria-hidden; content below paints on top of it. */}
        <LojaAtmosphere />

        <div className="relative mx-auto max-w-5xl">

          {/* Header */}
          <div className="loja-rise mb-14 text-center" style={{ animationDelay: "40ms" }}>
            <Link
              href="/"
              className="mb-6 inline-flex items-center gap-1.5 text-sm text-foreground/40 transition-colors hover:text-foreground"
            >
              ← Voltar
            </Link>
            <h1
              className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl"
              style={{ fontFamily: "var(--font-bricolage)" }}
            >
              <SiteText as="span" k="loja.title" fallback="Comece sua preparação." />
            </h1>
            <p className="mt-4 text-base text-foreground/55 sm:text-lg">
              {cohorts.length === 0 ? (
                <SiteText
                  as="span"
                  multiline
                  k="loja.subhead_closed"
                  fallback="As inscrições para a próxima turma abrem em breve."
                />
              ) : (
                <SiteText
                  as="span"
                  multiline
                  k="loja.subhead"
                  fallback="Escolha a turma da sua prova. Acesso imediato ao sistema completo."
                />
              )}
            </p>
          </div>

          {cohorts.length === 0 ? (
            /* Empty state — no turma currently for sale */
            <div
              className="loja-rise mx-auto max-w-md rounded-2xl border border-brand/20 bg-[rgba(16,9,32,0.75)] p-8 text-center shadow-lg backdrop-blur-sm"
              style={{ animationDelay: "120ms" }}
            >
              <div className="mb-3 text-3xl">🔔</div>
              <h2
                className="text-xl font-bold text-foreground"
                style={{ fontFamily: "var(--font-bricolage)" }}
              >
                <SiteText as="span" k="loja.soon.title" fallback="Inscrições abertas em breve" />
              </h2>
              <p className="mt-2 text-sm text-foreground/55">
                <SiteText
                  as="span"
                  multiline
                  k="loja.soon.body"
                  fallback="Estamos preparando a próxima turma. Volte em breve para garantir sua vaga."
                />
              </p>
            </div>
          ) : (
            <>
              {/* Cohort cards */}
              <div
                className={
                  cohorts.length === 1
                    ? "loja-rise mx-auto max-w-md"
                    : "loja-rise grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8"
                }
                style={{ animationDelay: "120ms" }}
              >
                {cohorts.map((cohort) => (
                  <CohortCard key={cohort.slug} cohort={cohort} />
                ))}
              </div>

              {/* Trust signals */}
              <div
                className="loja-rise mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8"
                style={{ animationDelay: "240ms" }}
              >
                <div className="flex items-center gap-2 text-sm text-foreground/50">
                  <Check className="h-4 w-4 text-brand" />
                  <SiteText as="span" k="loja.trust.access" fallback="Acesso imediato após confirmação" />
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground/50">
                  <Check className="h-4 w-4 text-brand" />
                  <SiteText as="span" k="loja.trust.guarantee" fallback="Garantia incondicional de 7 dias" />
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground/50">
                  <Lock className="h-4 w-4 text-brand" />
                  <SiteText as="span" k="loja.trust.secure" fallback="Pagamento 100% seguro · PagBank" />
                </div>
              </div>

              {/* 60D note */}
              <div
                className="loja-rise mt-12 rounded-2xl border border-brand/25 bg-brand/5 p-6 shadow-lg backdrop-blur-sm md:p-8"
                style={{ animationDelay: "340ms" }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xl">🔓</span>
                  <h3
                    className="text-lg font-bold text-foreground"
                    style={{ fontFamily: "var(--font-bricolage)" }}
                  >
                    <SiteText as="span" k="loja.60d.title" fallback="MedHelp 60D — já incluso em todas as turmas" />
                  </h3>
                </div>
                <p className="mb-4 text-sm text-foreground/60 sm:text-base">
                  <SiteText
                    as="span"
                    multiline
                    k="loja.60d.body"
                    fallback="A fase final do sistema é liberada automaticamente 60 dias antes da sua prova. Você não precisa fazer nada — o acesso abre na hora certa."
                  />
                </p>
                <ul className="flex flex-col gap-2">
                  {INCLUDED_60D.map((item, i) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-foreground/65">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <SiteText as="span" k={`loja.60d.item.${i}`} fallback={item} />
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

/* ── Decorative atmosphere ─────────────────────────────────────────────────
   Two purely-visual layers: a soft brand pool behind the heading, and a
   perspective-tilted grid "floor" receding into the dark at the bottom of the
   content — the same grid texture as the hero's ECG plane, so /loja reads as
   part of the same world. */
function LojaAtmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Top brand pool — sits behind "Comece sua preparação" */}
      <div
        className="absolute left-1/2 top-0 h-[440px] w-[860px] max-w-[140vw] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(122,29,145,0.26), rgba(122,29,145,0.08) 45%, transparent 70%)",
        }}
      />
      {/* Perspective "floor" grid — lifted from the hero ECG plane, tilted to
          recede toward a horizon and masked to fade upward into the dark. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[360px]"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(150,110,230,0.16) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(150,110,230,0.16) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "64px 64px, 64px 64px",
          transform: "perspective(520px) rotateX(64deg)",
          transformOrigin: "bottom center",
          maskImage: "linear-gradient(to top, black 0%, black 10%, transparent 82%)",
          WebkitMaskImage: "linear-gradient(to top, black 0%, black 10%, transparent 82%)",
        }}
      />
    </div>
  );
}

/* Corner registration ticks — small lavender L-brackets framing each card, like
   a medical chart or film frame. Decorative only. */
function CornerTicks() {
  const base = "pointer-events-none absolute h-3 w-3";
  const col = "rgba(192,132,232,0.45)";
  return (
    <>
      <span aria-hidden className={`${base} left-3 top-3 border-l border-t`} style={{ borderColor: col }} />
      <span aria-hidden className={`${base} right-3 top-3 border-r border-t`} style={{ borderColor: col }} />
      <span aria-hidden className={`${base} bottom-3 left-3 border-b border-l`} style={{ borderColor: col }} />
      <span aria-hidden className={`${base} bottom-3 right-3 border-b border-r`} style={{ borderColor: col }} />
    </>
  );
}

function CohortCard({ cohort }: { cohort: CohortProduct }) {
  // Cards differ only by the cohort's real exam timing: a closer prova means less
  // study time, which is why that turma is priced lower and shows a countdown.
  // No "popular/recomendado" badges and no fake scarcity — honest information by
  // exam date, not a sales ranking. Every decorative treatment below (glow pool,
  // gradient border, corner ticks) is IDENTICAL per card so neither turma reads
  // as promoted over the other.
  const timing = getCohortTiming(cohort);
  return (
    // h-full down the whole wrapper chain so both grid cards stay equal height
    // and their "Comprar agora" CTAs bottom-align (via flex-1 body + mt-auto).
    <div className="relative h-full">
      {/* Twin glow pool — one soft, equal halo behind each card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 rounded-[2rem]"
        style={{
          background:
            "radial-gradient(62% 55% at 50% 42%, rgba(168,96,224,0.22), rgba(122,29,145,0.10) 46%, transparent 72%)",
          filter: "blur(30px)",
        }}
      />

      {/* Gradient hairline border — a lit edge instead of a flat brand stroke */}
      <div
        className="relative h-full rounded-[20px] p-[1.5px] shadow-[0_24px_70px_-24px_rgba(0,0,0,0.75)]"
        style={{
          background:
            "linear-gradient(155deg, rgba(192,132,232,0.85) 0%, rgba(122,29,145,0.30) 42%, rgba(192,132,232,0.55) 100%)",
        }}
      >
        {/* Inner panel — frosted dark-purple so a hint of the glow/atmosphere
            shows through, keeping the card part of the scene. */}
        <div
          className="relative flex h-full flex-col rounded-[18.5px] backdrop-blur-sm"
          style={{
            background:
              "linear-gradient(180deg, rgba(24,13,46,0.92) 0%, rgba(12,7,24,0.94) 100%)",
          }}
        >
          <CornerTicks />

          <div className="px-6 py-5 border-b border-brand/20">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-brand/60">
                <SiteText as="span" k="loja.card.turma" fallback="Turma" />
              </span>
              {timing.examChip && (
                <span
                  className={
                    timing.examChip.urgent
                      ? "inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand"
                      : "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-foreground/45"
                  }
                >
                  <Clock className="h-3 w-3 shrink-0" />
                  {timing.examChip.text}
                </span>
              )}
            </div>
            <h2
              className="text-2xl font-extrabold text-foreground"
              style={{ fontFamily: "var(--font-bricolage)" }}
            >
              {cohort.name}
            </h2>
          </div>

          <div className="flex flex-1 flex-col gap-6 p-6">
            <div>
              {/* On sale: struck-through original + badge above the discounted price. */}
              {cohort.isOnSale && cohort.compareAtPriceLabel && (
                <div className="mb-1 flex items-center gap-2.5">
                  <span className="text-lg font-medium text-foreground/40 line-through">
                    {cohort.compareAtPriceLabel}
                  </span>
                  {cohort.discountPercent != null && (
                    <span className="inline-flex items-center rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                      −{cohort.discountPercent}%
                    </span>
                  )}
                </div>
              )}
              <div className="text-4xl font-extrabold tracking-tight text-foreground" style={{ fontFamily: "var(--font-bricolage)" }}>
                {cohort.priceLabel}
              </div>
              <p className="mt-1 text-sm text-foreground/45">
                <SiteText as="span" k="loja.card.installments" fallback="ou parcele em até 12x no cartão" />
              </p>
              {cohort.isOnSale && cohort.savingsLabel && (
                <p className="mt-1 text-sm font-semibold text-brand">{cohort.savingsLabel}</p>
              )}
            </div>

            <IncludedList timing={timing} />

            <Link
              href={`/checkout?cohort=${cohort.slug}`}
              aria-label={`Comprar ${cohort.name}`}
              className="mt-auto block w-full rounded-xl bg-brand py-3.5 text-center text-base font-bold text-white shadow-md shadow-brand/30 transition-all hover:bg-brand/85 hover:-translate-y-0.5 active:scale-95"
            >
              <SiteText as="span" k="loja.card.cta" fallback="Comprar agora" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function IncludedList({ timing }: { timing: CohortTiming }) {
  return (
    <ul className="flex flex-col gap-2">
      {INCLUDED.map((item, i) => (
        <li key={item} className="flex items-start gap-2 text-sm text-foreground/65">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <SiteText as="span" k={`loja.included.${i}`} fallback={item} />
        </li>
      ))}
      {/* MedHelp 60D — live unlock status for THIS cohort (computed, not editable):
          "abre em N dias" / "abre em DD/MM", flipping to "já está liberado". */}
      <li
        className={
          timing.is60dUnlocked
            ? "mt-1 flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm font-semibold text-brand"
            : "mt-1 flex items-start gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm font-medium text-brand"
        }
      >
        {timing.is60dUnlocked ? (
          <Unlock className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        {timing.unlock60dLabel}
      </li>
    </ul>
  );
}
