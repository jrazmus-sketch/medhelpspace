import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";

// Authoring guide + the four templates, served from the importer screen
// (§3.3: "Instructions that live only in an e-mail are lost by case 12").
// The files are copies of docs/clinact/*.md kept in sync by a test.
const FILES: Record<string, { file: string; download: string }> = {
  guia: { file: "formato-de-conteudo.md", download: "clinact-formato-de-conteudo.md" },
  temas: { file: "especialidades-e-temas.md", download: "clinact-especialidades-e-temas.md" },
  decisao_30s: { file: "modelo-decisao-30s.md", download: "modelo-decisao-30s.md" },
  codigo_clinico: { file: "modelo-codigo-clinico.md", download: "modelo-codigo-clinico.md" },
  ponto_de_virada: { file: "modelo-ponto-de-virada.md", download: "modelo-ponto-de-virada.md" },
  clinica_em_cena: { file: "modelo-clinica-em-cena.md", download: "modelo-clinica-em-cena.md" },
};

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { name } = await params;
  const entry = FILES[name];
  if (!entry) return new NextResponse("Not found", { status: 404 });
  const url = new URL(req.url);
  const onlyTemplate = url.searchParams.get("modelo") === "1";

  const raw = await readFile(path.join(process.cwd(), "src", "content", "clinact", entry.file), "utf8");
  let body = raw;
  if (onlyTemplate) {
    // "Baixar modelo": just the first fenced block (the fill-in template).
    const m = raw.match(/```\n([\s\S]*?)```/);
    body = m ? m[1] : raw;
  }
  const filename = onlyTemplate ? entry.download.replace(/\.md$/, ".txt") : entry.download;
  return new NextResponse(body, {
    headers: {
      "Content-Type": onlyTemplate ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": `${url.searchParams.get("ver") === "1" ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
