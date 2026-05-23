'use strict';
/**
 * apply-simulado-batch.js
 *
 * Applies the simulado→quiz conversion to a batch of slugs, defined by either:
 *   --specialty <slug>     all OK pages in that specialty
 *   --slugs <s1,s2,...>    explicit comma-separated list
 *   --all                  every OK page across every specialty
 *
 * Default = dry-run. Pass --apply to commit each conversion (each page runs in
 * its own transaction via scripts/apply-simulado-as-quiz.js).
 *
 * Reads _dryrun-results.json and _simulado-batch-list.json to know which slugs
 * are OK and which specialty they belong to.
 */
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const specialty = (args.find(a => a.startsWith('--specialty=')) || '').split('=')[1]
                  || (args.includes('--specialty') ? args[args.indexOf('--specialty')+1] : null);
const specialtiesArg = (args.find(a => a.startsWith('--specialties=')) || '').split('=')[1]
                  || (args.includes('--specialties') ? args[args.indexOf('--specialties')+1] : null);
const slugsArg = (args.find(a => a.startsWith('--slugs=')) || '').split('=')[1]
                  || (args.includes('--slugs') ? args[args.indexOf('--slugs')+1] : null);
const all = args.includes('--all');

const dryrun = JSON.parse(fs.readFileSync(path.join(__dirname, '_dryrun-results.json'), 'utf8'));
const list = JSON.parse(fs.readFileSync(path.join(__dirname, '_simulado-batch-list.json'), 'utf8'));
const slugToSpecialty = {};
for (const r of list.eligible) slugToSpecialty[r.slug] = r.specialty;

const okSlugs = new Set(dryrun.filter(r => r.status === 'OK').map(r => r.slug));

let targets;
if (slugsArg) {
  targets = slugsArg.split(',').map(s => s.trim()).filter(Boolean);
} else if (specialty) {
  targets = dryrun
    .filter(r => r.status === 'OK' && slugToSpecialty[r.slug] === specialty)
    .map(r => r.slug);
} else if (specialtiesArg) {
  const wanted = new Set(specialtiesArg.split(',').map(s => s.trim()).filter(Boolean));
  targets = dryrun
    .filter(r => r.status === 'OK' && wanted.has(slugToSpecialty[r.slug]))
    .map(r => r.slug);
} else if (all) {
  targets = [...okSlugs];
} else {
  console.error('Usage: node scripts/apply-simulado-batch.js (--specialty <slug> | --specialties s1,s2 | --slugs s1,s2 | --all) [--apply]');
  process.exit(2);
}

if (targets.length === 0) {
  console.error('No targets resolved. Check --specialty / --slugs args.');
  process.exit(2);
}

// Sanity: every target must be in the OK set
for (const slug of targets) {
  if (!okSlugs.has(slug)) {
    console.error(`Refusing to apply ${slug}: not in OK dry-run set.`);
    process.exit(2);
  }
}

console.log(`Targets: ${targets.length} slug${targets.length===1?'':'s'}${specialty?` in [${specialty}]`:''}`);
console.log(`Mode:    ${apply ? 'APPLY' : 'dry-run (pass --apply to commit)'}\n`);

const applierPath = path.join(__dirname, 'apply-simulado-as-quiz.js');
const ok = [], fail = [];
const startTs = Date.now();

for (let i = 0; i < targets.length; i++) {
  const slug = targets[i];
  const cmdArgs = [applierPath, slug];
  if (apply) cmdArgs.push('--apply');

  process.stdout.write(`[${String(i+1).padStart(3)}/${targets.length}] ${slug.padEnd(60)} `);
  const proc = spawnSync(process.execPath, cmdArgs, {encoding: 'utf8'});

  if (proc.status === 0) {
    // Parse verification line out of stdout for apply mode
    let verify = '';
    if (apply) {
      const m = proc.stdout.match(/new_type:\s*'([^']+)'[\s\S]*?q_count:\s*(\d+)[\s\S]*?lessons_preserved:\s*(\d+)/);
      if (m) verify = ` new_type=${m[1]} q=${m[2]} lessons=${m[3]}`;
    }
    process.stdout.write(`OK${verify}\n`);
    ok.push(slug);
  } else {
    process.stdout.write(`FAIL\n`);
    const err = (proc.stderr || proc.stdout || '').trim();
    fail.push({slug, err});
    console.log(`    ${err.split('\n').slice(0,8).join('\n    ')}\n`);
  }
}

const elapsed = ((Date.now() - startTs)/1000).toFixed(1);
console.log(`\n=== Batch ${apply?'apply':'dry-run'} done (${elapsed}s) ===`);
console.log(`OK:   ${ok.length}`);
console.log(`FAIL: ${fail.length}`);
if (fail.length) {
  console.log('\nFailures:');
  for (const f of fail) console.log(`  ${f.slug}`);
}
