/**
 * What the importer screen's download buttons deliver (Admin → ClinAct →
 * Importar). Pure, so a test can assert the exact file Karina receives.
 *
 * "Baixar modelo" serves only the fill-in template: the fenced block under
 * "## Modelo para copiar" (falling back to the first fenced block). Every file
 * name carries the document's revision date (Karina 2026-10-17: "identifique a
 * revisão em um local que permita reconhecer a versão sem interferir na
 * importação") — the .txt also starts with "REVISÃO DO MODELO: …", a line the
 * importer ignores.
 */

/** The fill-in template inside a modelo-*.md. */
export function extractTemplate(raw: string): string {
  const text = raw.replace(/\r\n?/g, "\n");
  const anchor = text.indexOf("## Modelo para copiar");
  const from = anchor >= 0 ? anchor : 0;
  const open = text.indexOf("```\n", from);
  if (open < 0) return text;
  const close = text.indexOf("```", open + 4);
  return close < 0 ? text : text.slice(open + 4, close);
}

/** "dd/mm/aaaa" of the first "Revisão …: dd/mm/aaaa" in the document, as aaaa-mm-dd. */
export function revisionOf(raw: string): string | null {
  const m = raw.match(/Revis[ãa]o[^:\n]*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** "modelo-clinica-em-cena.md" → "modelo-clinica-em-cena-rev-2026-10-17.txt" (template) / ".md" (full document). */
export function downloadName(base: string, raw: string, onlyTemplate: boolean): string {
  const stem = base.replace(/\.md$/, "");
  const rev = revisionOf(raw);
  return `${stem}${rev ? `-rev-${rev}` : ""}.${onlyTemplate ? "txt" : "md"}`;
}
