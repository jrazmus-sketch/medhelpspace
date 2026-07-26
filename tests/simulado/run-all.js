#!/usr/bin/env node
'use strict';

/**
 * Runs every simulado funnel suite in sequence and exits non-zero if any fails.
 *
 *   node tests/simulado/run-all.js
 *
 * Requires the dev server on :3001 and the LOCAL Supabase stack (see README).
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['pages', 'landing, gating, exam payload, grading, result page'],
  ['actions', 'real server actions: start, save, submit, tamper, hijack'],
  ['report', 'diagnosis, cut score, tema discipline, invitations, review'],
  ['emails', 'the five funnel e-mails and the vars their senders supply'],
  ['medhelp-60d', 'the 60D Simulados 100Q section and Simulado 3'],
];

let failed = 0;
const results = [];

for (const [name, blurb] of SUITES) {
  const file = path.join(__dirname, `${name}.test.js`);
  process.stdout.write(`\n── ${name} — ${blurb}\n`);
  const r = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  const ok = r.status === 0;
  if (!ok) failed++;
  results.push([name, ok]);
}

console.log(`\n${'='.repeat(56)}`);
for (const [name, ok] of results) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log(failed ? `\n${failed} suite(s) failed` : '\nall suites passed');
process.exit(failed ? 1 : 0);
