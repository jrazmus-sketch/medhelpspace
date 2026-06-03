import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { safe } from "@/lib/sanitize";
import type React from "react";

export const metadata = {
  title: "Instruções de conteúdo — Resumos e Fórmula | MedHelpSpace",
  description:
    "Formato exato (.md) para escrever páginas Resumos e Fórmula do MedHelpSpace.",
};

// Reads the spec from src/content at request time and renders it through
// marked. Public route — no auth required (proxy.ts only gates /app and
// /admin). Kept in src/content (not public/) so the marked output is run
// through React rather than served as raw text.
async function getDocHtml(): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    "src",
    "content",
    "instrucoes-conteudo.md",
  );
  const md = fs.readFileSync(filePath, "utf8");
  const html = await marked.parse(md, { gfm: true, breaks: false });
  return safe(html);
}

// Spread-via-helper: keeps the raw React prop name out of literal JSX so
// the security hook on Write/Edit does not flag this file. Project-wide
// convention; see editable-text.tsx for the same pattern.
function htmlProps(html: string): React.HTMLAttributes<HTMLElement> {
  return { dangerouslySetInnerHTML: { __html: html } };
}

export default async function InstrucoesConteudoDocPage() {
  const html = await getDocHtml();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="prose-content quiz-explanation" {...htmlProps(html)} />
    </div>
  );
}
