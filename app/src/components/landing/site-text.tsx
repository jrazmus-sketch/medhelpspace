"use client";

import { createContext, useContext, type ReactNode } from "react";
import { EditableText } from "@/components/admin/editable-text";

// One editable landing string as fetched from `site_content`.
export type SiteContentRow = { id: number; value: string };
export type SiteContentMap = Record<string, SiteContentRow>;

const Ctx = createContext<SiteContentMap>({});

// Seeds the map for the whole landing tree. The landing page (server component)
// fetches `site_content` once and wraps its children in this provider; every
// <SiteText> below reads from it. Children are rendered by the server and passed
// through, so this client boundary doesn't pull the sections client-side beyond
// what they already are.
export function SiteContentProvider({
  rows,
  children,
}: {
  rows: SiteContentMap;
  children: ReactNode;
}) {
  return <Ctx.Provider value={rows}>{children}</Ctx.Provider>;
}

type Props = {
  /** Stable key into `site_content` (e.g. "hero.headline"). */
  k: string;
  /** Text shown when the row isn't seeded yet — keep in sync with the SQL seed. */
  fallback: string;
  className?: string;
  /** Wrapper tag. Use "span" inside <p>/<h1>/<li> to stay valid HTML. Default span. */
  as?: "span" | "div";
  /** Render a <textarea> in edit mode for longer copy (paragraphs, FAQ answers). */
  multiline?: boolean;
  /**
   * Live values to substitute for `{token}` placeholders in the copy. The stored
   * text keeps the token (so it stays editable and self-updating); only the
   * displayed text is substituted. E.g. `vars={{ flashcards: "5.280" }}` turns
   * "{flashcards} cartões..." into "5.280 cartões..." on screen.
   */
  vars?: Record<string, string | number>;
};

// Replace `{token}` occurrences with vars[token]; unknown tokens are left as-is.
function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

// A single piece of editable landing copy. When the row exists it renders an
// inline-editable field (active only for admins in edit mode on desktop, via
// EditableText); otherwise it renders the fallback as plain, non-editable text.
export function SiteText({ k, fallback, className, as = "span", multiline, vars }: Props) {
  const map = useContext(Ctx);
  const row = map[k];

  // Raw text is the source of truth (kept editable, with tokens); the displayed
  // text has tokens substituted for their live values.
  const raw = (row?.value || fallback) ?? "";
  const display = interpolate(raw, vars);

  if (!row) {
    const Tag = as;
    return <Tag className={className}>{display}</Tag>;
  }

  return (
    <EditableText
      variant="plain"
      table="site_content"
      id={row.id}
      field="value"
      value={display}
      editValue={raw}
      as={as}
      className={className}
      multiline={multiline}
    />
  );
}
