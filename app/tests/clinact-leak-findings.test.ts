import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCaseFile } from "@/lib/clinact/parse";
import { validateForPublish, findingsIn } from "@/lib/clinact/validate";

// Karina 2026-10-22 ("Falsos alertas de vazamento de resultados no CEC-19"):
// compare whole findings — value, unit, context — not bare digits; a later
// action that explicitly obtains the data may show it; real leaks stay caught.

/** A Clínica em Cena case: arrival scene → INVESTIGAÇÃO (results) → a later scene. */
function caseWith({ result, later, laterConduct = "Manter o plano", laterReveal = "" }: { result: string; later: string; laterConduct?: string; laterReveal?: string }) {
  const text = `FORMATO: clinica_em_cena
TÍTULO: Teste de vazamento
ESPECIALIDADE: Neurologia

## CENA: chegada
Paciente com doença de Parkinson em acompanhamento ambulatorial.

- Conversar sobre a rotina
  qualidade: ideal
  feedback: f
- Encerrar a consulta
  qualidade: inadequada
  feedback: f

## INVESTIGAÇÃO
O que você deseja avaliar?

- Avaliação clínica dirigida
  qualidade: ideal
  feedback: Ajuda a decidir o ajuste com segurança.
  encontramos: ${result}
- Exame de imagem
  qualidade: inadequada
  feedback: Não muda a conduta agora.
  encontramos: Sem alterações.

## CENA: retorno
${later}

- ${laterConduct}
  qualidade: ideal
  feedback: f${laterReveal ? `\n  encontramos: ${laterReveal}` : ""}
- Suspender a medicação
  qualidade: inadequada
  feedback: f

## LEVE DESTE CASO
Ajuste com segurança.
`;
  const c = parseCaseFile(text).cases[0];
  assert.deepEqual(c.errors, [], JSON.stringify(c.errors));
  return c.doc!;
}
const leaks = (doc: ReturnType<typeof caseWith>) =>
  validateForPublish(doc).filter((x) => !x.ok && /só existe no resultado/.test(x.message)).map((x) => x.message);

test("findings keep value + unit, and compound values stay whole", () => {
  const keys = (t: string) => findingsIn(t).map((f) => f.key);
  assert.deepEqual(keys("no mesmo esquema há 14 meses"), ["14 meses"]);
  assert.deepEqual(keys("às 06h, 10h, 14h e 18h"), ["06 h", "10 h", "14 h", "18 h"]);
  assert.deepEqual(keys("em pé, 128/76 mmHg"), ["128/76 mmhg"]);
  assert.deepEqual(keys("FC 76 bpm, Hb 9,2 g/dL, lactato 4,5"), ["76 bpm", "9,2 g/dl", "4,5"]);
  assert.deepEqual(keys("3 dias"), [], "a lone single digit means nothing");
});

test("CEC-19: '14 meses' in a result is not the time '14h' later", () => {
  const doc = caseWith({
    result: "Usa levodopa/benserazida às 07h, 12h e 17h, no mesmo esquema há 14 meses.",
    later: "Combinam um comprimido às 06h, 10h, 14h e 18h.",
  });
  assert.deepEqual(leaks(doc), []);
});

test("CEC-19: the '76' of an initial pressure is not a new reading at the return visit", () => {
  const doc = caseWith({
    result: "Após cinco minutos deitado, a pressão é 132/78 mmHg; após três minutos em pé, 128/76 mmHg.",
    later: "No retorno, após cinco minutos deitado, a pressão é 130/76 mmHg; em pé, 126/74 mmHg.",
  });
  assert.deepEqual(leaks(doc), []);
});

test("a real leak is still caught: the same finding, with its unit, reappears later", () => {
  const doc = caseWith({
    result: "Hemoglobina de 9,2 g/dL.",
    later: "Com a hemoglobina de 9,2 g/dL, você decide o próximo passo.",
  });
  const l = leaks(doc);
  assert.equal(l.length, 1);
  assert.match(l[0], /"9,2 g\/dL" só existe no resultado de "Avaliação clínica dirigida"/);
});

test("a real leak is still caught for unitless values and compound pressures", () => {
  assert.equal(leaks(caseWith({ result: "Lactato 4,5.", later: "O lactato de 4,5 preocupa." })).length, 1);
  assert.equal(leaks(caseWith({ result: "Em pé, 128/76 mmHg.", later: "A ortostase de 128/76 mmHg não contraindica o ajuste." })).length, 1);
});

test("a later action that explicitly obtains the data may reveal it as its own result", () => {
  const doc = caseWith({
    result: "Em pé, 128/76 mmHg.",
    later: "Ele volta para reavaliação.",
    laterConduct: "Aferir novamente a pressão em ortostase",
    laterReveal: "Em pé, 128/76 mmHg, sem sintomas.",
  });
  assert.deepEqual(leaks(doc), []);
});

test("…but only its own result: the scene text or a feedback restating the value is still a leak", () => {
  const doc = caseWith({
    result: "Em pé, 128/76 mmHg.",
    later: "A pressão em pé era 128/76 mmHg.",
    laterConduct: "Aferir novamente a pressão em ortostase",
    laterReveal: "Em pé, 128/76 mmHg.",
  });
  assert.equal(leaks(doc).length, 1);
});
