import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExplanation, toFunnelFields } from "@/lib/simulado/mirror";

// The mirror's whole job is to invert the transform scripts/import-simulado-100.js
// applies when it writes the member copy. These helpers reproduce that transform
// verbatim, so a change to the importer that this file stops matching is exactly
// the regression worth catching: it would mean edits silently stop reaching
// /simulado-revalida.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildExplanation(r: {
  comentario: string;
  distratores: string;
  conceito_chave: string;
}): string {
  return (
    `<p><strong>Comentário.</strong> ${esc(r.comentario)}</p>` +
    `<p><strong>Por que as outras estão erradas.</strong> ${esc(r.distratores)}</p>` +
    `<p><strong>Conceito-chave:</strong> ${esc(r.conceito_chave)}</p>`
  );
}

function buildMemberRow(r: {
  enunciado: string;
  alternatives: string[];
  correct_index: number;
  comentario: string;
  distratores: string;
  conceito_chave: string;
}) {
  return {
    question: `<p>${esc(r.enunciado)}</p>`,
    answers: r.alternatives.map((text, i) => ({
      text,
      correct: i === r.correct_index,
      feedback: "",
    })),
    explanation_html: buildExplanation(r),
  };
}

const SAMPLE = {
  enunciado: "Paciente com PA 168/104 mmHg em duas medidas. Qual a conduta?",
  alternatives: [
    "Iniciar IECA em monoterapia.",
    "Iniciar combinação de duas classes.",
    "Iniciar betabloqueador.",
    "Repetir a medida em 30 dias.",
  ],
  correct_index: 1,
  comentario: "As medidas repetidas confirmam hipertensão em faixa elevada.",
  distratores: "A: monoterapia é insuficiente; C: betabloqueador não é inicial; D: já documentado.",
  conceito_chave: "Estágio 2 e alto risco favorecem início com duas classes.",
};

test("round-trips a member row back into the funnel columns", () => {
  const out = toFunnelFields(buildMemberRow(SAMPLE));
  assert.deepEqual(out, SAMPLE);
});

test("decodes the entities the importer and the sanitizer introduce", () => {
  // `<` `>` and `&` survive esc() as entities, and the funnel renders its columns
  // as plain text in JSX — a literal "&lt;" there would be visible to the lead.
  const source = {
    ...SAMPLE,
    comentario: "Na cetoacidose com K < 3,0 mEq/L, adiar insulina.",
    conceito_chave: "pH < 7,20 & PaCO₂ > 60 mmHg indicam falha.",
  };
  const out = toFunnelFields(buildMemberRow(source));
  assert.equal(out?.comentario, "Na cetoacidose com K < 3,0 mEq/L, adiar insulina.");
  assert.equal(out?.conceito_chave, "pH < 7,20 & PaCO₂ > 60 mmHg indicam falha.");
});

test("keeps the enunciado's line breaks, which render with whitespace-pre-line", () => {
  const row = {
    question: "<p>Caso clínico:<br>PA 168/104 mmHg.</p><p>Qual a conduta?</p>",
    answers: SAMPLE.alternatives.map((text, i) => ({
      text,
      correct: i === 1,
      feedback: "",
    })),
    explanation_html: buildExplanation(SAMPLE),
  };
  assert.equal(
    toFunnelFields(row)?.enunciado,
    "Caso clínico:\nPA 168/104 mmHg.\nQual a conduta?",
  );
});

test("tolerates markup an admin edit reflows around the labels", () => {
  const parsed = parseExplanation(
    "<p><b>Comentário:</b>&nbsp;Primeiro trecho.</p>" +
      "<div><em>Por que as outras estão erradas.</em> Segundo trecho.</div>" +
      "<p>Conceito-chave: Terceiro trecho.</p>",
  );
  assert.deepEqual(parsed, {
    comentario: "Primeiro trecho.",
    distratores: "Segundo trecho.",
    conceito_chave: "Terceiro trecho.",
  });
});

test("refuses to write a row it cannot fully reconstruct", () => {
  const base = buildMemberRow(SAMPLE);

  // An explanation rewritten without the three labels: mirroring a guess would
  // put the wrong prose under the wrong heading on the result page.
  assert.equal(parseExplanation("<p>Só um comentário solto.</p>"), null);
  assert.equal(toFunnelFields({ ...base, explanation_html: "<p>Solto.</p>" }), null);
  assert.equal(toFunnelFields({ ...base, explanation_html: null }), null);

  // Labels out of order — the slices would cross.
  assert.equal(
    parseExplanation(
      "<p><strong>Conceito-chave:</strong> A.</p>" +
        "<p><strong>Comentário.</strong> B.</p>" +
        "<p><strong>Por que as outras estão erradas.</strong> C.</p>",
    ),
    null,
  );

  // The funnel grades from correct_index over exactly four alternatives.
  assert.equal(toFunnelFields({ ...base, answers: base.answers.slice(0, 3) }), null);
  assert.equal(
    toFunnelFields({
      ...base,
      answers: base.answers.map((a) => ({ ...a, correct: false })),
    }),
    null,
  );
  assert.equal(
    toFunnelFields({
      ...base,
      answers: base.answers.map((a, i) => (i === 2 ? { ...a, text: "  " } : a)),
    }),
    null,
  );
  assert.equal(toFunnelFields({ ...base, question: "<p></p>" }), null);
});
