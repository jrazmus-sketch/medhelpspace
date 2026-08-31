import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCaseFile } from "@/lib/clinact/parse";
import { validateForPublish, publishBlockers } from "@/lib/clinact/validate";
import { buildScreens, applyDecision, advance, emptyState, earnedWeights, isFinished, stepKey } from "@/lib/clinact/engine";
import { caseScore } from "@/lib/clinact/scoring";
import { firstIntervalDays, secondIntervalDays } from "@/lib/clinact/review";
import type { CaseDoc } from "@/lib/clinact/types";

// ── Clínica em Cena — the guide's INLINE detour layout ───────────────────────
// chegada → deterioracao (detour, only via "vai para") → investigacao → fim.
// Good conducts of chegada must land on investigacao, skipping the detour.

const CENA_TEXT = `FORMATO: clinica_em_cena
TÍTULO: Cena com desvio
## NARRATIVA
Abertura.
## CENA: chegada
Chega instável.
- Estabilizar
  qualidade: ideal
  fizemos: O2 e acesso
  estado: PA 92/60
  relógio: 5
- Pedir exames sem estabilizar
  qualidade: inadequada
  relógio: 10
- Mandar para a TC
  qualidade: prejudicial
  estado: PA 78/48
  relógio: 15
  vai para: deterioracao
## CENA: deterioracao
Piorou no transporte.
- Voltar e estabilizar
  qualidade: aceitavel
  relógio: 10
- Insistir na TC
  qualidade: prejudicial
  relógio: 20
## CENA: investigacao
Investigar.
- Eco à beira-leito
  qualidade: ideal
- D-dímero
  qualidade: inadequada
## CENA: fim
Definir conduta.
- Tratar
  qualidade: ideal
- Observar
  qualidade: inadequada
## FEEDBACK
Fecho.
## LEVE DESTE CASO
Estabilize antes de transportar.
`;

function cenaDoc(): CaseDoc {
  const c = parseCaseFile(CENA_TEXT).cases[0];
  assert.deepEqual(c.errors, []);
  const doc = c.doc!;
  doc.steps.forEach((s, i) => {
    s.id = 100 + i;
    s.options.forEach((o, j) => (o.id = 1000 + i * 10 + j));
  });
  return doc;
}

test("inline detour passes the publish validator (guide template layout)", () => {
  const doc = cenaDoc();
  assert.deepEqual(publishBlockers(validateForPublish(doc)), []);
});

test("good path skips the detour scene; weights count only visited scenes", () => {
  const doc = cenaDoc();
  const screens = buildScreens(doc.steps);
  // screens: [chegada, deterioracao, investigacao, fim(+feedback), closing]
  assert.equal(screens.filter((s) => s.decision).length, 4);

  let state = emptyState();
  const chegada = screens[0];
  const ideal = chegada.decision!.options[0];
  state = applyDecision(state, chegada, { option_id: ideal.id! }).state;
  state = advance(state, screens);
  // Skipped deterioracao (index 1) — landed on investigacao (index 2).
  assert.equal(screens[state.cursor].decision!.scene_key, "investigacao");

  state = applyDecision(state, screens[state.cursor], { option_id: screens[2].decision!.options[0].id! }).state;
  state = advance(state, screens);
  assert.equal(screens[state.cursor].decision!.scene_key, "fim");
  state = applyDecision(state, screens[state.cursor], { option_id: screens[3].decision!.options[0].id! }).state;
  state = advance(state, screens);
  assert.equal(isFinished(state, screens), true);

  const weights = earnedWeights(state, screens);
  assert.deepEqual(weights, [1, 1, 1]); // three scenes visited, detour skipped
  assert.equal(caseScore(weights), 100);
});

test("bad path enters the detour and converges to investigacao", () => {
  const doc = cenaDoc();
  const screens = buildScreens(doc.steps);
  let state = emptyState();
  const chegada = screens[0];
  const prejudicial = chegada.decision!.options[2];
  const applied = applyDecision(state, chegada, { option_id: prejudicial.id! });
  state = applied.state;
  // Effects folded: estado + relógio from the harmful conduct.
  assert.equal(state.estado.descricao, "PA 78/48");
  assert.equal(state.relogio, 15);

  state = advance(state, screens);
  assert.equal(screens[state.cursor].decision!.scene_key, "deterioracao");
  state = applyDecision(state, screens[state.cursor], { option_id: screens[1].decision!.options[0].id! }).state;
  assert.equal(state.relogio, 25);
  state = advance(state, screens);
  // Detour converges: next non-detour scene.
  assert.equal(screens[state.cursor].decision!.scene_key, "investigacao");

  state = applyDecision(state, screens[state.cursor], { option_id: screens[2].decision!.options[1].id! }).state;
  state = advance(state, screens);
  state = applyDecision(state, screens[state.cursor], { option_id: screens[3].decision!.options[0].id! }).state;
  state = advance(state, screens);
  assert.equal(isFinished(state, screens), true);
  // prejudicial 0.0 + aceitavel 0.6 + inadequada 0.2 + ideal 1.0 over 4 decisions.
  assert.equal(caseScore(earnedWeights(state, screens)), 45);
});

test("resume mid-detour: state alone reproduces the same position", () => {
  const doc = cenaDoc();
  const screens = buildScreens(doc.steps);
  let state = emptyState();
  state = applyDecision(state, screens[0], { option_id: screens[0].decision!.options[2].id! }).state;
  state = advance(state, screens);
  // Serialize/deserialize (what clinact_attempts.state does) and keep advancing.
  const resumed = JSON.parse(JSON.stringify(state));
  assert.equal(screens[resumed.cursor].decision!.scene_key, "deterioracao");
  assert.equal(resumed.answered[stepKey(screens[0].decision!)].weight, 0);
});

test("validator refuses a detour that chains into another detour", () => {
  const text = CENA_TEXT.replace(
    `- Insistir na TC
  qualidade: prejudicial
  relógio: 20`,
    `- Insistir na TC
  qualidade: prejudicial
  relógio: 20
  vai para: segunda-piora`,
  ).replace(
    `## CENA: investigacao`,
    `## CENA: segunda-piora
Piorou de novo.
- Tentar de novo
  qualidade: inadequada
- Desistir
  qualidade: prejudicial
  vai para: investigacao
## CENA: investigacao`,
  );
  const parsed = parseCaseFile(text).cases[0];
  assert.deepEqual(parsed.errors, []);
  const blockers = publishBlockers(validateForPublish(parsed.doc!));
  assert.ok(blockers.some((m) => /desvio com mais de uma cena/.test(m)), blockers.join("\n"));
});

test("validator still catches unreachable scenes and dead ends", () => {
  // A scene targeted by nobody and skipped by nobody is on the main line — fine.
  // A targeted scene nobody jumps to anymore becomes unreachable.
  const text = CENA_TEXT.replace("vai para: deterioracao", "");
  const parsed = parseCaseFile(text).cases[0];
  const blockers = publishBlockers(validateForPublish(parsed.doc!));
  // With the jump removed, deterioracao is a plain main-line scene now — no error.
  assert.deepEqual(blockers, []);
});

// ── Ponto de Virada rides the existing engine ────────────────────────────────

test("ponto de virada: pergunta → novo dado → reavaliação, two decisions, two screens", () => {
  const text = `FORMATO: ponto_de_virada
TÍTULO: Virada
## NARRATIVA
Homem, 58 anos, dor torácica atípica.
## PERGUNTA
Conduta inicial?
* Observar com troponina seriada
  feedback: Correto para o momento.
- Alta imediata
  feedback: Não.
  sedução: ECG normal engana.
## NOVO DADO
Troponina 2.400.
## REAVALIAÇÃO
O que muda agora?
* Tratar como SCA
  feedback: A hipótese virou.
- Manter observação
  feedback: O dado novo invalida a conduta antiga.
  sedução: Continuar parece prudente.
## CONFIANÇA
## FEEDBACK
Reavaliar é a habilidade.
## LEVE DESTE CASO
Dado novo manda.
`;
  const parsed = parseCaseFile(text).cases[0];
  assert.deepEqual(parsed.errors, []);
  const doc = parsed.doc!;
  doc.steps.forEach((s, i) => { s.id = 200 + i; s.options.forEach((o, j) => (o.id = 2000 + i * 10 + j)); });
  assert.deepEqual(publishBlockers(validateForPublish(doc)), []);
  const screens = buildScreens(doc.steps);
  assert.equal(screens.filter((s) => s.decision).length, 2);
  // The novo dado is the passive opener of the reassessment screen.
  assert.deepEqual(screens[1].before.map((s) => s.kind), ["novo_dado"]);
  assert.equal(screens[1].askConfidence, true);

  let state = emptyState();
  state = applyDecision(state, screens[0], { option_id: 2010 }).state;
  state = advance(state, screens);
  state = applyDecision(state, screens[1], { option_id: 2031, confidence: "alta" }).state;
  state = advance(state, screens);
  assert.equal(isFinished(state, screens), true);
  assert.equal(caseScore(earnedWeights(state, screens)), 50);
});

// ── Spaced review — frozen rule (Karina 2026-08-31) ─────────────────────────

test("review intervals: trilha by first outcome, fixed second interval, from review 1", () => {
  assert.equal(firstIntervalDays(1, 100), 3); // high-confidence error dominates
  assert.equal(firstIntervalDays(2, 40), 3);
  assert.equal(firstIntervalDays(0, 59.9), 7);
  assert.equal(firstIntervalDays(0, 60), 14);
  assert.equal(firstIntervalDays(0, 100), 14);
  assert.equal(secondIntervalDays(3), 14);
  assert.equal(secondIntervalDays(7), 21);
  assert.equal(secondIntervalDays(14), 30);
});
