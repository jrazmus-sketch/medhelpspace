/**
 * Karina, 2026-09-23 — two Revisão fixes:
 *  1. a missed question links to the topic's Resumo (her choice), else its Revalida
 *     Up page — never back to more questions, and never says "aula";
 *  2. MemoreCards re-reads fit MedHelp 60D: 3 → 7 → 14 → 30 days, never after the exam.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resumoSlugFor, revalidaUpSlugFor, REMEDIATION_LABELS } from "@/lib/review/remediation";
import { memorecardRereadDue, MEMORECARD_REREAD_INTERVALS } from "@/lib/review/memorecard-reread";

const SRC = join(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("the fallback maps a Questões slug to its Revalida Up slug", () => {
  assert.equal(revalidaUpSlugFor("pancreatite"), "pancreatite-revalida-up");
  assert.equal(revalidaUpSlugFor("abscesso-pulmonar-simulados"), "abscesso-pulmonar-revalida-up");
  assert.equal(revalidaUpSlugFor("manejo-inicial-x-quiz"), "manejo-inicial-x-revalida-up");
});

test("the Resumo is the first destination; its slug follows the topic", () => {
  assert.equal(resumoSlugFor("pancreatite"), "pancreatite-resumos");
  assert.equal(resumoSlugFor("abscesso-pulmonar-simulados"), "abscesso-pulmonar-resumos");
  const q = read("lib/review/queries.ts");
  const fn = q.slice(q.indexOf("async function remediationFor("));
  assert.ok(fn.indexOf("REMEDIATION_LABELS.resumo") < fn.indexOf("REMEDIATION_LABELS.revalidaUp"),
    "Resumo must be tried before Revalida Up");
});

test("the platform never tells a student to review an 'aula'", () => {
  assert.equal(REMEDIATION_LABELS.resumo, "Revisar o resumo do tema");
  assert.equal(REMEDIATION_LABELS.revalidaUp, "Revisar o tema no Revalida Up");
  assert.doesNotMatch(read("components/content/review-session.tsx"), /Revisar a aula/);
});

test("the remediation link is never the question page itself", () => {
  const q = read("lib/review/queries.ts");
  assert.doesNotMatch(q, /hrefByPage\.set\(p\.id as number, ss \? `\/app\/\$\{ss\}\/\$\{p\.slug\}`/);
  assert.match(q, /\.eq\("view", "revalida-up"\)/);
});

test("MemoreCards re-read steps are 3, 7, 14, 30 — four re-reads inside 60 days", () => {
  assert.deepEqual([...MEMORECARD_REREAD_INTERVALS], [3, 7, 14, 30]);
  const total = MEMORECARD_REREAD_INTERVALS.reduce((a, b) => a + b, 0);
  assert.ok(total < 60, `the four re-reads land by day ${total}`);
});

test("each reading takes the next step; after the fourth it stays at 30", () => {
  const today = "2026-09-23";
  assert.deepEqual(memorecardRereadDue(0, today, null), { interval: 3, due: "2026-09-26" });
  assert.deepEqual(memorecardRereadDue(1, today, null), { interval: 7, due: "2026-09-30" });
  assert.deepEqual(memorecardRereadDue(3, today, null), { interval: 30, due: "2026-10-23" });
  assert.deepEqual(memorecardRereadDue(9, today, null), { interval: 30, due: "2026-10-23" });
});

test("a re-read never lands on or after the exam — it moves to the day before", () => {
  // exam in 10 days, step would be 14 → the day before the exam
  assert.deepEqual(memorecardRereadDue(2, "2026-09-23", "2026-10-03"), { interval: 9, due: "2026-10-02" });
  // step fits before the exam → unchanged
  assert.deepEqual(memorecardRereadDue(0, "2026-09-23", "2026-10-03"), { interval: 3, due: "2026-09-26" });
});

test("with the exam tomorrow or past, the plain step is kept", () => {
  assert.deepEqual(memorecardRereadDue(0, "2026-09-23", "2026-09-24"), { interval: 3, due: "2026-09-26" });
  assert.deepEqual(memorecardRereadDue(0, "2026-09-23", "2026-09-01"), { interval: 3, due: "2026-09-26" });
});

test("the onboarding tip quotes the new cadence", () => {
  assert.match(read("lib/onboarding/tips.ts"), /em 3, 7, 14 e 30 dias/);
  assert.doesNotMatch(read("lib/onboarding/tips.ts"), /7, 21, 60 e 120/);
});
