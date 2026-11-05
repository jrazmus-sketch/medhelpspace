"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/lib/analytics/track";
import { useAuth } from "@/providers/auth-provider";

/**
 * One of the two product cards on the MedHelpSpace home page (Karina
 * 2026-11-05: "dois cartões clicáveis, como duas caixas em destaque").
 *
 * A pure "choose" page loses people at the extra click, so each card SHOWS its
 * product instead of only naming it: a real phone screenshot, live proof
 * chips, the main button, and a free door for the cold TikTok visitor who is
 * not ready to buy.
 *
 * The whole card is the main link (stretched-link pattern: the main <Link>'s
 * ::after covers the card), so the thumb can land anywhere — and the free
 * link sits above that layer (relative z-10), because an <a> inside an <a> is
 * invalid HTML.
 *
 * GA4: `select_product {product, location}` on the main link; the free link
 * fires its own event (`free.event`).
 */
export type FreeDoor = {
  label: ReactNode;
  /** Where a signed-out visitor goes. */
  href: string;
  /** Where a signed-in visitor goes, if different (e.g. skip /signup). */
  hrefLoggedIn?: string;
  event: { name: string; params?: Record<string, unknown> };
};

export function ProductCard({
  product,
  href,
  name,
  description,
  cta,
  proof,
  free,
  shot,
  stripe,
  accent,
  ariaLabel,
}: {
  product: "revalida" | "clinact";
  href: string;
  name: ReactNode;
  description: ReactNode;
  cta: ReactNode;
  /** Short facts shown as chips — computed or her own words, never invented. */
  proof: { key: string; label: ReactNode; dot?: string }[];
  free: FreeDoor;
  /** A phone screenshot of the product; the card renders fine without one. */
  shot: { src: string } | null;
  /** CSS background for the 4px identity bar on top of the card. */
  stripe: string;
  /** A CSS colour (token) for the border tint and glow. */
  accent: string;
  ariaLabel: string;
}) {
  const { user, loading } = useAuth();
  const freeHref = !loading && user && free.hrefLoggedIn ? free.hrefLoggedIn : free.href;

  return (
    <article
      className="group relative isolate flex h-full flex-col overflow-hidden rounded-3xl border transition duration-300 hover:-translate-y-1"
      style={
        {
          "--card-accent": accent,
          borderColor: "color-mix(in srgb, var(--card-accent) 35%, var(--lp-border))",
          background:
            "linear-gradient(160deg, color-mix(in srgb, var(--card-accent) 16%, var(--lp-alt)) 0%, var(--lp-alt) 60%)",
        } as React.CSSProperties
      }
    >
      {/* Identity bar — each product its own (Revalida's wordmark gradient,
          ClinAct's four format colours). */}
      <div aria-hidden className="h-1 w-full shrink-0" style={{ background: stripe }} />

      {/* Glow that brightens on hover — decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 -z-10 h-64 w-64 rounded-full opacity-35 blur-3xl transition-opacity duration-300 group-hover:opacity-60"
        style={{ background: "var(--card-accent)" }}
      />

      {/* The product, on a phone, peeking from the top-right — decorative
          (the card's text says what it is). Its window is cut to end where the
          title + description end, fading out, so it never sits under the
          proof chips. */}
      {shot ? (
        <div
          aria-hidden
          className="pointer-events-none absolute right-3 top-6 -z-10 h-[150px] w-[118px] rotate-[7deg] overflow-hidden transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-[4deg] sm:right-6 sm:top-8 sm:h-[200px] sm:w-[158px]"
          style={{
            maskImage: "linear-gradient(to bottom, #000 45%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent 100%)",
          }}
        >
          <div
            className="rounded-[22px] p-[2px]"
            style={{
              background: "var(--dv-frame)",
              boxShadow: "0 24px 50px rgba(0,0,0,0.55), 0 0 40px color-mix(in srgb, var(--card-accent) 30%, transparent)",
            }}
          >
            <div className="rounded-[20px] p-[4px]" style={{ background: "var(--dv-bezel)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static/CDN screenshot, fixed small size */}
              <img
                src={shot.src}
                alt=""
                width={390}
                height={844}
                decoding="async"
                className="block aspect-[390/844] w-full rounded-[16px] object-cover object-top"
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-5 sm:p-7">
        {/* pr leaves room for the phone so title + description never run under it;
            min-h makes the chips start below the phone however short the
            description is (lg keeps the chips in this column instead). */}
        <div className={shot ? "min-h-[132px] pr-[124px] sm:min-h-[176px] sm:pr-[176px] lg:min-h-0" : undefined}>
          <h2
            className="text-[1.45rem] font-extrabold leading-tight tracking-tight sm:text-3xl"
            style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
          >
            {name}
          </h2>
          <p className="mt-2 text-base leading-relaxed sm:mt-3 sm:text-lg" style={{ color: "var(--lp-fg-85)" }}>
            {description}
          </p>
        </div>

        {/* Proof chips — on a solid backing so they stay readable over the
            phone's faded tail. In the two-column layout (lg) the card is narrow
            enough that a short description lets them reach the phone, so there
            they keep to the text column. */}
        <ul className={`mt-5 flex flex-wrap gap-2 sm:mt-6 ${shot ? "lg:pr-[156px]" : ""}`} aria-label="Destaques">
          {proof.map((p) => (
            <li
              key={p.key}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium"
              style={{
                borderColor: "var(--lp-border)",
                background: "color-mix(in srgb, var(--lp-base) 78%, transparent)",
                color: "var(--lp-fg-85)",
              }}
            >
              {p.dot ? <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.dot }} /> : null}
              {p.label}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex flex-col gap-1 pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1">
          <Link
            href={href}
            aria-label={ariaLabel}
            onClick={() => trackEvent("select_product", { product, location: "home" })}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-base font-bold text-brand-fg transition after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 group-hover:opacity-90 sm:w-auto sm:px-8"
            style={{ outlineColor: "var(--card-accent)" }}
          >
            {cta}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <Link
            href={freeHref}
            onClick={() => trackEvent(free.event.name, { ...free.event.params, location: "home" })}
            className="relative z-10 inline-flex min-h-11 items-center justify-center gap-1 whitespace-nowrap px-1 text-[15px] font-semibold text-brand-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: "var(--card-accent)" }}
          >
            {free.label}
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
