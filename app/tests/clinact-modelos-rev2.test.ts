import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCaseFile } from "@/lib/clinact/parse";
import { downloadName, extractTemplate, revisionOf } from "@/lib/clinact/template-download";

// Karina 2026-10-17 ("ClinAct — ajustes nos modelos"): the downloaded templates
// must say which revision they are without breaking the import, and the
// Clínica em Cena template must carry the optional INVESTIGAÇÃO block.

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const BUNDLED = path.join(ROOT, "app", "src", "content", "clinact");
const bundled = (f: string) => readFileSync(path.join(BUNDLED, f), "utf8");
const MODELS = ["modelo-clinica-em-cena.md", "modelo-codigo-clinico.md", "modelo-decisao-30s.md", "modelo-ponto-de-virada.md"];
const GUIDE_REV = revisionOf(bundled("formato-de-conteudo.md"))!; // aaaa-mm-dd
const GUIDE_REV_BR = GUIDE_REV.split("-").reverse().join("/");

test("every downloaded template starts with the revision line and its file name carries the date", () => {
  assert.match(GUIDE_REV, /^\d{4}-\d{2}-\d{2}$/);
  for (const f of MODELS) {
    const raw = bundled(f);
    const tpl = extractTemplate(raw);
    assert.ok(tpl.startsWith(`REVISÃO DO MODELO: ${GUIDE_REV_BR} · Versão 1 do formato\n=== CASO ===\n`), `${f}: ${tpl.slice(0, 80)}`);
    assert.equal(downloadName(f, raw, true), f.replace(/\.md$/, `-rev-${GUIDE_REV}.txt`));
    assert.equal(downloadName(f, raw, false), f.replace(/\.md$/, `-rev-${GUIDE_REV}.md`));
  }
  assert.equal(downloadName("clinact-formato-de-conteudo.md", bundled("formato-de-conteudo.md"), false), `clinact-formato-de-conteudo-rev-${GUIDE_REV}.md`);
  const route = readFileSync(path.join(ROOT, "app", "src", "app", "admin", "clinact", "modelos", "[name]", "route.ts"), "utf8");
  assert.ok(route.includes("extractTemplate(raw)") && route.includes("downloadName(entry.download, raw, onlyTemplate)"));
});

test("the importer ignores the revision line, wherever it is, and keeps line numbers", () => {
  const body = `FORMATO: decisao_30s\nTÍTULO: Teste\nESPECIALIDADE: Pneumologia\nDIFICULDADE: intermediária\nDURAÇÃO: 2\nRESUMO: R\n## NARRATIVA\nN\n## PERGUNTA\nP\n* A\n  feedback: f\n- B\n  feedback: g\n`;
  for (const text of [
    `REVISÃO DO MODELO: 17/10/2026 · Versão 1 do formato\n=== CASO ===\n${body}`, // before the delimiter
    `REVISÃO DO MODELO: 17/10/2026 · Versão 1 do formato\n${body}`, // no delimiter at all
    `revisao do modelo: 17/10/2026\n=== CASO ===\n${body}`, // no accent, lower case
  ]) {
    const r = parseCaseFile(text);
    assert.equal(r.cases.length, 1, text.slice(0, 40));
    assert.deepEqual(r.cases[0].errors, []);
  }
  // A real error further down still reports the line of the file she sees.
  const broken = `REVISÃO DO MODELO: 17/10/2026\n=== CASO ===\n${body.replace("DURAÇÃO: 2", "DURACAO: 2")}`;
  const err = parseCaseFile(broken).cases[0].errors[0];
  assert.equal(err.line, 7, JSON.stringify(err)); // line 7 of the file is the DURACAO line
});

test("the Clínica em Cena template carries the optional INVESTIGAÇÃO block, after the common scene", () => {
  const tpl = extractTemplate(bundled("modelo-clinica-em-cena.md"));
  const scene = tpl.indexOf("## CENA: investigacao");
  const block = tpl.indexOf("## INVESTIGAÇÃO\n");
  const next = tpl.indexOf("## CENA: conduta-final");
  assert.ok(scene > 0 && block > scene && next > block, "order: CENA investigacao → INVESTIGAÇÃO → CENA conduta-final");
  assert.match(tpl.slice(block, next), /\[pergunta da investigação — bloco opcional: apague o bloco inteiro/);
  assert.equal((tpl.slice(block, next).match(/^- \[exame ou ação\]$/gm) ?? []).length, 3);
});

/** Fill every placeholder of the Clínica em Cena template the way an author would. */
function fillCec(tpl: string): string {
  let n = 0;
  return tpl
    .replace("TÍTULO:", "TÍTULO: Teste do modelo")
    .replace("ESPECIALIDADE:", "ESPECIALIDADE: Pneumologia")
    .replace("TEMA:", "TEMA: Pneumonia")
    .replace("CENÁRIO:", "CENÁRIO: Emergência")
    .replace("RESUMO:", "RESUMO: R")
    .replace(/## NARRATIVA\n\n/, "## NARRATIVA\nNarrativa.\n")
    .replace(/(## CENA: [a-z-]+)\n\n/g, "$1\nTexto da cena.\n")
    .replace(/\[conduta\]/g, () => `Conduta ${++n}`)
    .replace(/\[exame ou ação\]/g, () => `Exame ${++n}`)
    .replace(/qualidade:\n/g, "qualidade: ideal\n")
    .replace(/(feedback|fizemos|encontramos|estado):\n/g, "$1: texto\n")
    .replace(/relógio:\n/g, "relógio: 4\n")
    .replace(/## FEEDBACK\n\n/, "## FEEDBACK\nF.\n")
    .replace(/## LEVE DESTE CASO\n\n/, "## LEVE DESTE CASO\nL.\n");
}

test("left unfilled, the INVESTIGAÇÃO block is a loud error that says how to remove it", () => {
  const tpl = extractTemplate(bundled("modelo-clinica-em-cena.md"));
  const filledButQuestion = fillCec(tpl);
  const c = parseCaseFile(filledButQuestion).cases[0];
  assert.ok(
    c.errors.some((e) => /INVESTIGAÇÃO.*texto de exemplo do modelo.*apague o bloco inteiro/i.test(e.message) || /texto de exemplo do modelo — escreva a pergunta do caso, ou apague o bloco inteiro/.test(e.message)),
    JSON.stringify(c.errors),
  );
});

test("with the question written it imports as an investigation; deleted, the case imports without it", () => {
  const tpl = extractTemplate(bundled("modelo-clinica-em-cena.md"));
  const filled = fillCec(tpl).replace(/\[pergunta da investigação[^\]]*\]/, "Quais exames você deseja solicitar?");
  const ok = parseCaseFile(filled).cases[0];
  assert.deepEqual(ok.errors, []);
  const inv = ok.doc!.steps.find((s) => s.kind === "investigacao")!;
  assert.equal(inv.options.length, 3);
  assert.equal(ok.doc!.scenario, "emergencia");

  const block = filled.indexOf("## INVESTIGAÇÃO\n");
  const without = filled.slice(0, block) + filled.slice(filled.indexOf("## CENA: conduta-final"));
  const gone = parseCaseFile(without).cases[0];
  assert.deepEqual(gone.errors, []);
  assert.ok(!gone.doc!.steps.some((s) => s.kind === "investigacao"));
});

test("a PERGUNTA left with a template placeholder is an error too", () => {
  const c = parseCaseFile(`FORMATO: decisao_30s\nTÍTULO: T\nESPECIALIDADE: Pneumologia\n## NARRATIVA\nN\n## PERGUNTA\n[pergunta]\n* A\n  feedback: f\n- B\n  feedback: g\n`).cases[0];
  assert.ok(c.errors.some((e) => /PERGUNTA.*texto de exemplo do modelo/i.test(e.message) || /texto de exemplo do modelo \("\[pergunta\]"\)/.test(e.message)), JSON.stringify(c.errors));
});

test("the worked Clínica em Cena example carries a scenario and still imports cleanly", () => {
  const ex = readFileSync(path.join(ROOT, "docs", "clinact", "exemplos", "cec-inv-teste-01.txt"), "utf8");
  assert.match(ex, /^TEMA: Pneumonia\r?\nCENÁRIO: Emergência\r?$/m);
  const c = parseCaseFile(ex).cases[0];
  assert.deepEqual(c.errors, []);
  assert.equal(c.doc!.scenario, "emergencia");
});
