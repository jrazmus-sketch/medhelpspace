"use client";

import Link from "next/link";
import { ArrowRight, Compass, X } from "lucide-react";
import { TIPS } from "@/lib/onboarding/tips";
import { useOnboarding } from "@/providers/onboarding-provider";
import { TipText } from "./tip-text";

/**
 * First-run welcome banner on the dashboard. Non-blocking (it sits in the flow,
 * not a modal) and dismissable — once closed it never returns, but the same
 * content lives forever at /app/comecar. Uses the "welcome" tip so its copy is
 * the single source shared with the guide.
 */
export function WelcomeCard() {
  const { ready, isDismissed, dismiss } = useOnboarding();
  const tip = TIPS.welcome;

  if (!ready || isDismissed("welcome")) return null;

  return (
    <section
      className="relative mb-[10px] overflow-hidden rounded-[var(--radius)] p-5 pr-12 sm:mb-[14px] sm:p-6 sm:pr-14"
      style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
    >
      {/* Decorative grid overlay (matches the "Plano de hoje" card) */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity: 0.08 }}
      >
        <defs>
          <pattern id="welcome-grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M 16 0 L 0 0 0 16" fill="none" stroke="white" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#welcome-grid)" />
      </svg>

      <div className="relative">
        <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] opacity-75">
          <Compass className="h-3.5 w-3.5" strokeWidth={2} />
          Comece por aqui
        </div>

        <h2 className="text-[20px] font-bold leading-tight tracking-[-0.02em] sm:text-[24px]">
          <TipText k="onboarding.welcome.title" fallback={tip.title} tone="inherit" editable={false} />
        </h2>

        <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed opacity-90">
          <TipText k="onboarding.welcome.body" fallback={tip.body} tone="inherit" editable={false} />
        </p>

        {tip.reviewNote && (
          <p className="mt-3 max-w-[52ch] rounded-lg bg-white/12 px-3 py-2 text-[12.5px] leading-relaxed">
            <TipText k="onboarding.welcome.review" fallback={tip.reviewNote} tone="inherit" editable={false} />
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href="/app/comecar"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--radius-sm)] bg-white/15 px-4 py-2.5 text-[13px] font-semibold ring-1 ring-white/25 transition-colors hover:bg-white/25"
            style={{ color: "#fff" }}
          >
            {tip.hrefLabel ?? "Ver o guia completo"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => dismiss("welcome")}
            className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] px-3 py-2.5 text-[13px] font-medium opacity-80 outline-none transition-opacity hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-white/40"
          >
            Entendi
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => dismiss("welcome")}
        aria-label="Fechar"
        className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-md outline-none transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-white/15 focus-visible:ring-[3px] focus-visible:ring-white/40"
        style={{ color: "#fff" }}
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}
