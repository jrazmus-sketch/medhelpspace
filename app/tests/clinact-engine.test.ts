import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCaseFile, resolveTaxonomy, FORMAT_VERSION } from "@/lib/clinact/parse";
import { serializeCase } from "@/lib/clinact/serialize";
import { validateForPublish, publishBlockers } from "@/lib/clinact/validate";
import { caseScore, aggregateCases, optionWeight, orderWeight } from "@/lib/clinact/scoring";
import { buildScreens, applyDecision, emptyState, earnedWeights, advance, isFinished } from "@/lib/clinact/engine";
import { mediaKey, mediaUrlFor } from "@/lib/clinact/media";
import { slugifyTitle } from "@/lib/clinact/slug";
import type { CaseDoc } from "@/lib/clinact/types";

// The guide is the contract. These tests parse the worked example straight
// out of docs/clinact/modelo-decisao-30s.md so the parser and the document
// Karina writes against can never drift apart silently.

const DOCS = path.resolve(import.meta.dirname, "..", "..", "docs", "clinact");

function exampleFromModel(file: string): string {
  const md = readFileSync(path.join(DOCS, file), "utf8");
  const blocks = [...md.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);
  // The last fenced block is the "Exemplo preenchido".
  return blocks[blocks.length - 1];
}

test("guide format version is 1", () => {
  assert.equal(FORMAT_VERSION, 1);
});

test("parses the Decisão em 30 Segundos worked example with no errors", () => {
  const text = exampleFromModel("modelo-decisao-30s.md");
  const { cases } = parseCaseFile(text);
  assert.equal(cases.length, 1);
  const c = cases[0];
  assert.deepEqual(c.errors, []);
  assert.equal(c.title, "TEP — paciente instável");
  assert.equal(c.format, "decisao_30s");
  assert.equal(c.slug, "tep-paciente-instavel");
  assert.ok(c.doc);
  const doc = c.doc!;
  assert.equal(doc.difficulty, "intermediaria");
  assert.equal(doc.est_minutes, 2);
  assert.equal(doc.primary_skill, "priorizar");
  assert.deepEqual(
    doc.steps.map((s) => s.kind),
    ["narrativa", "pergunta", "confianca", "feedback", "custo_do_atraso", "leve_deste_caso"],
  );
  const q = doc.steps[1];
  assert.equal(q.content.prompt, "Qual a conduta imediata?");
  assert.equal(q.options.length, 3);
  assert.equal(q.options[0].is_correct, true);
  assert.equal(q.options[1].is_correct, false);
  // Multi-line feedback is joined.
  assert.match(q.options[0].feedback!, /responde a pergunta sem tirar o paciente do lugar\.$/);
  assert.match(q.options[1].seduction!, /^É o exame que confirma/);
  assert.equal((doc.steps[4].content as { window?: string }).window, "10 minutos");
  assert.equal(doc.takeaway, "Paciente instável não sai da sala para confirmar diagnóstico.");
  // Narrative keeps its two lines as one paragraph.
  assert.equal(doc.steps[0].content.text, "Homem, 62 anos, dispneia súbita há 40 minutos.\nPA 88/54, FC 128, SpO₂ 86% em ar ambiente.");
});

test("the empty template parses with errors, never crashes", () => {
  const md = readFileSync(path.join(DOCS, "modelo-decisao-30s.md"), "utf8");
  const template = [...md.matchAll(/```\n([\s\S]*?)```/g)][0][1];
  const { cases } = parseCaseFile(template);
  assert.equal(cases.length, 1);
  assert.ok(cases[0].errors.length > 0);
  assert.ok(cases[0].errors.some((e) => /TÍTULO/.test(e.message)));
});

test("mis-cased or unaccented ficha labels are errors that name the line", () => {
  const { cases } = parseCaseFile(`FORMATO: decisao_30s
TITULO: Caso X
Especialidade: Pneumologia

## NARRATIVA
Texto.

## PERGUNTA
Qual?
* A
- B
`);
  const c = cases[0];
  const msgs = c.errors.map((e) => `${e.line}:${e.message}`);
  assert.ok(msgs.some((m) => m.startsWith("2:") && /TÍTULO/.test(m)), msgs.join("\n"));
  assert.ok(msgs.some((m) => m.startsWith("3:") && /ESPECIALIDADE/.test(m)), msgs.join("\n"));
});

test("exactly one correct alternative, 2–5 options", () => {
  const base = (opts: string) => `=== CASO ===
FORMATO: decisao_30s
TÍTULO: T
## NARRATIVA
N
## PERGUNTA
P
${opts}`;
  assert.ok(parseCaseFile(base("- A\n- B")).cases[0].errors.some((e) => /sem alternativa correta/.test(e.message)));
  assert.ok(parseCaseFile(base("* A\n* B")).cases[0].errors.some((e) => /só uma pode ser/.test(e.message)));
  assert.ok(parseCaseFile(base("* A")).cases[0].errors.some((e) => /2 a 5/.test(e.message)));
  assert.ok(parseCaseFile(base("* A\n- B\n- C\n- D\n- E\n- F")).cases[0].errors.some((e) => /máximo é 5/.test(e.message)));
  assert.deepEqual(parseCaseFile(base("* A\n- B")).cases[0].errors, []);
});

test("bullet variants and curly quotes are normalised; NBSP does not break labels", () => {
  const text = `FORMATO: decisao_30s\nTÍTULO: “Aspas” curvas\n## NARRATIVA\nN\n## PERGUNTA\nP\n* Certa\n• Errada um\n– Errada dois\n`;
  const c = parseCaseFile(text).cases[0];
  assert.deepEqual(c.errors, []);
  assert.equal(c.title, '"Aspas" curvas');
  assert.equal(c.doc!.steps[1].options.length, 3);
});

test("media tags attach upward: block, clue, or option (as a revealed finding)", () => {
  const text = `FORMATO: codigo_clinico
TÍTULO: Mídia
CHAVE FINAL: X
## NARRATIVA
Abertura.
[imagem: rx-torax.jpg]
legenda: RX na admissão.
alt: Opacidade em base direita.
## PISTAS
- Pista com imagem
  grupo: A
  [imagem: Lesão Dermato.PNG]
- Pista distratora
  distrator: não explica a hipoxemia
## PERGUNTA
Qual?
* Auscultar
  feedback: Boa.
  encontramos: Sopro sistólico
  [audio: sopro-aortico.mp3]
  transcricao: Sopro sistólico ejetivo.
- Não auscultar
`;
  const c = parseCaseFile(text).cases[0];
  assert.deepEqual(c.errors, []);
  const doc = c.doc!;
  const nar = doc.steps[0].content as { media: { url: string; caption: string; alt: string }[] };
  assert.equal(nar.media[0].caption, "RX na admissão.");
  assert.equal(nar.media[0].alt, "Opacidade em base direita.");
  assert.equal(doc.clues[0].media!.url, mediaUrlFor("Lesão Dermato.PNG"));
  assert.equal(doc.clues[0].media!.url, "https://medhelpspace.b-cdn.net/clinact/media/lesao-dermato.png");
  assert.equal(doc.clues[0].cluster, "A");
  assert.equal(doc.clues[1].is_red_herring, true);
  assert.equal(doc.clues[1].red_herring_reason, "não explica a hipoxemia");
  const opt = doc.steps[2].options[0];
  assert.equal(opt.effect.revela![0].cat, "encontramos");
  assert.equal(opt.effect.revela![0].texto, "Sopro sistólico");
  assert.equal(opt.effect.revela![0].midia!.type, "audio");
  assert.equal(opt.effect.revela![0].midia!.transcript, "Sopro sistólico ejetivo.");
});

test("'Estado: …' inside narrative prose is prose, not a drawer", () => {
  const text = `FORMATO: decisao_30s\nTÍTULO: P\n## NARRATIVA\nEstado: grave.\nSegue.\n## PERGUNTA\nP\n* A\n- B\n`;
  const c = parseCaseFile(text).cases[0];
  assert.deepEqual(c.errors, []);
  assert.equal(c.doc!.steps[0].content.text, "Estado: grave.\nSegue.");
});

test("multi-case file: one broken case does not take the others down", () => {
  const good = `=== CASO ===\nFORMATO: decisao_30s\nTÍTULO: Bom\n## NARRATIVA\nN\n## PERGUNTA\nP\n* A\n- B\n`;
  const bad = `=== CASO ===\nFORMATO: nada\nTÍTULO: Ruim\n## NARRATIVA\nN\n`;
  const { cases } = parseCaseFile(good + bad + good.replace("Bom", "Bom 2"));
  assert.equal(cases.length, 3);
  assert.deepEqual(cases[0].errors, []);
  assert.ok(cases[1].errors.length > 0);
  assert.equal(cases[1].doc, null);
  assert.deepEqual(cases[2].errors, []);
  // Line numbers are file-global.
  assert.equal(cases[1].startLine, 11);
});

test("duplicate titles in one file are rejected on both", () => {
  const one = `=== CASO ===\nFORMATO: decisao_30s\nTÍTULO: Igual\n## NARRATIVA\nN\n## PERGUNTA\nP\n* A\n- B\n`;
  const { cases } = parseCaseFile(one + one);
  assert.ok(cases.every((c) => c.errors.some((e) => /Título repetido/.test(e.message))));
});

test("cena: qualidade drives correctness, vai para must exist", () => {
  const text = `FORMATO: clinica_em_cena
TÍTULO: Cena
## NARRATIVA
N
## CENA: chegada
Chega.
- Estabilizar
  qualidade: ideal
  fizemos: O2
  estado: PA 92/60
  relógio: 5
- Mandar para TC
  qualidade: prejudicial
  vai para: deterioracao
- Fugir
  qualidade: inadequada
  vai para: nada
## CENA: deterioracao
Piorou.
- Voltar
  qualidade: ideal
- Insistir
  qualidade: prejudicial
## CENA: fim
Fim.
- Alta
  qualidade: aceitavel
- Internar
  qualidade: ideal
`;
  const c = parseCaseFile(text).cases[0];
  assert.ok(c.errors.some((e) => /vai para: nada/.test(e.message)));
  const fixed = parseCaseFile(text.replace("vai para: nada\n", "")).cases[0];
  assert.deepEqual(fixed.errors, []);
  const scene = fixed.doc!.steps[1];
  assert.equal(scene.scene_key, "chegada");
  assert.equal(scene.options[0].is_correct, true);
  assert.equal(scene.options[0].quality, "ideal");
  assert.equal(scene.options[0].effect.relogio, 5);
  assert.equal(scene.options[0].effect.estado!.descricao, "PA 92/60");
  assert.equal(scene.options[1].next_scene_key, "deterioracao");
});

test("round trip: serialize(parse(x)) parses back to an identical document", () => {
  const text = exampleFromModel("modelo-decisao-30s.md");
  const a = parseCaseFile(text).cases[0].doc!;
  const out = serializeCase(a);
  const b = parseCaseFile(out).cases[0];
  assert.deepEqual(b.errors, []);
  assert.deepEqual(b.doc, a);
});

test("taxonomy resolves exact then accent-insensitive; misses are warnings", () => {
  const c = parseCaseFile(`FORMATO: decisao_30s\nTÍTULO: T\nESPECIALIDADE: Pneumologia\nTEMA: Insuficiencia Cardiaca\n## NARRATIVA\nN\n## PERGUNTA\nP\n* A\n- B\n`).cases[0];
  resolveTaxonomy(
    c,
    [{ id: 10, name: "Pneumologia" }, { id: 1, name: "Cardiologia" }],
    [{ id: 99, name: "Insuficiencia Cardiaca", specialty_id: 1 }],
  );
  assert.equal(c.doc!.specialty_id, 10);
  assert.equal(c.doc!.topic_id, 99);
  const d = parseCaseFile(`FORMATO: decisao_30s\nTÍTULO: T\nESPECIALIDADE: Xis\nTEMA: Ípsilon\n## NARRATIVA\nN\n## PERGUNTA\nP\n* A\n- B\n`).cases[0];
  resolveTaxonomy(d, [{ id: 10, name: "Pneumologia" }], []);
  assert.deepEqual(d.errors, []);
  assert.ok(d.warnings.some((w) => /Especialidade "Xis"/.test(w.message)));
  assert.ok(d.warnings.some((w) => /Tema "Ípsilon"/.test(w.message)));
});

// ── scoring (§2.2 / §2.2.1) ──────────────────────────────────────────────────

test("quality weights are frozen at 1.0 / 0.6 / 0.2 / 0.0 and null falls back to is_correct", () => {
  assert.equal(optionWeight({ is_correct: false, quality: "ideal" }), 1);
  assert.equal(optionWeight({ is_correct: true, quality: "aceitavel" }), 0.6);
  assert.equal(optionWeight({ is_correct: true, quality: "inadequada" }), 0.2);
  assert.equal(optionWeight({ is_correct: true, quality: "prejudicial" }), 0);
  assert.equal(optionWeight({ is_correct: true, quality: null }), 1);
  assert.equal(optionWeight({ is_correct: false }), 0);
});

test("case score is the mean of earned weights, 0–100", () => {
  assert.equal(caseScore([1, 0.6, 0.2, 0]), 45);
  assert.equal(caseScore([1]), 100);
  assert.equal(caseScore([]), 0);
  assert.deepEqual(orderWeight([0, 1, 2], [0, 1, 2]), { weight: 1, is_correct: true });
  assert.deepEqual(orderWeight([1, 0, 2], [0, 1, 2]), { weight: 1 / 3, is_correct: false });
});

test("aggregation is per case, so a 4-decision case weighs the same as a 1-decision case", () => {
  const r = aggregateCases([
    { case_id: 1, format: "clinica_em_cena", score: 0 }, // four decisions, all wrong
    { case_id: 2, format: "decisao_30s", score: 100 }, // one decision, right
  ]);
  assert.equal(r.overall, 50);
  assert.equal(r.byFormat.clinica_em_cena!.mean, 0);
  assert.equal(r.byFormat.decisao_30s!.mean, 100);
  assert.equal(aggregateCases([]).overall, null);
});

// ── engine ───────────────────────────────────────────────────────────────────

function exampleDoc(): CaseDoc {
  const doc = parseCaseFile(exampleFromModel("modelo-decisao-30s.md")).cases[0].doc!;
  doc.steps.forEach((s, i) => {
    s.id = 100 + i;
    s.options.forEach((o, j) => (o.id = 1000 + i * 10 + j));
  });
  return doc;
}

test("screens: narrative + question + confidence + feedback/custo on one screen, closing screen after", () => {
  const screens = buildScreens(exampleDoc().steps);
  assert.equal(screens.length, 2);
  assert.equal(screens[0].before.map((s) => s.kind).join(), "narrativa");
  assert.equal(screens[0].decision!.kind, "pergunta");
  assert.equal(screens[0].askConfidence, true);
  assert.deepEqual(screens[0].after.map((s) => s.kind), ["feedback", "custo_do_atraso"]);
  assert.equal(screens[1].closing, true);
  assert.deepEqual(screens[1].before.map((s) => s.kind), ["leve_deste_caso"]);
});

test("cronômetro attaches to the following decision and never blocks answering", () => {
  const doc = exampleDoc();
  doc.steps.splice(1, 0, { position: 0.5, kind: "cronometro", enabled: true, content: { seconds: 30 }, options: [] });
  const screens = buildScreens(doc.steps);
  assert.equal(screens[0].timerSeconds, 30);
  // Answering after the timer would have expired is just an answer with time_ms > 30000.
  const applied = applyDecision(emptyState(), screens[0], { option_id: 1010, time_ms: 45000 });
  assert.equal(applied.answered.is_correct, true);
});

test("applyDecision folds weight/confidence, refuses double answers, finishes at the closing screen", () => {
  const screens = buildScreens(exampleDoc().steps);
  let state = emptyState();
  const wrong = applyDecision(state, screens[0], { option_id: 1011, confidence: "alta", time_ms: 8000 });
  state = wrong.state;
  assert.equal(wrong.answered.is_correct, false);
  assert.equal(wrong.answered.weight, 0);
  assert.equal(wrong.answered.confidence, "alta");
  assert.throws(() => applyDecision(state, screens[0], { option_id: 1010 }), /já registrada/);
  assert.deepEqual(earnedWeights(state, screens), [0]);
  assert.equal(caseScore(earnedWeights(state, screens)), 0);
  assert.equal(isFinished(state, screens), false);
  state = advance(state, screens);
  assert.equal(isFinished(state, screens), true);
});

// ── publish validator ────────────────────────────────────────────────────────

test("missing media is a warning at import but blocks publish", () => {
  const text = exampleFromModel("modelo-decisao-30s.md") + "\n## MÍDIA\n[imagem: ecg.jpg]\nlegenda: ECG.\n";
  const parsed = parseCaseFile(text).cases[0];
  assert.deepEqual(parsed.errors, []); // import: fine
  const doc = parsed.doc!;
  const unknown = validateForPublish(doc, () => null);
  assert.deepEqual(publishBlockers(unknown), []);
  const missing = validateForPublish(doc, () => false);
  assert.ok(publishBlockers(missing).some((m) => /ecg\.jpg.*não foi enviado/.test(m)));
  const present = validateForPublish(doc, () => true);
  assert.deepEqual(publishBlockers(present), []);
});

test("publish refuses a case without a correct alternative or with an unreachable scene", () => {
  const doc = exampleDoc();
  doc.steps[1].options.forEach((o) => (o.is_correct = false));
  assert.ok(publishBlockers(validateForPublish(doc)).some((m) => /exatamente uma alternativa/.test(m)));

  const scene = parseCaseFile(`FORMATO: clinica_em_cena\nTÍTULO: S\n## NARRATIVA\nN\n## CENA: a\nA\n- x\n  qualidade: ideal\n  vai para: c\n- y\n  qualidade: ideal\n  vai para: c\n## CENA: b\nB\n- z\n  qualidade: ideal\n- z2\n  qualidade: inadequada\n## CENA: c\nC\n- w\n  qualidade: ideal\n- w2\n  qualidade: aceitavel\n`).cases[0].doc!;
  assert.ok(publishBlockers(validateForPublish(scene)).some((m) => /Cena "b" nunca é alcançada/.test(m)));
});

test("media keys are deterministic and slugs come only from titles", () => {
  assert.equal(mediaKey("ECG Caso 12.JPG"), "ecg-caso-12.jpg");
  assert.equal(mediaKey("sopro-aórtico.mp3"), "sopro-aortico.mp3");
  assert.equal(mediaKey("C:\\Users\\k\\rx.png"), "rx.png");
  assert.equal(slugifyTitle("TEP — paciente instável"), "tep-paciente-instavel");
});
