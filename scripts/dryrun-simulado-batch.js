'use strict';
/**
 * dryrun-simulado-batch.js
 *
 * Runs scripts/parse-simulados.js for each eligible slug and collects warnings.
 * Reads the eligible list from _simulado-batch-list.json.
 * Pure dry-run — never touches DB writes.
 */
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');

const list = JSON.parse(fs.readFileSync(path.join(__dirname, '_simulado-batch-list.json'), 'utf8'));
const slugs = list.eligible.map(r => r.slug);
const parserPath = path.join(__dirname, 'parse-simulados.js');

const results = [];
const startTs = Date.now();

for (let i = 0; i < slugs.length; i++) {
  const slug = slugs[i];
  const tmpOut = path.join(__dirname, `_dryrun-tmp-${slug}.json`);
  const proc = spawnSync(process.execPath, [parserPath, slug, '--out', tmpOut], {
    encoding: 'utf8',
  });

  let warnings = [];
  let questionCount = 0;
  let parseError = null;

  if (proc.status !== 0) {
    parseError = (proc.stderr || proc.stdout || '').trim();
  } else if (fs.existsSync(tmpOut)) {
    try {
      const j = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
      warnings = j.warnings || [];
      questionCount = (j.questions || []).length;
    } catch (e) {
      parseError = `JSON parse failed: ${e.message}`;
    }
    try { fs.unlinkSync(tmpOut); } catch {}
  } else {
    parseError = 'no output file written';
  }

  const status = parseError ? 'ERROR' :
                 warnings.length > 0 ? 'WARN' :
                 questionCount !== 10 ? 'COUNT' :
                 'OK';

  results.push({slug, status, questionCount, warnings, parseError});
  const tag = status === 'OK' ? ' ok ' : `[${status}]`;
  process.stdout.write(`[${String(i+1).padStart(3)}/${slugs.length}] ${tag} ${slug.padEnd(60)} q=${questionCount}${warnings.length ? ` warn=${warnings.length}` : ''}\n`);
}

const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);

const ok    = results.filter(r => r.status === 'OK');
const warn  = results.filter(r => r.status === 'WARN');
const count = results.filter(r => r.status === 'COUNT');
const err   = results.filter(r => r.status === 'ERROR');

console.log(`\n=== Dry-run summary (${elapsed}s) ===`);
console.log(`OK:    ${ok.length}`);
console.log(`WARN:  ${warn.length}  (parser flagged structural issues — must be excluded)`);
console.log(`COUNT: ${count.length} (question count != 10 — must be excluded)`);
console.log(`ERROR: ${err.length}  (parser threw — must be excluded)`);

if (warn.length) {
  console.log('\n--- WARN details ---');
  for (const r of warn) {
    console.log(`\n  ${r.slug}  (q=${r.questionCount})`);
    for (const w of r.warnings) console.log(`    ⚠ ${w}`);
  }
}
if (count.length) {
  console.log('\n--- COUNT mismatches ---');
  for (const r of count) console.log(`  ${r.slug}  q=${r.questionCount}`);
}
if (err.length) {
  console.log('\n--- ERROR details ---');
  for (const r of err) {
    console.log(`\n  ${r.slug}`);
    console.log(`    ${r.parseError.split('\n').slice(0, 6).join('\n    ')}`);
  }
}

fs.writeFileSync(path.join(__dirname, '_dryrun-results.json'), JSON.stringify(results, null, 2));
console.log(`\nWrote scripts/_dryrun-results.json`);
