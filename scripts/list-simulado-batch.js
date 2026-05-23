'use strict';
/**
 * list-simulado-batch.js
 *
 * Lists all *-simulados pages eligible for the batch conversion to h5p-quiz.
 * Excludes bradiarritmias-simulados (already converted).
 * Flags pages with non-standard lesson counts (the 2 known 6-lesson outliers).
 */
const fs = require('fs'), path = require('path');
const raw = fs.readFileSync(path.join(__dirname,'..','app','.env.local'),'utf8');
for (const line of raw.split('\n')) {
  const eq = line.indexOf('='); if (eq===-1) continue;
  const k=line.slice(0,eq).trim(), v=line.slice(eq+1).trim();
  if (!(k in process.env)) process.env[k]=v;
}
const postgres = require('postgres');
const db = postgres(process.env.DATABASE_URL,{max:1});

(async () => {
  try {
    const rows = await db`
      SELECT p.id,
             p.slug,
             p.type,
             COALESCE(s.slug, '(no-specialty)') AS specialty,
             (SELECT count(*)::int FROM lessons l WHERE l.page_id = p.id) AS lesson_count,
             (SELECT count(*)::int FROM quiz_questions q WHERE q.page_id = p.id) AS quiz_count
      FROM pages p
      LEFT JOIN specialties s ON s.id = p.specialty_id
      WHERE p.slug LIKE '%-simulados'
      ORDER BY s.slug NULLS FIRST, p.slug
    `;

    const eligible = [];
    const skip = [];
    for (const r of rows) {
      if (r.slug === 'bradiarritmias-simulados') {
        skip.push({...r, reason: 'PoC, already converted'});
        continue;
      }
      if (r.type === 'h5p-quiz') {
        skip.push({...r, reason: 'already h5p-quiz'});
        continue;
      }
      if (r.type !== 'text-lesson' && r.type !== 'audio-lesson') {
        skip.push({...r, reason: `unexpected type=${r.type}`});
        continue;
      }
      if (r.quiz_count > 0) {
        skip.push({...r, reason: `pre-existing quiz_questions rows (n=${r.quiz_count})`});
        continue;
      }
      if (r.lesson_count !== 2) {
        skip.push({...r, reason: `non-standard lesson_count=${r.lesson_count} (applier handles 2-lesson shape only)`});
        continue;
      }
      eligible.push(r);
    }

    // Group eligible by specialty
    const bySpecialty = {};
    for (const r of eligible) {
      (bySpecialty[r.specialty] ||= []).push(r);
    }

    console.log(`=== Candidate list ===`);
    console.log(`Total *-simulados pages in DB: ${rows.length}`);
    console.log(`Eligible (2-lesson, text/audio-lesson, no prior quiz rows): ${eligible.length}`);
    console.log(`Skipped: ${skip.length}\n`);

    console.log(`--- Eligible by specialty (apply order) ---`);
    for (const sp of Object.keys(bySpecialty).sort()) {
      console.log(`\n[${sp}]  ${bySpecialty[sp].length} pages`);
      for (const r of bySpecialty[sp]) {
        console.log(`  ${r.slug.padEnd(60)} type=${r.type}  lessons=${r.lesson_count}`);
      }
    }

    console.log(`\n--- Skipped pages (with reason) ---`);
    for (const r of skip) {
      console.log(`  [${r.specialty}] ${r.slug.padEnd(60)} ${r.reason}`);
    }

    // Emit machine-readable list for batching
    const out = path.join(__dirname, '_simulado-batch-list.json');
    fs.writeFileSync(out, JSON.stringify({eligible, skip, bySpecialty}, null, 2));
    console.log(`\nWrote ${out}`);
  } finally {
    db.end();
  }
})();
