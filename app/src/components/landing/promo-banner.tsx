"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { SiteText } from "@/components/landing/site-text";

// "Condição especial de lançamento" (Karina, 2026-09-21) — sits ABOVE the turma
// cards on /loja and the landing pricing section, so the cards themselves stay
// identical (feedback_cohorts_never_promoted). Copy is Karina's, inline-editable via
// site_content; the turma names, the price and the last valid day are {tokens}
// filled from live data, so none of them can drift from what the checkout charges.
// Deliberately avoids "pague 1, leve 2" and "de R$ 6.994 por …" framing, and shows
// NO struck-through reference price (her calls, 2026-09-21 and 2026-09-22).
//
// Client component for one reason: /loja and / are ISR-cached for up to an hour, so
// the server-rendered banner could outlive the window. It hides itself at ends_at;
// the checkout (force-dynamic) and the DB are the real gates either way.

export type PromoBannerData = {
  cohortSlug: string;
  /** "Revalida 2027.1" */
  cohortName: string;
  /** "Revalida 2027.2" */
  rolloverToCohortName: string;
  /** Exclusive end of the window (ISO). */
  endsAt: string;
  /** "11/10/2026" */
  lastDayLabel: string;
  /** The promo turma's live price — "R$ 2.997". */
  priceLabel: string;
};

/** "Revalida 2027.1" → "2027.1" — the edition as Karina writes it in running text. */
function edition(name: string): string {
  return name.replace(/^revalida\s*/i, "").trim() || name;
}

export function PromoBanner({
  promo,
  stacked = false,
  className = "",
}: {
  promo: PromoBannerData;
  /** Never go side-by-side — for narrow columns like the landing pricing block. */
  stacked?: boolean;
  className?: string;
}) {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const ms = Date.parse(promo.endsAt) - Date.now();
    if (Number.isNaN(ms)) return;
    // setTimeout's delay is a signed 32-bit int; a window weeks away would overflow
    // and fire at once. Past that horizon the next ISR render drops the banner anyway.
    if (ms > 2_147_000_000) return;
    const t = setTimeout(() => setClosed(true), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [promo.endsAt]);

  if (closed) return null;

  return (
    <section
      aria-labelledby="promo-lancamento-title"
      className={`relative rounded-2xl p-[1.5px] shadow-[0_24px_70px_-28px_rgba(0,0,0,0.8)] ${className}`}
      style={{
        background:
          "linear-gradient(120deg, rgba(192,132,232,0.95) 0%, rgba(122,29,145,0.40) 48%, rgba(242,228,255,0.65) 100%)",
      }}
    >
      <div
        className="relative rounded-[14.5px] px-5 py-6 sm:px-8 sm:py-7"
        style={{ background: "linear-gradient(160deg, rgba(42,17,74,0.97) 0%, rgba(14,8,28,0.97) 100%)" }}
      >
        <div
          className={
            stacked
              ? "flex flex-col gap-6"
              : "flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-10"
          }
        >
          <div className="min-w-0 text-left">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-brand/25 px-3 py-1 text-xs font-bold uppercase tracking-wide sm:gap-2 sm:tracking-widest text-[#f2e4ff] ring-1 ring-inset ring-brand/50">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <SiteText as="span" k="promo.eyebrow" fallback="Condição especial de lançamento" />
            </p>

            <h2
              id="promo-lancamento-title"
              className="mt-4 text-xl font-extrabold leading-snug tracking-tight text-foreground sm:text-2xl"
              style={{ fontFamily: "var(--font-bricolage)" }}
            >
              <SiteText
                as="span"
                multiline
                k="promo.headline_v2"
                fallback="Prepare-se para o {origem} e tenha sua preparação garantida também para o {destino}."
                vars={{ origem: promo.cohortName, destino: promo.rolloverToCohortName }}
              />
            </h2>

            {/* Karina's v2 copy (2026-09-22). Each bold phrase is its own editable piece
                (SiteText is plain text); `autoSpace` handles the joins. Never name an
                exam month here — INEP has not announced the 2027 dates, and the ones in
                `cohorts.test_date` are internal references only. */}
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-foreground/80">
              <SiteText
                as="span"
                k="promo.enroll"
                fallback="Matricule-se na Turma {turma} por"
                vars={{ turma: edition(promo.cohortName) }}
              />{" "}
              <strong className="whitespace-nowrap font-bold text-foreground">{promo.priceLabel}</strong>
              <SiteText
                as="span"
                autoSpace
                k="promo.continue"
                fallback="e continue até a edição {edicao}"
                vars={{ edicao: edition(promo.rolloverToCohortName) }}
              />
              <strong className="font-bold text-foreground">
                <SiteText as="span" autoSpace k="promo.extend_b" fallback="sem uma nova matrícula" />
              </strong>
              <SiteText as="span" autoSpace k="promo.continue_end" fallback="." />
            </p>

            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-foreground/80">
              <SiteText as="span" k="promo.60d_a" fallback="O" />
              <strong className="font-bold text-foreground">
                <SiteText as="span" autoSpace k="promo.60d_b" fallback="MedHelp 60D" />
              </strong>
              <SiteText
                as="span"
                autoSpace
                k="promo.60d_c"
                fallback="é nossa revisão estratégica de reta final, liberada nos"
              />
              <strong className="font-bold text-foreground">
                <SiteText as="span" autoSpace k="promo.60d_d" fallback="60 dias finais antes da prova" />
              </strong>
              <SiteText
                as="span"
                autoSpace
                multiline
                k="promo.60d_e"
                fallback="e já incluída no valor da turma. Nesta condição especial, você terá"
              />
              <strong className="font-bold text-foreground">
                <SiteText as="span" autoSpace k="promo.60d_f" fallback="dois ciclos do MedHelp 60D" />
              </strong>
              <SiteText as="span" autoSpace k="promo.60d_g" fallback=": um para cada edição do Revalida." />
            </p>
          </div>

          <div className={stacked ? "flex flex-col gap-3" : "flex shrink-0 flex-col gap-3 md:w-64"}>
            <p className="text-sm font-bold text-[#f2e4ff]">
              <SiteText
                as="span"
                k="promo.validity"
                fallback="Válido até {data}."
                vars={{ data: promo.lastDayLabel }}
              />
            </p>
            <Link
              href={`/checkout?cohort=${promo.cohortSlug}`}
              className="flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 py-3 text-center text-base font-bold text-white shadow-md shadow-brand/30 transition-all hover:-translate-y-0.5 hover:bg-brand/85 active:scale-95"
            >
              <SiteText
                as="span"
                k="promo.cta"
                fallback="Matricular na Turma {turma}"
                vars={{ turma: edition(promo.cohortName) }}
              />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
