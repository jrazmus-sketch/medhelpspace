import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { safe } from "@/lib/sanitize";
import type React from "react";

export const metadata = {
  title: "Exemplo de estilo — CaiuNaProva | MedHelpSpace",
  description:
    "Como uma página CaiuNaProva (Revalida UP) renderiza no site — referência visual.",
};

// Public visual reference for the CaiuNaProva / Revalida UP layout. Renders the
// sample Markdown through the exact same .prose-caiunaprova styling the real
// content pages use (see plain-content-renderer.tsx + globals.css), so authors
// and ChatGPT can see the target look. No auth (proxy.ts gates only /app, /admin).
async function getDocHtml(): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    "src",
    "content",
    "exemplo-caiunaprova.md",
  );
  const md = fs.readFileSync(filePath, "utf8");
  const html = await marked.parse(md, { gfm: true, breaks: false });
  return safe(html);
}

function htmlProps(html: string): React.HTMLAttributes<HTMLElement> {
  return { dangerouslySetInnerHTML: { __html: html } };
}

export default async function ExemploCaiuNaProvaPage() {
  const html = await getDocHtml();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="prose-content prose-caiunaprova" {...htmlProps(html)} />
    </div>
  );
}
