/**
 * The investigation block, second half (Karina 2026-09-03 / 2026-10-06): the
 * test case, conditional results and media, the Prontuário, the score, resume,
 * branching, and the guards around it. Everything runs against the real test
 * case file Karina plays — docs/clinact/exemplos/cec-inv-teste-01.txt — through
 * the real parser and engine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCaseFile } from "@/lib/clinact/parse";
import { advance, applyDecision, buildReveal, buildScreens, earnedWeights, emptyState, stepKey, type Screen } from "@/lib/clinact/engine";
import { caseScore } from "@/lib/clinact/scoring";
import { validateForPublish } from "@/lib/clinact/validate";
import { FORMAT_PRESETS, AUTHORABLE_KINDS, isDecision } from "@/lib/clinact/format-presets";
import type { AttemptState, CaseDoc } from "@/lib/clinact/types";

const FILE = path.join(process.cwd(), "..", "docs", "clinact", "exemplos", "cec-inv-teste-01.txt");

function testCase(): CaseDoc {
  const parsed = parseCaseFile(readFileSync(FILE, "utf8")).cases[0];
  assert.deepEqual(parsed.errors, [], "the test case must parse cleanly");
  const d = parsed.doc as CaseDoc;
  d.steps.forEach((s, i) => {
    s.id = 900 + i;
    s.options.forEach((o, j) => (o.id = 9000 + i * 10 + j));
  });
  return d;
}

const d = testCase();
const screens = buildScreens(d.steps);
const invIdx = screens.findIndex((s) => s.decision?.kind === "investigacao");
const inv = screens[invIdx];
const idOf = (label: string) => {
  const o = inv.decision!.options.find((x) => x.label.startsWith(label));
  assert.ok(o, `option "${label}" exists`);
  return o!.id!;
};
const IDEAL = ["Radiografia", "Hemograma", "Ureia", "Gasometria"].map(idOf);

/** Plays from the start: first ideal conduct in each scene, `selected` at the investigation. */
function playTo(selected: number[], opts: { detour?: boolean } = {}): { state: AttemptState; screen: Screen } {
  let state = emptyState();
  for (let guard = 0; guard < 20; guard++) {
    const sc = screens[state.cursor];
    if (sc.closing) break;
    if (sc.decision?.kind === "investigacao") {
      state = applyDecision(state, sc, { selected, confidence: "media" }).state;
      return { state, screen: sc };
    }
    const first = opts.detour && sc.decision?.scene_key === "chegada"
      ? sc.decision.options.find((o) => o.next_scene_key)!
      : sc.decision!.options.find((o) => o.quality === "ideal")!;
    state = applyDecision(state, sc, { option_id: first.id! }).state;
    state = advance(state, screens);
  }
  throw new Error("never reached the investigation");
}

// ── The test case itself ─────────────────────────────────────────────────────

test("the test case is a Clínica em Cena with one INVESTIGAÇÃO of 8 options, 4 of them ideal", () => {
  assert.equal(d.format, "clinica_em_cena");
  assert.ok(inv, "the block exists");
  assert.equal(inv.decision!.options.length, 8);
  assert.equal(inv.decision!.options.filter((o) => o.quality === "ideal").length, 4);
  assert.ok(inv.decision!.options.every((o) => o.quality), "every option carries a quality");
  assert.ok(inv.askConfidence, "the selective confidence follows the investigation in this case");
  // The question text survives the import (it used to be dropped).
  assert.match(String((inv.decision!.content as { prompt?: string }).prompt), /Quais exames você deseja solicitar/);
  // It parses without warnings: the block is part of the Clínica em Cena model.
  const parsed = parseCaseFile(readFileSync(FILE, "utf8")).cases[0];
  assert.deepEqual(parsed.warnings, []);
});

test("it is clearly a test, never free, and passes the publish checks", () => {
  assert.match(d.title, /^CEC-INV-TESTE-01/);
  assert.notEqual(d.is_free, true);
  const blockers = validateForPublish(d).filter((c) => !c.ok && c.blocking);
  assert.deepEqual(blockers.map((c) => c.message), []);
});

// ── Selection and score ──────────────────────────────────────────────────────

test("one option: a single ideal exam scores 1/4", () => {
  const { state } = playTo([IDEAL[0]]);
  assert.equal(state.answered[stepKey(inv.decision!)].weight, 0.25);
});

test("multiple options: the complete, focused investigation scores 1.0", () => {
  const { state } = playTo(IDEAL);
  assert.equal(state.answered[stepKey(inv.decision!)].weight, 1);
  assert.equal(state.answered[stepKey(inv.decision!)].is_correct, true);
});

test("incomplete: leaving out the blood gas costs a quarter", () => {
  const { state } = playTo(IDEAL.slice(0, 3));
  assert.equal(state.answered[stepKey(inv.decision!)].weight, 0.75);
});

test("excess: ordering everything 'to be safe' scores well below the focused set", () => {
  const all = inv.decision!.options.map((o) => o.id!);
  const { state } = playTo(all);
  // (4 ideal + 0.6 + 0.2 + 0.2 + 0) / (4 + 4 extras) = 0.625
  assert.equal(state.answered[stepKey(inv.decision!)].weight, 0.63);
});

test("inadequate and harmful options cost more than an acceptable one", () => {
  const withCulture = playTo([...IDEAL, idOf("Hemoculturas")]).state.answered[stepKey(inv.decision!)].weight;
  const withDdimer = playTo([...IDEAL, idOf("D-dímero")]).state.answered[stepKey(inv.decision!)].weight;
  const withCT = playTo([...IDEAL, idOf("Tomografia")]).state.answered[stepKey(inv.decision!)].weight;
  assert.ok(withCulture > withDdimer && withDdimer > withCT, `${withCulture} > ${withDdimer} > ${withCT}`);
});

test("the investigation counts as ONE decision in the case score", () => {
  const { state } = playTo(IDEAL);
  const weights = earnedWeights(state, screens);
  // chegada + investigação so far: two decisions, not one per exam.
  assert.equal(weights.length, 2);
  assert.equal(caseScore(weights), 100); // case score is a percentage
});

// ── Conditional results and media ────────────────────────────────────────────

test("results: only what was ordered comes back, and nothing else leaves the server", () => {
  const { state, screen } = playTo([IDEAL[1]]); // hemograma only
  const reveal = buildReveal(screen, { state, answered: state.answered[stepKey(inv.decision!)], chosen: null, reveals: [] });
  assert.deepEqual(reveal.selected, [IDEAL[1]]);
  assert.equal(reveal.results!.length, 1);
  const wire = JSON.stringify(reveal);
  assert.match(wire, /Leucócitos 17\.600/);
  assert.doesNotMatch(wire, /PaO2 80/, "the blood gas was not ordered");
  assert.doesNotMatch(wire, /1\.150 ng\/mL/, "the D-dimer was not ordered");
  assert.doesNotMatch(wire, /Consolidação no lobo/, "the CT was not ordered");
});

test("media: the X-ray image appears only when the X-ray was ordered", () => {
  const without = playTo([IDEAL[1], IDEAL[2]]);
  const r1 = buildReveal(without.screen, { state: without.state, answered: without.state.answered[stepKey(inv.decision!)], chosen: null, reveals: [] });
  assert.doesNotMatch(JSON.stringify(r1), /cec-01_img1/);
  const withRx = playTo([IDEAL[0]]);
  const r2 = buildReveal(withRx.screen, { state: withRx.state, answered: withRx.state.answered[stepKey(inv.decision!)], chosen: null, reveals: [] });
  const img = r2.results![0].items.find((x) => x.midia)?.midia;
  assert.equal(img?.type, "image");
  assert.match(img!.url, /cec-01_img1\.jpg$/);
});

test("Prontuário Vivo holds exactly the exams ordered, and the clock only their time", () => {
  const before = playTo([]).state;
  const { state } = playTo([IDEAL[0], idOf("D-dímero")]);
  const texts = state.revealed.map((r) => r.texto).join(" | ");
  assert.match(texts, /Radiografia de tórax/);
  assert.match(texts, /D-dímero de 1\.150/);
  assert.doesNotMatch(texts, /Leucócitos/);
  assert.equal(state.relogio - before.relogio, 8 + 4);
});

test("confirming with nothing selected is allowed and scores zero", () => {
  const { state } = playTo([]);
  const a = state.answered[stepKey(inv.decision!)];
  assert.equal(a.weight, 0);
  assert.deepEqual(a.selected, []);
});

// ── Resume ───────────────────────────────────────────────────────────────────

test("resume rebuilds exactly the confirmation screen the student saw", () => {
  const { state, screen } = playTo([IDEAL[0], IDEAL[3], idOf("Procalcitonina")]);
  const live = buildReveal(screen, { state, answered: state.answered[stepKey(inv.decision!)], chosen: null, reveals: [] });
  // What player-load does on resume: the saved state only, round-tripped as JSON.
  const saved = JSON.parse(JSON.stringify(state)) as AttemptState;
  const resumed = buildReveal(screen, { state: saved, answered: saved.answered[stepKey(inv.decision!)], chosen: null, reveals: [] });
  assert.deepEqual(resumed, live);
  assert.equal(saved.answered[stepKey(inv.decision!)].confidence, "media");
});

test("after confirming, the selection cannot be changed", () => {
  const { state, screen } = playTo([IDEAL[0]]);
  assert.throws(() => applyDecision(state, screen, { selected: IDEAL }), /já registrada/);
});

// ── Branching and reconvergence ──────────────────────────────────────────────

test("the normal route skips the detour scene and reaches the investigation", () => {
  const { state } = playTo(IDEAL);
  const detour = screens.find((s) => s.decision?.scene_key === "resposta_broncodilatador")!;
  assert.equal(state.answered[stepKey(detour.decision!)], undefined);
});

test("the detour reconverges on the investigation, and the case then continues to gravidade", () => {
  const { state } = playTo(IDEAL, { detour: true });
  const detour = screens.find((s) => s.decision?.scene_key === "resposta_broncodilatador")!;
  assert.ok(state.answered[stepKey(detour.decision!)], "the detour scene was played");
  const next = advance(state, screens);
  assert.equal(screens[next.cursor].decision?.scene_key, "gravidade");
});

// ── Guards ───────────────────────────────────────────────────────────────────

test("a single-choice answer sent to an investigation is refused, and the reverse", () => {
  let state = emptyState();
  const first = screens[0];
  assert.throws(() => applyDecision(state, first, { selected: [first.decision!.options[0].id!] }), /incompatível/);
  state = playTo([]).state;
  const fresh = emptyState();
  assert.throws(() => applyDecision({ ...fresh, cursor: invIdx }, inv, { option_id: IDEAL[0] }), /incompatível/);
});

test("the next scene does not restate results the student may not have ordered", () => {
  const grav = screens.find((s) => s.decision?.scene_key === "gravidade")!;
  const text = String((grav.decision!.content as { text?: string }).text);
  for (const value of ["PaO2/FiO2", "ureia 54", "Leucócitos", "BUN"]) {
    assert.ok(!text.includes(value), `gravidade must not state "${value}"`);
  }
});

// ── Editor and publish wiring ────────────────────────────────────────────────

test("the block is offered in Clínica em Cena only, is a decision everywhere, and can be added by hand", () => {
  assert.ok(FORMAT_PRESETS.clinica_em_cena.optional.includes("investigacao"));
  for (const f of ["decisao_30s", "codigo_clinico", "ponto_de_virada"] as const) {
    assert.ok(![...FORMAT_PRESETS[f].default, ...FORMAT_PRESETS[f].optional].includes("investigacao"), f);
  }
  assert.ok(isDecision("investigacao"));
  assert.ok(AUTHORABLE_KINDS.includes("investigacao"));
});

test("publish refuses an investigation without quality on every option or without an ideal", () => {
  const broken = testCase();
  const step = broken.steps.find((s) => s.kind === "investigacao")!;
  step.options[1].quality = null;
  const msgs = validateForPublish(broken).filter((c) => !c.ok && c.blocking).map((c) => c.message);
  assert.ok(msgs.some((m) => /sem qualidade/.test(m)), msgs.join("; "));
  step.options.forEach((o) => (o.quality = "aceitavel"));
  const msgs2 = validateForPublish(broken).filter((c) => !c.ok && c.blocking).map((c) => c.message);
  assert.ok(msgs2.some((m) => /nenhuma opção Ideal/.test(m)), msgs2.join("; "));
});
