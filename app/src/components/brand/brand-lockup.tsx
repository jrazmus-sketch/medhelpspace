import { cn } from "@/lib/utils";

/**
 * MedHelpSpace | Revalida brand lockup — the canonical wordmark shown on the
 * public front page (the reference is landing-nav.tsx). Extracted here so the
 * member area and auth screens render the *same* logo instead of their old
 * ad-hoc marks (an "M" tile, plain brand-colored text, etc.).
 *
 * Colors come from theme tokens (`text-foreground`, `text-brand`, `bg-border`)
 * so the lockup adapts to light/dark automatically. The "Revalida" gradient is
 * the fixed brand-identity fill and intentionally uses literal brand hues —
 * it mirrors landing-nav and the brand PNG wordmarks in /public/brand.
 *
 * Presentational only (no hooks / no state) → safe to render inside either a
 * server component or a "use client" component.
 */
export function BrandLockup({
  size = "sm",
  showRevalida = true,
  revalidaClassName,
  className,
}: {
  /** `sm` = compact chrome bars (member/auth headers, ~52px). `md` = responsive, scales up on desktop like the landing nav. */
  size?: "sm" | "md";
  /** Drop the divider + "Revalida" tag entirely. */
  showRevalida?: boolean;
  /**
   * Responsive control over just the divider + "Revalida" group — e.g. the
   * member header passes `hidden min-[480px]:flex` because the full lockup
   * won't fit beside the progress pill + icon cluster on a phone; only
   * "MedHelpSpace" shows there, and the tag returns on tablet/desktop.
   */
  revalidaClassName?: string;
  className?: string;
}) {
  const wordClass = size === "md" ? "text-sm sm:text-lg" : "text-[15px]";
  const revClass = size === "md" ? "text-sm sm:text-xl" : "text-[15px]";
  const dividerClass = size === "md" ? "h-3.5 sm:h-5" : "h-4";

  return (
    <span className={cn("flex items-center gap-1.5 sm:gap-2", className)}>
      <span
        className={cn("font-extrabold tracking-tight text-foreground", wordClass)}
        style={{ fontFamily: "var(--font-bricolage)" }}
      >
        MedHelp<span className="text-brand">Space</span>
      </span>

      {showRevalida && (
        <span className={cn("flex items-center gap-1.5 sm:gap-2", revalidaClassName)}>
          <span
            aria-hidden="true"
            className={cn("w-px shrink-0 bg-border", dividerClass)}
          />
          <span
            className={cn("font-extrabold leading-none tracking-tight", revClass)}
            style={{
              fontFamily: "var(--font-bricolage)",
              backgroundImage: "linear-gradient(120deg, #a855f7 0%, #e879f9 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
          >
            Revalida
          </span>
        </span>
      )}
    </span>
  );
}
