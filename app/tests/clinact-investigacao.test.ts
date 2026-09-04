import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCaseFile } from "@/lib/clinact/parse";
import { serializeCase } from "@/lib/clinact/serialize";
import { selectionWeight } from "@/lib/clinact/scoring";
import { buildScreens, applyDecision, emptyState } from "@/lib/clinact/engine";
import { DECISION_KINDS, MULTI_SELECT_KINDS, type CaseDoc } from "@/lib/clinact/types";

// The investigation block for Clínica em Cena, approved by Karina 2026-09-03.
// Two things must be exactly right: the score rule she approved, and the
// guarantee that a student only ever receives what they ordered.

const OPTS = [
  { id: 1, position: 0, quality: "ideal" as const },
  { id: 2, position: 1, quality: "ideal" as const },
  { id: 3, position: 2, quality: "aceitavel" as const },
  { id: 4, position: 3, quality: "inadequada" as const },
  { id: 5, position: 4, quality: "prejudicial" as const },
];

// ── The score rule ──────────────────────────────────────────────────────────

test("a focused, complete investigation scores 1.0", () => {
  const r = selectionWeight(OPTS, [1, 2]);
  assert.equal(r.weight, 1);
  assert.equal(r.is_correct, true);
});

test("missing an essential exam costs, even if everything ordered was ideal", () => {
  // 1 ideal of 2, nothing extra → 1 / 2.
  const r = selectionWeight(OPTS, [1]);
  assert.equal(r.weight, 0.5);
  assert.equal(r.is_correct, false, "an incomplete investigation is not the ideal one");
});

test("ordering everything 'to be safe' is punished", () => {
  // earned 1+1+0.6+0.2+0 = 2.8 ; denominator 2 ideals + 3 extras = 5.
  const r = selectionWeight(OPTS, [1, 2, 3, 4, 5]);
  assert.equal(r.weight, 0.56);
  assert.equal(r.is_correct, false);
  assert.ok(r.weight < selectionWeight(OPTS, [1, 2]).weight, "worse than the focused investigation");
});

test("a harmful request costs twice — no credit, and it grows the denominator", () => {
  const clean = selectionWeight(OPTS, [1, 2]);
  const withHarm = selectionWeight(OPTS, [1, 2, 5]);
  assert.equal(withHarm.weight, 0.67); // 2 / 3
  assert.ok(withHarm.weight < clean.weight);
});

test("an acceptable extra costs less than a harmful one", () => {
  assert.ok(selectionWeight(OPTS, [1, 2, 3]).weight > selectionWeight(OPTS, [1, 2, 5]).weight);
});

test("ordering nothing scores zero rather than dividing by zero", () => {
  assert.deepEqual(selectionWeight(OPTS, []), { weight: 0, is_correct: false });
  // And a block with no ideal option authored cannot produce a false 1.0.
  assert.deepEqual(selectionWeight([{ id: 9, position: 0, quality: "aceitavel" }], []), {
    weight: 0,
    is_correct: false,
  });
});

test("the weight never exceeds 1", () => {
  const manyIdeal = [
    { id: 1, position: 0, quality: "ideal" as const },
    { id: 2, position: 1, quality: "ideal" as const },
  ];
  assert.ok(selectionWeight(manyIdeal, [1, 2]).weight <= 1);
});

test("her editorial rule matters: two substitutable ideals demand both", () => {
  // This is exactly why she froze the rule — the formula treats every `ideal`
  // as required, so marking substitutes as ideal makes 1.0 unreachable
  // without ordering both.
  const substitutes = [
    { id: 1, position: 0, quality: "ideal" as const },
    { id: 2, position: 1, quality: "ideal" as const },
  ];
  assert.equal(selectionWeight(substitutes, [1]).weight, 0.5);
});

// ── One decision, and only what was ordered ────────────────────────────────

const CASE = `FORMATO: clinica_em_cena
TÍTULO: Investigação
## NARRATIVA
Paciente com quadro respiratório.
## CENA: chegada
Você assume o plantão.
- Estabilizar
  qualidade: ideal
  relógio: 5
- Esperar
  qualidade: inadequada
  relógio: 10
## INVESTIGAÇÃO
Quais exames você deseja solicitar agora?
- Radiografia de tórax
  qualidade: ideal
  encontramos: Consolidação em base direita.
  relógio: 10
- Hemograma
  qualidade: ideal
  encontramos: Leucocitose com desvio.
  relógio: 5
- D-dímero
  qualidade: inadequada
  encontramos: Discretamente elevado, inespecífico.
  relógio: 5
## LEVE DESTE CASO
Peça o exame que muda a conduta.
`;

function doc(): CaseDoc {
  const parsed = parseCaseFile(CASE).cases[0];
  assert.deepEqual(parsed.errors, [], "the block must parse cleanly");
  const d = parsed.doc as CaseDoc;
  d.steps.forEach((s, i) => {
    s.id = 600 + i;
    s.options.forEach((o, j) => (o.id = 6000 + i * 10 + j));
  });
  return d;
}

test("INVESTIGAÇÃO parses as a decision with its options", () => {
  const d = doc();
  const step = d.steps.find((s) => s.kind === "investigacao");
  assert.ok(step, "the block exists");
  assert.equal(step!.options.length, 3);
  assert.ok(DECISION_KINDS.includes("investigacao"));
  assert.ok(MULTI_SELECT_KINDS.includes("investigacao"));
});

test("only the ordered exams reach the Prontuário Vivo", () => {
  const d = doc();
  const screens = buildScreens(d.steps);
  const inv = screens.find((s) => s.decision?.kind === "investigacao")!;
  const [rx, hemo, ddimer] = inv.decision!.options;

  const after = applyDecision(emptyState(), inv, { selected: [rx.id!, hemo.id!] }).state;
  const texts = after.revealed.map((r) => r.texto);
  assert.ok(texts.some((t) => /Consolidação/.test(t)), "the X-ray she ordered is there");
  assert.ok(texts.some((t) => /Leucocitose/.test(t)), "the blood count too");
  assert.ok(!texts.some((t) => /inespecífico/.test(t)), "the D-dimer she did NOT order must not appear");
  assert.equal(ddimer.effect.revela?.length, 1, "though it does have a result authored");
});

test("the clock counts only the exams actually ordered", () => {
  const d = doc();
  const screens = buildScreens(d.steps);
  const inv = screens.find((s) => s.decision?.kind === "investigacao")!;
  const [rx, , ddimer] = inv.decision!.options;
  assert.equal(applyDecision(emptyState(), inv, { selected: [rx.id!] }).state.relogio, 10);
  assert.equal(applyDecision(emptyState(), inv, { selected: [rx.id!, ddimer.id!] }).state.relogio, 15);
  assert.equal(applyDecision(emptyState(), inv, { selected: [] }).state.relogio, 0);
});

test("the whole block is ONE answer, so counts and confidence cannot inflate", () => {
  const d = doc();
  const screens = buildScreens(d.steps);
  const inv = screens.find((s) => s.decision?.kind === "investigacao")!;
  const ids = inv.decision!.options.map((o) => o.id!);
  const { state, answered } = applyDecision(emptyState(), inv, { selected: ids, confidence: "alta" });
  assert.equal(Object.keys(state.answered).length, 1, "three exams, one decision");
  assert.deepEqual(answered.selected, ids);
  assert.equal(answered.confidence, "alta", "one confidence, for the strategy as a whole");
});

test("ordering the same set in a different click order gives the same state", () => {
  const d = doc();
  const screens = buildScreens(d.steps);
  const inv = screens.find((s) => s.decision?.kind === "investigacao")!;
  const [a, b] = inv.decision!.options;
  const one = applyDecision(emptyState(), inv, { selected: [a.id!, b.id!] }).state;
  const two = applyDecision(emptyState(), inv, { selected: [b.id!, a.id!] }).state;
  assert.deepEqual(one.revealed, two.revealed);
  assert.equal(one.relogio, two.relogio);
});

// ── Backward compatibility: her hard condition ─────────────────────────────

test("an option with no quality is refused in INVESTIGAÇÃO", () => {
  const bad = CASE.replace("  qualidade: inadequada\n  encontramos: Discretamente elevado, inespecífico.\n", "  encontramos: Discretamente elevado, inespecífico.\n");
  const c = parseCaseFile(bad).cases[0];
  assert.ok(c.errors.some((e) => /INVESTIGAÇÃO toda opção precisa de "qualidade:"/.test(e.message)));
});

test("a case without the block is completely unaffected", () => {
  const plain = `FORMATO: clinica_em_cena
TÍTULO: Sem investigação
## NARRATIVA
N
## CENA: chegada
C
- Ideal
  qualidade: ideal
- Ruim
  qualidade: prejudicial
## LEVE DESTE CASO
L
`;
  const c = parseCaseFile(plain).cases[0];
  assert.deepEqual(c.errors, []);
  assert.ok(!c.doc!.steps.some((s) => s.kind === "investigacao"));
});

test("the block survives a round trip through the authoring format", () => {
  const text = serializeCase(doc());
  assert.ok(text.includes("## INVESTIGAÇÃO"), "it serialises under its own header");
  const back = parseCaseFile(text).cases[0];
  assert.deepEqual(back.errors, []);
  const step = back.doc!.steps.find((s) => s.kind === "investigacao");
  assert.equal(step?.options.length, 3);
  assert.equal(step?.options[0].quality, "ideal");
});
