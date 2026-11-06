import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sixtyDayNoticeLines, turmaPeriod } from "@/lib/cohort-timing";

// Revalida sales page, MedHelp 60D notice (Karina 2026-11-06): one line per turma on
// sale, "…antes da prova de 2027.1" / "…de 2027.2", in the BLACK FRIDAY lilac.

const NOW = new Date("2026-11-06T15:00:00Z");
const unconfirmed = (name: string, testDate: string) => ({
  name,
  testDate,
  unlock60dDate: testDate,
  dateConfirmed: false,
});

test("one line per turma, her exact wording, no exam month", () => {
  const lines = sixtyDayNoticeLines(
    [unconfirmed("Revalida 2027.1", "2027-05-30"), unconfirmed("Revalida 2027.2", "2027-09-12")],
    NOW,
  );
  assert.deepEqual(
    lines.map((l) => l.text),
    [
      "MedHelp 60D — liberado 60 dias antes da prova de 2027.1",
      "MedHelp 60D — liberado 60 dias antes da prova de 2027.2",
    ],
  );
  for (const l of lines) {
    assert.doesNotMatch(l.text, /maio|setembro|\/0?5\/|\/0?9\//i);
    assert.equal(l.unlocked, false);
  }
});

test("a confirmed date keeps that turma's live countdown, tagged with its period", () => {
  const [line] = sixtyDayNoticeLines(
    [{ name: "Revalida 2027.1", testDate: "2027-05-30", unlock60dDate: "2027-03-31", dateConfirmed: true }],
    NOW,
  );
  assert.equal(line.text, "MedHelp 60D abre em 31/03 · turma 2027.1");
});

test("turmaPeriod falls back to the full name", () => {
  assert.equal(turmaPeriod("Revalida 2027.2"), "2027.2");
  assert.equal(turmaPeriod("Turma especial"), "Turma especial");
});

test("the notice text uses the BLACK FRIDAY lilac token, not the dark brand purple", () => {
  const src = readFileSync(path.join(process.cwd(), "src/components/landing/pricing-cta.tsx"), "utf8");
  const block = src.slice(src.indexOf("{sixtyDay && ("), src.indexOf("{/* Feature list */}"));
  assert.match(block, /color: "var\(--brand-text\)"/);
  assert.doesNotMatch(block, /color: "var\(--brand\)"/);
});

test("the price box shows ONLY the selected turma's line, never both", () => {
  const src = readFileSync(path.join(process.cwd(), "src/components/landing/pricing-cta.tsx"), "utf8");
  assert.match(src, /sixtyDayNoticeLines\(\[cohort\]\)\[0\]/);
  assert.doesNotMatch(src, /sixtyDayNoticeLines\(cohorts\)/);
  const block = src.slice(src.indexOf("{sixtyDay && ("), src.indexOf("{/* Feature list */}"));
  assert.doesNotMatch(block, /\.map\(/);
});
