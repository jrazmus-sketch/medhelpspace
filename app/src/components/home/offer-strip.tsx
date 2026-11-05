import Link from "next/link";
import type { OfferStrip } from "@/lib/home/offers";

/**
 * The running offers, one line above the home page (computed — see
 * lib/home/offers.ts). Each part links to the offer on its own sales page.
 * Renders nothing when no offer runs, so it leaves with Black Friday.
 */
export function OfferStripBar({ strip }: { strip: OfferStrip }) {
  return (
    <div
      className="relative z-10 border-b px-3 py-1.5 text-center text-sm sm:py-1"
      style={{
        borderColor: "color-mix(in srgb, var(--brand-text) 30%, transparent)",
        background: "color-mix(in srgb, var(--brand) 32%, var(--lp-base))",
        color: "var(--lp-fg)",
      }}
    >
      <p className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-2 gap-y-0">
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.14em]"
          style={{ background: "var(--lp-fg)", color: "var(--lp-base)", fontFamily: "var(--font-geist-mono)" }}
        >
          {strip.pill}
        </span>
        {strip.parts.map((p, i) => (
          <span key={p.product} className="inline-flex items-center gap-2">
            {/* The dot only from sm: on a phone the parts wrap onto their own
                lines, where a leading "·" would dangle. */}
            {i > 0 ? <span aria-hidden className="hidden sm:inline" style={{ color: "var(--lp-fg-55)" }}>·</span> : null}
            <Link
              href={p.href}
              className="inline-flex min-h-10 items-center font-semibold underline decoration-[color:var(--brand-text)] decoration-2 underline-offset-4 hover:opacity-90"
            >
              {p.text}
              {!strip.sharedUntil && p.until ? ` até ${p.until}` : ""}
            </Link>
          </span>
        ))}
        {strip.sharedUntil ? <span style={{ color: "var(--lp-fg-85)" }}>— até {strip.sharedUntil}</span> : null}
      </p>
    </div>
  );
}
