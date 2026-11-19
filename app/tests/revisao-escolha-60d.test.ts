/**
 * Revisão by the student's choice for the MedHelp 60D materials (Karina 2026-11-19, 13h27 EST):
 *   - Fórmula MedHelp: ONE "Quero revisar" box between "Concluir leitura" and "Próximo tópico"; concluding and
 *     choosing are independent; re-reads on the MemoreCards ladder (3 → 7 → 14 → 30, never after the exam);
 *   - Simulados 100Q: no answer enters the Revisão by itself; only a WRONG question the student ticks;
 *   - MemoreCards unchanged (automatic);
 *   - removing ("Quero revisar" unticked or "Já domino isto") suspends — history kept, no duplicate on re-ticking;
 *   - her texts verbatim (60D tip, Meu Plano tip), the same in code and in the patch that seeds the live copy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isSimulado100Page, QUERO_REVISAR, FORMULA_REVISAR_APOIO } from "@/lib/review/revisao-escolha";
import { memorecardRereadDue, MEMORECARD_REREAD_INTERVALS } from "@/lib/review/memorecard-reread";
import { TIPS } from "@/lib/onboarding/tips";

const src = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");
const root = (f: string) => readFileSync(path.join(process.cwd(), "..", f), "utf8");

test("a Simulado 100Q page is a simulado inside the 60D module — never a regular mini simulado", () => {
  assert.equal(isSimulado100Page({ view: "simulados", content_module_id: 1 }), true);
  assert.equal(isSimulado100Page({ view: "simulados", content_module_id: null }), false);
  assert.equal(isSimulado100Page({ view: "formula", content_module_id: 1 }), false);
  assert.equal(isSimulado100Page(null), false);
});

test("her words for the box", () => {
  assert.equal(QUERO_REVISAR, "Quero revisar");
  assert.equal(FORMULA_REVISAR_APOIO, "Inclua este conteúdo na revisão espaçada. Você pode desmarcar quando quiser.");
});

test("Fórmula re-reads use the MemoreCards ladder and never land after the exam", () => {
  assert.deepEqual([...MEMORECARD_REREAD_INTERVALS], [3, 7, 14, 30]);
  assert.deepEqual(memorecardRereadDue(0, "2027-03-01", "2027-04-25"), { interval: 3, due: "2027-03-04" });
  assert.deepEqual(memorecardRereadDue(1, "2027-03-04", "2027-04-25"), { interval: 7, due: "2027-03-11" });
  // 30 days from 10/04 would pass the exam (25/04) → the day before it.
  assert.deepEqual(memorecardRereadDue(3, "2027-04-10", "2027-04-25"), { interval: 14, due: "2027-04-24" });
});

test("a Simulado 100Q answer never enrols the question; every other answer still does", () => {
  const route = src("app", "api", "quiz-attempt", "route.ts");
  assert.match(route, /if \(!isSimulado100Page\(\(own as any\)\?\.page\)\) \{\s+await gradeReviewItem\("quiz_question"/);
  // Decided by the question's OWN page, never the page id the client sends.
  assert.match(route, /\.from\("quiz_questions"\)\s+\.select\("page:pages\(view, content_module_id\)"\)\s+\.eq\("id", questionId\)/);
});

test("the choice actions: only a wrong 100Q question; no duplicate; unticking suspends, never deletes", () => {
  const a = src("actions", "review.ts");
  const q = a.slice(a.indexOf("export async function setSimuladoQuestionReviewChoice"), a.indexOf("export async function setFormulaReviewChoice"));
  assert.match(q, /isSimulado100Page/);
  assert.match(q, /if \(!last \|\| last\.is_correct !== false\) return \{ ok: false, reason: "not_wrong" \}/);
  assert.match(q, /if \(current && !current\.suspended\) return \{ ok: true, chosen: true \}/);
  assert.match(q, /\.update\(\{ suspended: true \}\)/);
  assert.doesNotMatch(q, /\.delete\(/);
  const f = a.slice(a.indexOf("export async function setFormulaReviewChoice"), a.indexOf("export async function completeFormulaReread"));
  assert.match(f, /page\.view !== "formula"/);
  assert.match(f, /if \(current && !current\.suspended\) return \{ ok: true, chosen: true \}/);
  assert.match(f, /\.update\(\{ suspended: true \}\)/);
  assert.doesNotMatch(f, /\.delete\(/);
  // A re-read before its date changes nothing; a suspended page is never re-read into the queue.
  const r = a.slice(a.indexOf("export async function completeFormulaReread"));
  assert.match(r, /current\.suspended \|\| toDateKeyBR\(current\.due_date as string\) > today\) return/);
});

test("Fórmula footer: Concluir leitura → Quero revisar → Próximo tópico, and concluding never enrols", () => {
  const footer = src("components", "content", "page-complete-footer.tsx");
  const iConcluir = footer.search(/ {10}Concluir leitura\r?\n/);
  const iBox = footer.indexOf("<ReviewChoiceBox");
  const iNext = footer.indexOf("Próximo tópico{");
  assert.ok(iConcluir > 0 && iBox > iConcluir && iNext > iBox, "order on the page");
  const mark = footer.slice(footer.indexOf("function markComplete"), footer.indexOf("return (", footer.indexOf("function markComplete")));
  assert.doesNotMatch(mark, /setFormulaReviewChoice|ReviewChoice/);
  // The box is offered on Fórmula pages only.
  assert.match(src("components", "content", "plain-content-renderer.tsx"), /view === "formula" \? \{ chosen: false, rereadDue: false \} : null/);
  // The 60D checklist never enrols either.
  assert.doesNotMatch(src("actions", "medhelp60.ts"), /review_schedule|setFormulaReviewChoice/);
});

test("Simulados 100Q: the box appears on WRONG questions (or one already chosen) in the correction and the result", () => {
  const player = src("components", "content", "quiz-player.tsx");
  assert.match(player, /choosing && \(results\[q\.id\] === false \|\| chosen\.has\(q\.id\)\)/);
  assert.match(player, /choosing && answered && selectedAnswer && \(\(!selectedAnswer\.correct && attemptId\) \|\| chosen\.has\(question\.id\)\)/);
  // The box is wired only for a Simulado 100Q page (not a topic view, not a mini simulado).
  const renderer = src("components", "content", "quiz-renderer.tsx");
  assert.match(renderer, /const isSimulado100 = !topicView && isSimulado100Page\(page\)/);
  assert.match(renderer, /reviewChoice=\{chosenForReview \? \{ chosen: chosenForReview \} : null\}/);
});

test("MemoreCards stay automatic (unchanged)", () => {
  assert.match(src("components", "content", "memorecards-viewer.tsx"), /enrollMemorecardReread\(/);
});

test("her 60D tip text, verbatim, in code and in the patch that seeds the live copy", () => {
  const tip = TIPS["medhelp-60d"].section!;
  assert.equal(tip.title, "Escolha o que deseja revisar");
  const expected = [
    "Ao terminar uma página do Fórmula MedHelp, marque “Quero revisar” se desejar retomá-la pela revisão espaçada. Nos Simulados 100Q, você pode selecionar individualmente as questões que errou.",
    "Os conteúdos selecionados ficam disponíveis pelo menu Revisão. Você pode desmarcar sua escolha a qualquer momento, sem perder seu histórico ou progresso no cronograma.",
    "Os MemoreCards continuam sendo incluídos automaticamente após a conclusão de cada tema. Durante o MedHelp 60D, essas revisões são opcionais e não são acrescentadas à programação diária do Meu Plano.",
  ].join("\n\n");
  assert.equal(tip.body, expected);
  const patch = root("schema-patch-revisao-escolha-60d.sql");
  assert.ok(patch.includes(`E'${expected.replace(/\n/g, "\\n")}'`), "patch body = code body");
  assert.ok(patch.includes(`'${TIPS.plano.body}'`), "patch plano tip = code tip");
  assert.match(TIPS.plano.body, /estima o que cabe do curso regular até a abertura do MedHelp 60D/);
  assert.doesNotMatch(TIPS.plano.body, /estima o que cabe até a prova/);
});

test("the patch moves the automatic 100Q rows out of the queue with a backup, never deleting them", () => {
  const patch = root("schema-patch-revisao-escolha-60d.sql");
  assert.match(patch, /INSERT INTO review_schedule_bk_100q_20261119/);
  assert.match(patch, /SET suspended = true/);
  assert.doesNotMatch(patch.replace(/--.*$/gm, ""), /DELETE FROM review_schedule\b/);
  assert.match(patch, /'flashcard', 'quiz_question', 'memorecard', 'clinact_case', 'formula'/);
});
