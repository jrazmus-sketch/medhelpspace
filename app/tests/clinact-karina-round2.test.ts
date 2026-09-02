import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCaseFile } from "@/lib/clinact/parse";
import { buildScreens, applyDecision, advance, emptyState, stepKey } from "@/lib/clinact/engine";
import type { CaseDoc } from "@/lib/clinact/types";

// Regressions from Karina's step-2 test round (2026-09-02).

const DOCS = path.resolve(import.meta.dirname, "..", "..", "docs", "clinact");

function blankTemplate(file: string): string {
  const md = readFileSync(path.join(DOCS, file), "utf8");
  // The first fenced block after "Modelo para copiar" is the blank template.
  const i = md.indexOf("## Modelo para copiar");
  const open = md.indexOf("```", i);
  const close = md.indexOf("```", open + 3);
  return md.slice(open + 3, close).replace(/^\n/, "");
}

// ── 1. The blank templates must teach the syntax the importer accepts ───────
// She followed the Código Clínico template literally and every clue came back
// "Pista sem texto", because the template put `-` alone with `detalhe:` below.

test("every blank template puts the text on the marker line, not below it", () => {
  for (const file of [
    "modelo-codigo-clinico.md",
    "modelo-decisao-30s.md",
    "modelo-ponto-de-virada.md",
    "modelo-clinica-em-cena.md",
  ]) {
    const tpl = blankTemplate(file);
    const bare = tpl.split("\n").filter((l) => l.trim() === "-" || l.trim() === "*");
    assert.deepEqual(bare, [], `${file} still has a bare marker line`);
  }
});

test("the Código Clínico template's clues parse as clues with text", () => {
  const tpl = blankTemplate("modelo-codigo-clinico.md")
    .replace("TÍTULO:", "TÍTULO: T")
    .replace("ESPECIALIDADE:", "ESPECIALIDADE: Pneumologia");
  const c = parseCaseFile(tpl).cases[0];
  // The placeholders are still in place, so it must NOT import silently...
  assert.ok(c.errors.some((e) => /texto de exemplo do modelo/.test(e.message)));
  // ...but never with the old "Pista sem texto" cause.
  assert.ok(!c.errors.some((e) => /^Pista sem texto/.test(e.message)));
});

test("an unreplaced placeholder is a loud error, in clues and alternatives", () => {
  const text = `FORMATO: codigo_clinico
TÍTULO: Placeholder
CHAVE FINAL: X
## NARRATIVA
N
## PISTAS
- [pista]
  grupo: A
## PERGUNTA
Qual?
* [alternativa correta]
  feedback: f
- Alternativa de verdade
  feedback: f
## LEVE DESTE CASO
L
`;
  const c = parseCaseFile(text).cases[0];
  assert.ok(c.errors.some((e) => /Pista ainda está com o texto de exemplo/.test(e.message)));
  assert.ok(c.errors.some((e) => /Alternativa 1 ainda está com o texto de exemplo/.test(e.message)));
  assert.equal(c.doc, null);
});

test("a clue with text on the marker line and detalhe below still works", () => {
  const text = `FORMATO: codigo_clinico
TÍTULO: Pistas ok
CHAVE FINAL: TEP
## NARRATIVA
N
## PISTAS
- Dor pleurítica à direita
  detalhe: Começou após um voo longo.
  categoria: anamnese
  grupo: A
## PERGUNTA
Qual?
* Angio-TC
  feedback: f
- Hemocultura
  feedback: f
## LEVE DESTE CASO
L
`;
  const c = parseCaseFile(text).cases[0];
  assert.deepEqual(c.errors, []);
  assert.equal(c.doc!.clues[0].label, "Dor pleurítica à direita");
  assert.equal(c.doc!.clues[0].detail, "Começou após um voo longo.");
});

// ── 2. The decision counter must track the PATH, not the answer count ───────
// "Decisão 2 de 2" appeared while the first decision's feedback was still up.

/** Mirrors the header's ordinal computation in case-player.tsx. */
function ordinalFor(state: { answered: Record<string, unknown> }, screen: { decision: { id?: number; position: number } | null }, total: number) {
  const key = screen.decision ? String(screen.decision.id ?? screen.decision.position) : null;
  const answeredCount = Object.keys(state.answered).length;
  const currentAnswered = key ? !!state.answered[key] : false;
  return Math.min(answeredCount + (currentAnswered ? 0 : 1), total);
}

test("the ordinal stays on the decision being read, before and after answering", () => {
  const text = `FORMATO: ponto_de_virada
TÍTULO: Virada
## NARRATIVA
N
## PERGUNTA
P1?
* A
  feedback: f
- B
  feedback: f
## NOVO DADO
Troponina 2.400.
## REAVALIAÇÃO
P2?
* C
  feedback: f
- D
  feedback: f
## LEVE DESTE CASO
L
`;
  const doc = parseCaseFile(text).cases[0].doc as CaseDoc;
  doc.steps.forEach((s, i) => { s.id = 300 + i; s.options.forEach((o, j) => (o.id = 3000 + i * 10 + j)); });
  const screens = buildScreens(doc.steps);
  const total = screens.filter((s) => s.decision).length;
  assert.equal(total, 2);

  let state = emptyState();
  // On decision 1, unanswered.
  assert.equal(ordinalFor(state, screens[0], total), 1);
  // Answered — still reading decision 1's feedback. This is the bug she saw.
  state = applyDecision(state, screens[0], { option_id: screens[0].decision!.options[0].id! }).state;
  assert.equal(ordinalFor(state, screens[0], total), 1);
  // Only after moving on does it become 2.
  state = advance(state, screens);
  assert.equal(ordinalFor(state, screens[1], total), 2);
  state = applyDecision(state, screens[1], { option_id: screens[1].decision!.options[0].id! }).state;
  assert.equal(ordinalFor(state, screens[1], total), 2);
});

// ── 3. A stale attempt must never be resumed after the case is edited ───────
// Saving a case replaces its steps, so old answers point at ids that are gone.
// Resuming produced a pre-filled Prontuário Vivo, a doubled clock and an
// ordinal that started at 2.

/** Mirrors the staleness test in player-load.ts. */
function isStale(doc: CaseDoc, state: { answered: Record<string, unknown> }) {
  const live = new Set(doc.steps.map((s) => String(s.id)));
  const keys = Object.keys(state.answered ?? {});
  return keys.length > 0 && keys.some((k) => !live.has(k));
}

test("an attempt answered against replaced steps is detected as stale", () => {
  const text = `FORMATO: clinica_em_cena
TÍTULO: Cena
## NARRATIVA
N
## CENA: chegada
C
- Ideal
  qualidade: ideal
  fizemos: O2
  estado: PA 92/60
  relógio: 5
- Desviar
  qualidade: prejudicial
  relógio: 10
  vai para: piora
## CENA: piora
P
- Voltar
  qualidade: aceitavel
  relógio: 10
- Insistir
  qualidade: prejudicial
  relógio: 20
## CENA: fim
F
- Tratar
  qualidade: ideal
- Observar
  qualidade: inadequada
## LEVE DESTE CASO
L
`;
  const before = parseCaseFile(text).cases[0].doc as CaseDoc;
  before.steps.forEach((s, i) => { s.id = 400 + i; s.options.forEach((o, j) => (o.id = 4000 + i * 10 + j)); });
  const screens = buildScreens(before.steps);

  // A run against the OLD ids: chose the ideal conduct (clock 5, reveals set).
  let state = emptyState();
  state = applyDecision(state, screens[0], { option_id: screens[0].decision!.options[0].id! }).state;
  assert.equal(state.relogio, 5);
  assert.equal(state.revealed.length > 0, true);
  assert.equal(isStale(before, state), false); // same content → resumable

  // The admin saves the case: every step row is replaced, so ids change.
  const after = parseCaseFile(text).cases[0].doc as CaseDoc;
  after.steps.forEach((s, i) => { s.id = 900 + i; s.options.forEach((o, j) => (o.id = 9000 + i * 10 + j)); });
  assert.equal(isStale(after, state), true);

  // A fresh attempt is empty: no pre-filled chart, clock at zero.
  const fresh = emptyState();
  assert.equal(fresh.relogio, 0);
  assert.deepEqual(fresh.revealed, []);
  assert.equal(isStale(after, fresh), false); // nothing answered → nothing to lose
});

test("the detour route's clock counts only the conducts actually chosen", () => {
  const text = `FORMATO: clinica_em_cena
TÍTULO: Relógio
## NARRATIVA
N
## CENA: chegada
C
- Ideal
  qualidade: ideal
  estado: PA 92/60
  relógio: 5
- Nebulização
  qualidade: inadequada
  relógio: 10
  vai para: resposta
## CENA: resposta
R
- Voltar
  qualidade: aceitavel
  relógio: 10
- Insistir
  qualidade: prejudicial
  relógio: 20
## CENA: fim
F
- Tratar
  qualidade: ideal
- Observar
  qualidade: inadequada
## LEVE DESTE CASO
L
`;
  const doc = parseCaseFile(text).cases[0].doc as CaseDoc;
  doc.steps.forEach((s, i) => { s.id = 500 + i; s.options.forEach((o, j) => (o.id = 5000 + i * 10 + j)); });
  const screens = buildScreens(doc.steps);

  let state = emptyState();
  // Choose the DETOUR conduct (10 min), never the ideal one (5 min).
  const detour = screens[0].decision!.options[1];
  state = applyDecision(state, screens[0], { option_id: detour.id! }).state;
  assert.equal(state.relogio, 10, "only the chosen conduct's clock");
  // Nothing from the unchosen ideal conduct leaked in.
  assert.equal(state.estado.descricao, undefined);
  state = advance(state, screens);
  assert.equal(screens[state.cursor].decision!.scene_key, "resposta");
  state = applyDecision(state, screens[state.cursor], { option_id: screens[1].decision!.options[0].id! }).state;
  assert.equal(state.relogio, 20, "10 + 10, never 5 + 10 + 10");
  // The chart holds one entry per chosen conduct — no duplicates.
  assert.equal(state.revealed.length, Object.keys(state.answered).length === 2 ? state.revealed.length : -1);
  assert.equal(Object.keys(state.answered).length, 2);
  assert.equal(stepKey(screens[0].decision!) in state.answered, true);
});
