/**
 * "Por trás da MedHelpSpace ClinAct" (Karina, 2026-11-01): her founder note on
 * the ClinAct sales page, after "Entenda suas decisões." and before the free
 * cases, in the style of the Revalida founder section, her text verbatim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CLINACT_COPY } from "@/lib/clinact/site-copy";
import { orderSections } from "@/lib/site-sections-order";

const SRC = path.resolve(import.meta.dirname, "..", "src");
const SECTIONS = readFileSync(path.join(SRC, "components/clinact/sales/sections.tsx"), "utf8");
const fn = SECTIONS.slice(SECTIONS.indexOf("function Fundadora()"), SECTIONS.indexOf("// ── 5. Quatro casos gratuitos"));
const c = CLINACT_COPY;

test("it sits between Entenda suas decisões and the free cases — also on prod, where it has no row yet", () => {
  const keys = ["hero", "video", "competencias", "casos", "evolucao", "fundadora", "gratuitos", "planos"];
  const stored = { hero: 1, video: 2, competencias: 3, casos: 4, evolucao: 5, gratuitos: 6, planos: 7 };
  const order = orderSections(keys.map((key) => ({ key })), { position: stored, visible: {} }).map((s) => s.key);
  assert.deepEqual(order.slice(order.indexOf("evolucao"), order.indexOf("evolucao") + 3), ["evolucao", "fundadora", "gratuitos"]);
});

test("her text, verbatim, reassembled from the pieces split around her bold passages", () => {
  const paragraphs = [
    `${c["clinact.fundadora.lead"]} ${c["clinact.fundadora.lead_b"]}`,
    c["clinact.fundadora.p1"],
    `${c["clinact.fundadora.p2_b"]} ${c["clinact.fundadora.p2"]}`,
    c["clinact.fundadora.p3_b"],
    c["clinact.fundadora.p4"],
    `${c["clinact.fundadora.p5"]} ${c["clinact.fundadora.p5_b"]}${c["clinact.fundadora.p5_fim"]}`,
    c["clinact.fundadora.p6"],
    c["clinact.fundadora.p7_b"],
  ];
  assert.equal(`${c["clinact.fundadora.title"]} ${c["clinact.fundadora.title_hl"]}`, "Por trás da MedHelpSpace ClinAct");
  assert.equal(paragraphs[0], "Sou Karina, médica formada na Argentina e criadora do ClinAct.");
  assert.equal(paragraphs[5], "Esse cuidado começa na elaboração do conteúdo. Cada caso passa por auditoria, e as imagens são selecionadas de acordo com a situação clínica e com o que precisa ser observado e interpretado para decidir.");
  assert.ok(paragraphs[7].endsWith("Durante a faculdade e depois dela."));
  assert.equal(c["clinact.fundadora.assinatura"], "Karina Razmus");
  assert.equal(c["clinact.fundadora.cargo"], "Fundadora da MedHelpSpace");
});

test("the bold passages are exactly hers, the title highlight is lilac, every piece is rendered", () => {
  for (const k of ["p2_b", "p3_b", "p5_b", "p7_b"]) assert.match(fn, new RegExp(`<Strong k="clinact\\.fundadora\\.${k}" />`));
  assert.match(fn, /<strong[^>]*>\s*<ClinactText k="clinact\.fundadora\.lead_b"/);
  assert.match(fn, /<span className="inline-block text-brand-text">\s*<ClinactText k="clinact\.fundadora\.title_hl"/);
  for (const k of Object.keys(c).filter((k) => k.startsWith("clinact.fundadora."))) assert.ok(fn.includes(`"${k}"`), k);
  // Pieces that follow a bold passage get the space SiteText adds — never glued words.
  assert.match(fn, /k="clinact\.fundadora\.p2" multiline autoSpace/);
});
