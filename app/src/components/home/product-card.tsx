"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/lib/analytics/track";

/**
 * One of the two product cards on the MedHelpSpace home page (Karina
 * 2026-11-05: "dois cartões clicáveis, como duas caixas em destaque"). The
 * WHOLE card is the link — on a phone the thumb lands anywhere on it — and the
 * "Conhecer" pill inside is its visual affordance, not a second link.
 *
 * GA4 `select_product` (param `product`) records which card was chosen, so the
 * TikTok/Instagram bio traffic can be split by product.
 */
export function ProductCard({
  product,
  href,
  icon,
  name,
  description,
  cta,
  accent,
  ariaLabel,
}: {
  product: "revalida" | "clinact";
  href: string;
  icon: ReactNode;
  name: ReactNode;
  description: ReactNode;
  cta: ReactNode;
  /** A CSS colour (token) for the icon tile, ring and glow. */
  accent: string;
  ariaLabel: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      onClick={() => trackEvent("select_product", { product, location: "home" })}
      className="group relative isolate flex h-full flex-col overflow-hidden rounded-3xl border p-5 text-left transition duration-300 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 sm:p-8"
      style={
        {
          "--card-accent": accent,
          borderColor: "color-mix(in srgb, var(--card-accent) 35%, var(--lp-border))",
          background:
            "linear-gradient(160deg, color-mix(in srgb, var(--card-accent) 14%, var(--lp-alt)) 0%, var(--lp-alt) 55%)",
          outlineColor: "var(--card-accent)",
        } as React.CSSProperties
      }
    >
      {/* Glow that brightens on hover — decorative, behind the copy. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 -z-10 h-56 w-56 rounded-full opacity-40 blur-3xl transition-opacity duration-300 group-hover:opacity-70"
        style={{ background: "var(--card-accent)" }}
      />

      {/* Icon from sm up only: on a phone both cards must fit on the first
          screen (Karina: "os dois produtos bem visíveis"), and it costs ~70px each. */}
      <span
        aria-hidden
        className="mb-6 hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border sm:flex"
        style={{
          borderColor: "color-mix(in srgb, var(--card-accent) 45%, transparent)",
          background: "color-mix(in srgb, var(--card-accent) 22%, transparent)",
          color: "var(--lp-fg)",
        }}
      >
        {icon}
      </span>

      <h2
        className="text-[1.45rem] font-extrabold leading-tight tracking-tight sm:text-3xl"
        style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
      >
        {name}
      </h2>

      <p className="mb-5 mt-2 text-base leading-relaxed sm:mb-8 sm:mt-3 sm:text-lg" style={{ color: "var(--lp-fg-85)" }}>
        {description}
      </p>

      {/* mt-auto pins the button to the bottom so the two cards line up side by side. */}
      <span className="mt-auto inline-flex min-h-12 w-full items-center justify-center gap-2 self-start rounded-xl bg-brand px-6 py-3 text-base font-bold text-brand-fg transition group-hover:opacity-90 sm:w-auto sm:px-8">
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
