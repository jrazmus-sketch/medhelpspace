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
import { investigationSummary, type AttemptState, type CaseDoc } from "@/lib/clinact/types";

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

test("the classifications are Karina's final ones (2026-10-06): the CT is inadequada, not prejudicial", () => {
  const quality = Object.fromEntries(inv.decision!.options.map((o) => [o.label, o.quality]));
  assert.deepEqual(quality, {
    "Radiografia de tórax": "ideal",
    "D-dímero": "inadequada",
    "Hemograma completo": "ideal",
    "Hemoculturas (duas amostras)": "aceitavel",
    "Ureia, creatinina e eletrólitos": "ideal",
    "Tomografia de tórax com contraste": "inadequada",
    "Gasometria arterial": "ideal",
    "Procalcitonina": "inadequada",
  });
});

test("excess: ordering everything 'to be safe' scores well below the focused set", () => {
  const all = inv.decision!.options.map((o) => o.id!);
  const { state } = playTo(all);
  // (4 ideal + 0.6 + 0.2 + 0.2 + 0.2) / (4 + 4 extras) = 0.65
  assert.equal(state.answered[stepKey(inv.decision!)].weight, 0.65);
});

test("an inadequate option costs more than an acceptable one, and the CT now weighs as inadequate", () => {
  const withCulture = playTo([...IDEAL, idOf("Hemoculturas")]).state.answered[stepKey(inv.decision!)].weight;
  const withDdimer = playTo([...IDEAL, idOf("D-dímero")]).state.answered[stepKey(inv.decision!)].weight;
  const withCT = playTo([...IDEAL, idOf("Tomografia")]).state.answered[stepKey(inv.decision!)].weight;
  assert.ok(withCulture > withDdimer, `${withCulture} > ${withDdimer}`);
  assert.equal(withCT, withDdimer); // (4 + 0.2) / 5 = 0.84 for both
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

test("resume after an EMPTY confirmation stays on the confirmation screen (Karina 2026-10-06)", () => {
  const { state, screen } = playTo([]);
  // Confirming saves the answer but never moves on: only Continuar advances.
  assert.equal(state.cursor, invIdx);
  const saved = JSON.parse(JSON.stringify(state)) as AttemptState;
  const a = saved.answered[stepKey(inv.decision!)];
  assert.ok(a, "an empty selection still counts as answered, so the player shows the result screen");
  assert.deepEqual(a.selected, []);
  assert.equal(a.confidence, "media");
  const resumed = buildReveal(screen, { state: saved, answered: a, chosen: null, reveals: [] });
  assert.deepEqual(resumed.selected, []);
  assert.deepEqual(resumed.results, []);
  assert.equal(resumed.options.length, 8, "every option comes back for 'O que você não solicitou'");
  assert.equal(saved.relogio, playTo([]).state.relogio);
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

// ── Karina's permanent rule (2026-10-06) ─────────────────────────────────────
// Nothing after the block, and no feedback inside it (unordered items show
// theirs too), may assert, calculate, exclude or presuppose a result the
// student may not have ordered.

/** Every text a student reads whatever they ordered: the block's feedback and everything after it. */
function textsForEveryone(doc: CaseDoc): string[] {
  const steps = doc.steps.filter((s) => s.enabled).sort((a, b) => a.position - b.position);
  const at = steps.findIndex((s) => s.kind === "investigacao");
  const all = (v: unknown): string[] =>
    typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(all) : v && typeof v === "object" ? Object.values(v).flatMap(all) : [];
  return [
    ...steps[at].options.map((o) => o.feedback ?? ""),
    ...steps.slice(at + 1).flatMap((s) => [...all(s.content), ...s.options.flatMap((o) => [o.label, o.feedback ?? "", ...all(o.effect)])]),
    doc.takeaway ?? "",
  ];
}

test("no later text, and no feedback in the block, leans on a result the student may not have ordered", () => {
  const text = textsForEveryone(d).join("\n");
  const leaks: [RegExp, string][] = [
    [/PaO2\/FiO2 de \d/, "states the blood gas"],
    [/ureia (de |é )?\d/i, "states the urea"],
    [/Leucócitos|plaquetas \d/i, "states the blood count"],
    [/CURB-65 de 3/, "calculates with the urea (bedside alone gives CRB-65 de 2)"],
    [/três critérios menores/, "excludes with the gas, count, urea and X-ray"],
    [/imagem (é|são) compatíve/, "presupposes the X-ray"],
    [/confirma a pneumonia/, "presupposes a positive X-ray"],
    [/pneumonia não grave/, "classifies the severity, which needs the blood gas"],
  ];
  for (const [re, why] of leaks) assert.doesNotMatch(text, re, why);
});

test("no later conduct orders again an exam the student may already have ordered (Karina 2026-10-06)", () => {
  const steps = d.steps.filter((s) => s.enabled).sort((a, b) => a.position - b.position);
  const at = steps.findIndex((s) => s.kind === "investigacao");
  // "Hemoculturas (duas amostras)" → "hemoculturas", "Ureia, creatinina…" → "ureia", …
  const exams = steps[at].options.map((o) => o.label.split(/[ ,(]/)[0].toLowerCase());
  for (const s of steps.slice(at + 1)) {
    for (const o of s.options) {
      for (const exam of exams) assert.ok(!o.label.toLowerCase().includes(exam), `"${o.label}" orders ${exam} again`);
    }
  }
  // Her replacement for "Colher hemoculturas…": the gap to the ideal is the monitoring, never an exam.
  const grav = steps.find((s) => s.scene_key === "gravidade")!;
  const acceptable = grav.options.find((o) => o.quality === "aceitavel")!;
  assert.match(acceptable.label, /com monitorização habitual da unidade$/);
  assert.match(acceptable.feedback!, /vigilância mais próxima e reavaliação precoce/);
});

test("the CT and blood-culture feedbacks are Karina's (2026-10-06): no delay as the CT's reason, no severity label", () => {
  const all = d.steps.find((s) => s.kind === "investigacao")!.options;
  const fb = (start: string) => all.find((o) => o.label.startsWith(start))!.feedback!;
  assert.match(fb("Tomografia"), /^Em uma apresentação clínica típica e estável, a tomografia contrastada não é necessária/);
  assert.doesNotMatch(fb("Tomografia"), /atras/);
  assert.match(fb("Hemoculturas"), /^Hemoculturas podem acrescentar informação na pneumonia grave/);
});

test("the publish checklist flags a later text that repeats a result-only number", () => {
  const warnings = (doc: CaseDoc) => validateForPublish(doc).filter((c) => !c.ok && /só existe no resultado/.test(c.message));
  assert.deepEqual(warnings(d).map((c) => c.message), [], "the test case itself is clean");

  const leaky = testCase();
  const grav = leaky.steps.find((s) => s.scene_key === "gravidade")!;
  // A number the student already knew (FiO2 28%, set in the first scene) is not a leak…
  (grav.content as { text: string }).text += " Mantenha a FiO2 de 28%.";
  assert.deepEqual(warnings(leaky), []);
  // …the P/F of 286 exists only in the blood gas result.
  (grav.content as { text: string }).text += " A relação PaO2/FiO2 de 286 indica…";
  const w = warnings(leaky);
  assert.equal(w.length, 1);
  assert.match(w[0].message, /"286" só existe no resultado de "Gasometria arterial"/);
  assert.equal(w[0].blocking, false, "a warning, not a blocker: the semantic half is the author's read");

  // A feedback in the block is read for unordered items too.
  const leakyFeedback = testCase();
  const rx = leakyFeedback.steps.find((s) => s.kind === "investigacao")!.options.find((o) => o.label.startsWith("Hemograma"))!;
  rx.feedback += " Aqui, 17.600 leucócitos.";
  assert.match(warnings(leakyFeedback)[0].message, /"17\.600".*o feedback de "Hemograma completo"/);
});

test("the summary counts 'itens da investigação ideal', never 'essenciais' (Karina 2026-10-06)", () => {
  // Her two sentences, verbatim.
  assert.equal(investigationSummary(4, 4, 0), "Você solicitou os 4 itens da investigação ideal.");
  assert.equal(investigationSummary(4, 3, 1), "Você solicitou 3 de 4 itens da investigação ideal e mais 1 item além deles.");
  // The rest of the grid.
  assert.equal(investigationSummary(4, 4, 2), "Você solicitou os 4 itens da investigação ideal e mais 2 itens além deles.");
  assert.equal(investigationSummary(4, 3, 0), "Você solicitou 3 de 4 itens da investigação ideal.");
  assert.equal(investigationSummary(4, 0, 2), "Você não solicitou nenhum dos 4 itens da investigação ideal e solicitou 2 itens além deles.");
  assert.equal(investigationSummary(4, 0, 0), "Você não solicitou nenhum item.");
  assert.equal(investigationSummary(1, 1, 1), "Você solicitou o item da investigação ideal e mais 1 item além dele.");
  assert.equal(investigationSummary(1, 0, 1), "Você não solicitou o item da investigação ideal e solicitou 1 item além dele.");
  for (const [a, b, c] of [[4, 4, 0], [4, 3, 1], [4, 0, 2], [1, 0, 1], [0, 0, 2]]) {
    assert.doesNotMatch(investigationSummary(a, b, c), /essencia/i);
  }
});

// ── Official release (Karina 2026-10-06: "oficialmente aprovado") ────────────

const DOCS = path.join(process.cwd(), "..", "docs", "clinact");
const doc = (f: string) => readFileSync(path.join(DOCS, f), "utf8").split("\r\n").join("\n");

test("the guide no longer marks the block as a test, and lists it among the blocks", () => {
  const guide = doc("formato-de-conteudo.md");
  assert.doesNotMatch(guide, /Em teste/);
  assert.match(guide, /Blocos disponíveis:[^]*?`INVESTIGAÇÃO` \(só na Clínica em Cena\)/);
  // The rules frozen during validation stay, as permanent rules.
  for (const rule of [
    /Nenhuma cena, alternativa, feedback ou texto posterior pode afirmar, calcular,\n  > excluir ou pressupor/,
    /Depois de INVESTIGAÇÃO, nenhuma alternativa posterior deve mandar repetir/,
    /O feedback nunca contém nem pressupõe o resultado/,
    /`ideal` vale para este caso, neste momento/,
    /Confiança continua seletiva/,
  ]) assert.match(guide, rule);
});

test("the Clínica em Cena template offers the block, and its snippet imports once filled in", () => {
  const md = doc("modelo-clinica-em-cena.md");
  assert.match(md, /\| `INVESTIGAÇÃO` \| \*\*opcional\*\*/);
  const at = md.indexOf("### Trecho para copiar");
  const open = md.indexOf("```", at) + 3;
  const snippet = md.slice(open, md.indexOf("```", open)).replace(/^\n/, "");
  const wrap = (block: string) =>
    `FORMATO: clinica_em_cena\nTÍTULO: Teste do trecho\nESPECIALIDADE: Pneumologia\n\n## CENA: chegada\nC\n\n- Conduta A\n  qualidade: ideal\n  feedback: f\n- Conduta B\n  qualidade: inadequada\n  feedback: f\n\n${block}\n## LEVE DESTE CASO\nL\n`;
  // Left as is, the placeholders are a loud error — never a silent import.
  const raw = parseCaseFile(wrap(snippet)).cases[0];
  assert.ok(raw.errors.some((e) => /texto de exemplo do modelo/.test(e.message)), JSON.stringify(raw.errors));
  // Filled in, it is a real investigation block.
  let n = 0;
  const filled = snippet
    .replace("## INVESTIGAÇÃO\n", "## INVESTIGAÇÃO\nQuais exames você deseja solicitar?\n")
    .replace(/\[exame ou ação\]/g, () => `Exame ${++n}`)
    .replace("qualidade:\n", "qualidade: ideal\n")
    .replace(/qualidade:\n/g, "qualidade: inadequada\n")
    .replace(/(feedback|fizemos|encontramos):\n/g, "$1: texto\n")
    .replace(/relógio:\n/g, "relógio: 4\n");
  const ok = parseCaseFile(wrap(filled)).cases[0];
  assert.deepEqual(ok.errors, []);
  const step = ok.doc!.steps.find((s) => s.kind === "investigacao")!;
  assert.equal(step.options.length, 3);
  assert.ok(step.options.some((o) => o.quality === "ideal"));
});

test("the X-ray feedback is Karina's final wording (2026-10-06)", () => {
  const rx = d.steps.find((s) => s.kind === "investigacao")!.options.find((o) => o.label.startsWith("Radiografia"))!;
  assert.match(rx.feedback!, /ajuda a confirmar ou enfraquecer a hipótese, avalia a extensão e procura complicações\.$/);
  assert.doesNotMatch(rx.feedback!, /confirma ou afasta/);
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
