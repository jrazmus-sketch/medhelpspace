import * as React from "react";

/**
 * Renders the tiny **bold** / *italic* syntax used in onboarding tip copy as
 * real React elements — NOT via raw HTML. This keeps the security hook happy
 * and means there is never an injection surface, even though the strings are
 * authored by us. Safe to use from both server and client components.
 *
 * `tone="inherit"` makes <strong> inherit the current color (used on the
 * brand-colored welcome card, where `text-foreground` would clash); the default
 * bumps bold text to the brighter foreground token for contrast on muted copy.
 */
export function Emphasis({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "inherit";
}) {
  return <>{parse(text, tone)}</>;
}

function parse(text: string, tone: "default" | "inherit"): React.ReactNode[] {
  const strongClass = tone === "inherit" ? "font-semibold" : "font-semibold text-foreground";
  const nodes: React.ReactNode[] = [];
  // Split on **bold** and *italic*, keeping the delimiters as capture groups.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  parts.forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      nodes.push(
        <strong key={i} className={strongClass}>
          {part.slice(2, -2)}
        </strong>,
      );
    } else if (part.startsWith("*") && part.endsWith("*")) {
      nodes.push(
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>,
      );
    } else if (part) {
      nodes.push(part);
    }
  });
  return nodes;
}
