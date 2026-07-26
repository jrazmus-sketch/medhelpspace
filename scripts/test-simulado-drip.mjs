#!/usr/bin/env node
// Committed checks for the simulado-100 follow-up sequence.
//
//   node scripts/test-simulado-drip.mjs
//
// No DB, no network, no test runner: the decision layer (lib/magnet/simulado-drip)
// and the phase engine (lib/cohort-timing) are pure, and both modules are
// import-only-types at runtime, so Node's built-in TypeScript stripping loads
// them directly (Node 22.18+ / 24).
//
// The section that matters most is the last one. KARINA'S RULE is absolute — a
// non-finisher may receive a bare progress count and nothing else, never a score,
// never per-área performance, never a comentário — and it is the kind of rule
// that a plausible-sounding copy edit quietly breaks six months from now. These
// checks walk every phase × depth combination the sequence can produce and assert
// no reachable template can leak a diagnosis.

import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const APP = path.join(import.meta.dirname, "..", "app", "src");
const load = (rel) => import(pathToFileURL(path.join(APP, rel)).href);

const {
  depthFor,
  planSimuladoSend,
  progressLineFor,
  urgencyLineFor,
  LADDER_OFFSET_DAYS,
  LAST_LADDER_STEP,
  MAX_NUDGES,
  MAX_SALES,
  MAX_VALOR,
} = await load("lib/magnet/simulado-drip.ts");
const { getExamPhase } = await load("lib/cohort-timing.ts");
const { EMAIL_TEMPLATE_DEFAULTS, interpolate } = await load("lib/email-render.ts");

const TOTALS = { total: 100, minAnswers: 50 };

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${err.message.split("\n")[0]}`);
  }
}

// Baseline: a verified, engaged, mid-preparation lead on a sellable turma.
function lead(over = {}) {
  return {
    dripStep: 0,
    elapsedDays: 1,
    answered: 30,
    submitted: false,
    verified: true,
    started: true,
    undecided: false,
    cohortForSale: true,
    phase: "preparacao",
    reminderStep: 0,
    salesStep: 0,
    ...over,
  };
}

// Walk the ladder for one lead profile, returning the kinds it would receive in
// order. `mutate` lets a scenario change the lead between rungs (e.g. submit).
function sequence(profile, { rungs = LAST_LADDER_STEP, mutate = null } = {}) {
  let state = lead(profile);
  const out = [];
  for (let i = 0; i < rungs; i++) {
    state = { ...state, elapsedDays: LADDER_OFFSET_DAYS[Math.min(i, LADDER_OFFSET_DAYS.length - 1)] };
    const plan = planSimuladoSend(state);
    if (plan.action === "hold") {
      out.push(`hold:${plan.reason}`);
      continue;
    }
    out.push(plan.kind);
    state = {
      ...state,
      dripStep: plan.step,
      reminderStep: plan.reminderStep ?? state.reminderStep,
      salesStep: plan.salesStep ?? state.salesStep,
    };
    if (mutate) state = mutate(state, i);
  }
  return out;
}

// ── Engagement depth ─────────────────────────────────────────────────────────

check("depth boundaries", () => {
  assert.equal(depthFor(0, false), "cold");
  assert.equal(depthFor(1, false), "bounced");
  assert.equal(depthFor(9, false), "bounced");
  assert.equal(depthFor(10, false), "engaged");
  assert.equal(depthFor(59, false), "engaged");
  assert.equal(depthFor(60, false), "deep");
  assert.equal(depthFor(100, false), "deep");
  // A finisher is deep whatever the count — they submitted, they saw everything.
  assert.equal(depthFor(50, true), "deep");
});

// ── The one performance sentence a non-finisher may receive ──────────────────

check("progressLine covers the three edge cases", () => {
  assert.match(progressLineFor(0, TOTALS), /ainda não respondeu nenhuma/);
  // Below the submit floor the nudge must name the threshold, not invite a
  // submission that will be refused.
  assert.match(progressLineFor(20, TOTALS), /faltam 30 para poder entregar/);
  assert.match(progressLineFor(68, TOTALS), /68 de 100/);
  assert.doesNotMatch(progressLineFor(68, TOTALS), /faltam/i);
  // All answered but never submitted: one tap from the payoff, and a bare
  // "faltam 0 questões" would read as broken.
  assert.match(progressLineFor(100, TOTALS), /todas as 100 questões — falta só entregar/);
});

check("progressLine never states a score", () => {
  for (let n = 0; n <= 100; n++) {
    const line = progressLineFor(n, TOTALS);
    assert.doesNotMatch(line, /\d+\s*\/\s*100/, `score-shaped output at answered=${n}: ${line}`);
    assert.doesNotMatch(line, /acert|err|nota|desempenho/i, `performance word at answered=${n}`);
  }
});

// ── Phase engine ─────────────────────────────────────────────────────────────

const NOW = new Date("2026-07-26T12:00:00Z");
const inDays = (n) => {
  const d = new Date("2026-07-26T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

check("phase boundaries match the design table", () => {
  const at = (n) => getExamPhase(inDays(n), { dateConfirmed: true }, NOW).phase;
  assert.equal(at(181), "distante");
  assert.equal(at(180), "preparacao");
  assert.equal(at(91), "preparacao");
  assert.equal(at(90), "reta-final");
  assert.equal(at(30), "reta-final");
  assert.equal(at(29), "vespera");
  assert.equal(at(0), "vespera");
  assert.equal(at(-1), "passada");
  assert.equal(getExamPhase(null, {}, NOW).phase, "indefinida");
});

check("an unconfirmed date drives cadence but is never quoted", () => {
  const t = getExamPhase(inDays(45), { dateConfirmed: false }, NOW);
  assert.equal(t.phase, "reta-final", "cadence still derives from the planning date");
  assert.equal(t.dateConfirmed, false);
  const line = urgencyLineFor({ ...t, cohortName: "Revalida 2027.1" });
  assert.doesNotMatch(line, /\d{2}\/\d{2}\/\d{4}/, "quoted a date the board has not announced");
  assert.doesNotMatch(line, /Faltam \d+ dias/, "quoted a countdown off an unannounced date");
});

check("urgencyLine is empty when there is nothing to say", () => {
  assert.equal(urgencyLineFor({ phase: "indefinida", daysUntilTest: null, examDateLabel: null, dateConfirmed: false, cohortName: null }), "");
  assert.equal(urgencyLineFor({ phase: "passada", daysUntilTest: -3, examDateLabel: "23/07/2026", dateConfirmed: true, cohortName: "X" }), "");
});

// ── Gates ────────────────────────────────────────────────────────────────────

check("an address that never clicked and never started gets nothing", () => {
  const plan = planSimuladoSend(lead({ verified: false, started: false, elapsedDays: 30 }));
  assert.equal(plan.action, "hold");
  assert.equal(plan.reason, "unverified_and_unstarted");
});

check("on-site activity alone is enough to engage", () => {
  const plan = planSimuladoSend(lead({ verified: false, started: true }));
  assert.equal(plan.action, "send");
});

check("a rung that is not due yet is not claimed", () => {
  const plan = planSimuladoSend(lead({ elapsedDays: 0 }));
  assert.equal(plan.action, "hold");
  assert.equal(plan.reason, "not_due");
});

check("the ladder ends", () => {
  const plan = planSimuladoSend(lead({ dripStep: LAST_LADDER_STEP, elapsedDays: 999 }));
  assert.equal(plan.action, "hold");
  assert.equal(plan.reason, "ladder_exhausted");
});

// ── One spine, different on-ramps ────────────────────────────────────────────

check("a finisher is never nudged to finish", () => {
  const seq = sequence({ submitted: true, answered: 100 });
  assert.ok(!seq.some((k) => k.startsWith("lead-sim-finish")), `nudged a finisher: ${seq}`);
  assert.deepEqual(seq.slice(0, 4), [
    "lead-sim-d2",
    "lead-sim-d5",
    "lead-sim-sales-3",
    "lead-sim-sales-4",
  ]);
  assert.equal(seq[4], `hold:sales_exhausted`);
});

check("depth sets how long before the ask, not whether", () => {
  // deep pivots at day 2 → one nudge (day 1) then the spine.
  const deep = sequence({ answered: 70 });
  assert.equal(deep[0], "lead-sim-finish-1");
  assert.equal(deep[1], "lead-sim-sales-1");
  // engaged pivots at day 5 → nudges on days 1 and 3.
  const engaged = sequence({ answered: 30 });
  assert.deepEqual(engaged.slice(0, 3), [
    "lead-sim-finish-1",
    "lead-sim-finish-2",
    "lead-sim-sales-1",
  ]);
  // bounced pivots at day 8 → all three nudges first (days 1, 3, 6).
  const bounced = sequence({ answered: 4 });
  assert.deepEqual(bounced.slice(0, 4), [
    "lead-sim-finish-1",
    "lead-sim-finish-2",
    "lead-sim-finish-3",
    "lead-sim-sales-1",
  ]);
});

check("nudges are capped and everyone converges on the same spine", () => {
  const bounced = sequence({ answered: 4 });
  assert.equal(
    bounced.filter((k) => k.startsWith("lead-sim-finish")).length,
    MAX_NUDGES,
  );
  assert.equal(bounced.filter((k) => k.startsWith("lead-sim-sales")).length, MAX_SALES);
  // Rungs 3 and 4 of the spine are identical for finisher and non-finisher.
  const finisher = sequence({ submitted: true, answered: 100 });
  assert.deepEqual(
    bounced.filter((k) => k === "lead-sim-sales-3" || k === "lead-sim-sales-4"),
    finisher.filter((k) => k === "lead-sim-sales-3" || k === "lead-sim-sales-4"),
  );
});

check("finishing mid-sequence switches the on-ramp, it does not restart it", () => {
  // Answers 30, gets nudged, then submits before the spine begins.
  const seq = sequence(
    { answered: 30 },
    { mutate: (s, i) => (i === 1 ? { ...s, submitted: true, answered: 100 } : s) },
  );
  assert.deepEqual(seq.slice(0, 4), [
    "lead-sim-finish-1",
    "lead-sim-finish-2",
    "lead-sim-d2",
    "lead-sim-d5",
  ]);
});

check("a cold lead is a recovery problem, not a sales one", () => {
  const seq = sequence({ answered: 0 });
  assert.equal(seq.filter((k) => k.startsWith("lead-sim-finish")).length, MAX_NUDGES);
  assert.ok(!seq.some((k) => k.startsWith("lead-sim-sales")), `sold to a cold lead: ${seq}`);
  assert.ok(seq.includes("hold:cold_no_sales"));
});

// ── Suppression ──────────────────────────────────────────────────────────────

check("a turma closed for sale gets content and no offer", () => {
  const seq = sequence({ answered: 70, cohortForSale: false });
  assert.ok(!seq.some((k) => k.startsWith("lead-sim-sales")), `sold a closed turma: ${seq}`);
  assert.ok(!seq.includes("lead-sim-d2"), `sold a closed turma: ${seq}`);
  assert.equal(seq.filter((k) => k === "lead-sim-valor").length, MAX_VALOR);
  assert.ok(seq.includes("hold:sales_suppressed"));
});

check("nobody is sold to in the last 30 days before their exam", () => {
  for (const submitted of [true, false]) {
    const seq = sequence({ answered: 70, submitted, phase: "vespera" });
    assert.ok(
      !seq.some((k) => k.startsWith("lead-sim-sales") || k === "lead-sim-d2" || k === "lead-sim-d5"),
      `sold in véspera (submitted=${submitted}): ${seq}`,
    );
  }
});

check("suppression HOLDS the rung so it lifts cleanly after the rollover", () => {
  // Two value emails spent, still suppressed: drip_step must not advance, or the
  // ladder would be exhausted by the time the lead rolls onto a sellable turma.
  const plan = planSimuladoSend(
    lead({ answered: 70, cohortForSale: false, salesStep: MAX_VALOR, elapsedDays: 99, dripStep: 3 }),
  );
  assert.equal(plan.action, "hold");
  // The same lead on a sellable turma resumes the spine at rung 3.
  const resumed = planSimuladoSend(
    lead({ answered: 70, cohortForSale: true, salesStep: MAX_VALOR, elapsedDays: 99, dripStep: 3 }),
  );
  assert.equal(resumed.action, "send");
  assert.equal(resumed.kind, "lead-sim-sales-3");
});

// ── The undecided track ──────────────────────────────────────────────────────

check("undecided leads are asked for the turma, twice, then merge", () => {
  const seq = sequence({ undecided: true, answered: 30 });
  assert.equal(seq[0], "lead-sim-turma");
  assert.equal(seq[2], "lead-sim-turma");
  assert.equal(seq.filter((k) => k === "lead-sim-turma").length, 2);
  assert.ok(seq.some((k) => k.startsWith("lead-sim-")), "merged into the timed track");
});

check("answering the turma question stops the asking", () => {
  const seq = sequence(
    { undecided: true, answered: 30 },
    { mutate: (s) => ({ ...s, undecided: false }) },
  );
  assert.equal(seq.filter((k) => k === "lead-sim-turma").length, 1);
});

// ── KARINA'S RULE: no partial diagnosis, ever ────────────────────────────────

// Every kind the sequence can hand to a lead who has NOT submitted, across every
// phase, depth, suppression state and rung.
const nonFinisherKinds = new Set();
const finisherKinds = new Set();
for (const phase of ["distante", "preparacao", "reta-final", "vespera", "indefinida"]) {
  for (const answered of [0, 4, 30, 70, 100]) {
    for (const cohortForSale of [true, false]) {
      for (const undecided of [true, false]) {
        for (const submitted of [true, false]) {
          const target = submitted ? finisherKinds : nonFinisherKinds;
          for (const k of sequence({ phase, answered, cohortForSale, undecided, submitted })) {
            if (!k.startsWith("hold:")) target.add(k);
          }
        }
      }
    }
  }
}

check("the diagnosis on-ramp is unreachable without submitting", () => {
  assert.ok(!nonFinisherKinds.has("lead-sim-d2"), "lead-sim-d2 reachable by a non-finisher");
  assert.ok(!nonFinisherKinds.has("lead-sim-d5"), "lead-sim-d5 reachable by a non-finisher");
  assert.ok(finisherKinds.has("lead-sim-d2"), "finishers must still get the report recap");
});

check("no non-finisher template references a score", () => {
  for (const kind of nonFinisherKinds) {
    const t = EMAIL_TEMPLATE_DEFAULTS[kind];
    assert.ok(t, `${kind} has no entry in EMAIL_TEMPLATE_DEFAULTS (renderEmail would crash)`);
    const source = [t.subject, t.kicker, t.headline, t.body_html, t.cta_label].join("\n");
    assert.doesNotMatch(source, /simScore|areaScores|\bscore\b/, `${kind} references a score tag`);
  }
});

check("no non-finisher email RENDERS a score or a per-área figure", () => {
  const vars = {
    greeting: "Oi, Maria! ",
    progressLine: progressLineFor(68, TOTALS),
    coupon: "REVALIDA10",
    couponPercent: "10%",
    urgencyLine: urgencyLineFor({
      phase: "reta-final",
      daysUntilTest: 51,
      examDateLabel: "15/09/2026",
      dateConfirmed: true,
      cohortName: "Revalida 2026.2",
    }),
    cohortName: "Revalida 2026.2",
    testDate: "15/09/2026",
    daysUntilTest: "51",
    phase: "reta-final",
    turmaOptions: "<p>…</p>",
    accessUrl: "https://example.test/a",
    checkoutUrl: "https://example.test/c",
    unsubscribeUrl: "https://example.test/u",
    // Deliberately supplied and deliberately non-empty: if any non-finisher
    // template ever picks the tag up, this makes it show.
    simScore: "77",
  };
  for (const kind of nonFinisherKinds) {
    const t = EMAIL_TEMPLATE_DEFAULTS[kind];
    const html = interpolate(`${t.subject}\n${t.headline}\n${t.body_html}\n${t.cta_label}`, vars);
    assert.doesNotMatch(html, /\b\d{1,3}\s*\/\s*100\b/, `${kind} rendered a score`);
    assert.doesNotMatch(html, /\b77\b/, `${kind} rendered simScore`);
    assert.doesNotMatch(
      html,
      /(acertou|você acertou|sua nota|seu desempenho (foi|em)|pior|melhor) /i,
      `${kind} rendered a performance claim`,
    );
  }
});

check("the content-only email carries no offer at all", () => {
  const t = EMAIL_TEMPLATE_DEFAULTS["lead-sim-valor"];
  const source = [t.subject, t.headline, t.body_html, t.cta_label, t.cta_href].join("\n");
  assert.doesNotMatch(source, /checkoutUrl|coupon|cupom|desconto/i);
});

check("every kind the planner can emit exists as a template default", () => {
  for (const kind of new Set([...nonFinisherKinds, ...finisherKinds, "lead-sim-rollover"])) {
    assert.ok(EMAIL_TEMPLATE_DEFAULTS[kind], `${kind} missing from EMAIL_TEMPLATE_DEFAULTS`);
  }
});

// ── Report ───────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`\n${failures.length} FAILED, ${passed} passed\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\n✓ ${passed} checks passed — simulado drip sequence\n`);
