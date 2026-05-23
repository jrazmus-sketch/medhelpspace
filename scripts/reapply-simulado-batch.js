'use strict';
/**
 * reapply-simulado-batch.js
 *
 * Runs scripts/reapply-simulado-as-quiz.js on each slug listed in
 * scripts/_corruption-check.json (status === "CORRUPTED").
 *
 * Usage:
 *   node scripts/reapply-simulado-batch.js         # dry run
 *   node scripts/reapply-simulado-batch.js --apply
 */
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');

const apply = process.argv.includes('--apply');
const report = JSON.parse(fs.readFileSync(path.join(__dirname, '_corruption-check.json'), 'utf8'));
const slugs = report.filter(r => r.status === 'CORRUPTED').map(r => r.slug);

console.log(`Reapply targets: ${slugs.length} slugs`);
console.log(`Mode: ${apply ? 'APPLY' : 'dry-run'}\n`);

const ok = [], fail = [];
const start = Date.now();
const reapplierPath = path.join(__dirname, 'reapply-simulado-as-quiz.js');
for (let i = 0; i < slugs.length; i++) {
  const slug = slugs[i];
  const args = [reapplierPath, slug];
  if (apply) args.push('--apply');
  process.stdout.write(`[${String(i+1).padStart(2)}/${slugs.length}] ${slug.padEnd(50)} `);
  const proc = spawnSync(process.execPath, args, {encoding: 'utf8'});
  if (proc.status === 0) {
    const last = proc.stdout.trim().split('\n').pop();
    process.stdout.write(`OK  ${last}\n`);
    ok.push(slug);
  } else {
    process.stdout.write(`FAIL\n`);
    fail.push({slug, err: (proc.stderr||proc.stdout||'').trim()});
    console.log(`    ${(proc.stderr||proc.stdout||'').trim().split('\n').slice(0,4).join('\n    ')}\n`);
  }
}

console.log(`\n=== Done in ${((Date.now()-start)/1000).toFixed(1)}s ===`);
console.log(`OK:   ${ok.length}`);
console.log(`FAIL: ${fail.length}`);
