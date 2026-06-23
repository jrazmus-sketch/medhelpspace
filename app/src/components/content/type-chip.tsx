import Link from "next/link";
import type { PageView } from "@/types/supabase";
import {
  getStudyTypeKey,
  STUDY_TYPE_CONFIG,
  STUDY_TYPE_CHIP_LABEL,
  STUDY_TYPE_HELP,
  type StudyTypeKey,
} from "@/lib/page-type";
import { HelpTip } from "@/components/ui/help-tip";

type Size = "sm" | "md";

type Props = {
  // Either pass a page (preferred — type is resolved consistently with crumbs)
  page?: {
    view: PageView | null;
    track_id: number | null;
    content_module_id: number | null;
  };
  // …or pass a typeKey directly (e.g. for hub cards that already know the type)
  typeKey?: StudyTypeKey;
  size?: Size;
  className?: string;
  // When true, the chip links to its type's top-level hub. Default: false on
  // [slug] content pages (the breadcrumb already provides that link).
  asLink?: boolean;
  // When true, append a "?" HelpTip explaining what this content type is.
  // Opt-in (off by default) so it appears only where users first meet the
  // branded name — e.g. hub-page headers — not on every leaf-page chip.
  withHelp?: boolean;
};

// Inline pill: small tinted background + colored dot + colored label.
// Reads the type's signature color via CSS var so it stays in sync with
// the rest of the design system (dashboard cards, specialty hub tiles).
export function TypeChip({ page, typeKey, size = "sm", className, asLink = false, withHelp = false }: Props) {
  const key = typeKey ?? (page ? getStudyTypeKey(page) : null);
  if (!key) return null;

  const cfg = STUDY_TYPE_CONFIG[key];
  const label = STUDY_TYPE_CHIP_LABEL[key];

  const sizes = size === "md"
    ? { pad: "px-3 py-1", text: "text-[13px]", dot: 7, gap: "gap-2" }
    : { pad: "px-2.5 py-1", text: "text-[12px]", dot: 6, gap: "gap-1.5" };

  const style: React.CSSProperties = {
    background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
    color: cfg.color,
    borderColor: `color-mix(in srgb, ${cfg.color} 28%, transparent)`,
  };

  const body = (
    <span
      className={[
        "inline-flex items-center rounded-full border font-semibold leading-none whitespace-nowrap",
        sizes.pad, sizes.text, sizes.gap,
      ].join(" ")}
      style={style}
    >
      <span
        aria-hidden
        className="rounded-full"
        style={{ width: sizes.dot, height: sizes.dot, background: cfg.color }}
      />
      {label}
    </span>
  );

  if (withHelp) {
    const chip =
      asLink && cfg.hubHref ? (
        <Link href={cfg.hubHref} className="inline-flex hover:opacity-90 transition-opacity">
          {body}
        </Link>
      ) : (
        body
      );
    return (
      <span className={["inline-flex items-center gap-1", className].filter(Boolean).join(" ")}>
        {chip}
        <HelpTip label={`O que é ${cfg.label}?`} side="bottom">
          {STUDY_TYPE_HELP[key]}
        </HelpTip>
      </span>
    );
  }

  if (asLink && cfg.hubHref) {
    return (
      <Link href={cfg.hubHref} className={["inline-block hover:opacity-90 transition-opacity", className].filter(Boolean).join(" ")}>
        {body}
      </Link>
    );
  }

  return className ? <span className={className}>{body}</span> : body;
}
