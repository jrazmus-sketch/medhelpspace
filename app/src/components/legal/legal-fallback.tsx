import { safe } from "@/lib/sanitize";

// The HTML is our own constant from lib/legal-pages.ts, sanitized anyway. This
// wrapper keeps the raw attribute name out of JSX (same as editable-text.tsx).
function htmlProps(html: string): React.HTMLAttributes<HTMLElement> {
  return { dangerouslySetInnerHTML: { __html: html } };
}

/**
 * /termos and /privacidade when the `editable_pages` row is missing (mock mode /
 * pre-patch): the same approved text the patch wrote, from lib/legal-pages.ts.
 */
export function LegalFallback({ title, html }: { title: string; html: string }) {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <div className="prose-content" {...htmlProps(safe(html))} />
    </>
  );
}
