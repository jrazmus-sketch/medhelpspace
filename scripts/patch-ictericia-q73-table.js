'use strict';
/**
 * patch-ictericia-q73-table.js — one-off content fix approved by Karina (2026-09-22).
 *
 * Icterícia Neonatal, Questão 73 (Revalida 2024.2) names a reference table
 * ("Considerando-se o caso e a tabela de referência apresentados…") that existed ONLY
 * inside the figure: the stem carried its caption but not its numbers, so the image was
 * the one thing the student could not do without. She asked for it to be typed out.
 *
 * This types the phototherapy / exchange-transfusion thresholds as a real table, right
 * after the caption, and then clears the figure: its other two panels (Imagem 1 and
 * Imagem 2) were already typed, so nothing is left only in the picture.
 *
 *   node scripts/patch-ictericia-q73-table.js            # DRY RUN (PROD via app/.env.local)
 *   node scripts/patch-ictericia-q73-table.js --apply
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/patch-ictericia-q73-table.js --apply
 *
 * Idempotent: it finds the row by page slug + heading, and does nothing once the table is in.
 */
const fs = require('fs');
const path = require('path');

(function () { const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8'); for (const l of raw.split('\n')) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const e = t.indexOf('='); if (e < 0) continue; const k = t.slice(0, e).trim(), v = t.slice(e + 1).trim().replace(/^["']|["']$/g, ''); if (!(k in process.env)) process.env[k] = v; } })();

const SLUG = 'ictericia-neonatal';
const HEADING = /Quest[aã]o\s+73[^<]{0,8}?Revalida\s+2024\.2/;
const CAPTION = 'Tabela – Nível de bilirrubina total';
// Transcribed from the figure (ictericia-neonatal-2024-2q73-atualizado.jpg), read at 2.2x.
const ROWS = [
  ['24 horas', '8', '10', '15', '18'],
  ['36 horas', '9,5', '11,5', '16', '20'],
  ['48 horas', '11', '13', '17', '21'],
  ['72 horas', '13', '15', '18', '22'],
  ['96 horas', '14', '16', '20', '23'],
  ['5 a 7 dias', '15', '17', '21', '24'],
];
const TABLE =
  '<div class="quiz-table-wrap"><table class="quiz-table">' +
  '<tr><th rowspan="2">Idade</th><th colspan="2">Fototerapia</th><th colspan="2">Exsanguineotransfusão</th></tr>' +
  '<tr><th>35<sup>0/7</sup> – 37<sup>6/7</sup> semanas</th><th>≥ 38<sup>0/7</sup> semanas</th>' +
  '<th>35<sup>0/7</sup> – 37<sup>6/7</sup> semanas</th><th>≥ 38<sup>0/7</sup> semanas</th></tr>' +
  ROWS.map((r) => `<tr><td>${r[0]}</td>${r.slice(1).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') +
  '</table></div>';

(async () => {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL missing'); process.exit(1); }
  const target = url.includes('127.0.0.1') ? 'LOCAL' : 'PROD';
  const db = require('postgres')(url, { max: 1, prepare: false, ssl: target === 'LOCAL' ? false : 'require', onnotice: () => {} });
  try {
    const rows = await db`SELECT q.id, q.question, q.media_url FROM quiz_questions q JOIN pages p ON p.id = q.page_id WHERE p.slug = ${SLUG}`;
    const hit = rows.filter((r) => HEADING.test(r.question));
    if (hit.length !== 1) { console.error(`✗ expected 1 matching question on ${SLUG}, found ${hit.length}`); process.exit(1); }
    const q = hit[0];
    console.log(`\n=== ictericia Q73 table  [${target}]  ${apply ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`  question id ${q.id}   figure: ${q.media_url ? q.media_url.split('/').pop() : '(none)'}`);
    if (q.question.includes('Exsanguineotransfusão</th>')) { console.log('  table already typed — nothing to do.'); return; }
    const idx = q.question.indexOf(CAPTION);
    if (idx === -1) { console.error(`✗ caption "${CAPTION}" not found in the stem`); process.exit(1); }
    // Insert right after the caption's paragraph.
    const end = q.question.indexOf('</p>', idx);
    if (end === -1) { console.error('✗ caption paragraph has no </p>'); process.exit(1); }
    const next = q.question.slice(0, end + 4) + '\n' + TABLE + q.question.slice(end + 4);
    console.log(`  inserting ${ROWS.length} rows after the caption; stem ${q.question.length} → ${next.length} chars`);
    console.log(`  clearing the figure (its other two panels are already typed)`);
    if (!apply) { console.log('\n  DRY RUN — re-run with --apply.'); return; }
    const r = await db`UPDATE quiz_questions SET question = ${next}, media_url = NULL WHERE id = ${q.id} AND question = ${q.question}`;
    if (r.count !== 1) throw new Error('row changed under us');
    console.log(`\n  ✓ applied to ${target}.`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
