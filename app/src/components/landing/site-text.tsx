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
};

// A single piece of editable landing copy. When the row exists it renders an
// inline-editable field (active only for admins in edit mode on desktop, via
// EditableText); otherwise it renders the fallback as plain, non-editable text.
export function SiteText({ k, fallback, className, as = "span", multiline }: Props) {
  const map = useContext(Ctx);
  const row = map[k];

  if (!row) {
    const Tag = as;
    return <Tag className={className}>{fallback}</Tag>;
  }

  return (
    <EditableText
      variant="plain"
      table="site_content"
      id={row.id}
      field="value"
      value={row.value || fallback}
      as={as}
      className={className}
      multiline={multiline}
    />
  );
}
