'use strict';
// Adds (A)/(B)/(C)/(D) letter prefixes to bradiarritmias-simulados quiz options
// so they match the visual style used by all other migrated h5p-quiz pages
// (where options are stored as <div><strong>(A) text</strong></div>).
//
// Idempotent: if an option's text already starts with "(A)"/"(B)"/... it is skipped.

const fs = require('fs');
const path = require('path');
const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8');
for (const line of raw.split('\n')) {
  const eq = line.indexOf('=');
  if (eq === -1) continue;
  const k = line.slice(0, eq).trim();
  const v = line.slice(eq + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}

const postgres = require('postgres');
const db = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const APPLY = process.argv.includes('--apply');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function alreadyHasPrefix(text) {
  // Strip tags, check if it begins with "(X)" where X is a letter
  const stripped = String(text).replace(/<[^>]+>/g, '').trim();
  return /^\(\s*[A-Z]\s*\)/i.test(stripped);
}

function prefixed(letter, text) {
  // Strip surrounding whitespace; if text is plain (no html), escape it.
  // Existing data is plain text without HTML, so escape to be safe.
  const trimmed = String(text).trim();
  const isHtml = /<[a-z]+/i.test(trimmed);
  const inner = isHtml ? trimmed : escapeHtml(trimmed);
  return `<div><strong>(${letter}) ${inner}</strong></div>`;
}

(async () => {
  try {
    const rows = await db`
      SELECT q.id, q.position, q.answers
      FROM quiz_questions q
      JOIN pages p ON p.id = q.page_id
      WHERE p.slug = 'bradiarritmias-simulados'
      ORDER BY q.position
    `;

    console.log(`Found ${rows.length} questions on bradiarritmias-simulados.\n`);

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const answers = row.answers;
      let changedAny = false;
      const newAnswers = answers.map((a, idx) => {
        if (alreadyHasPrefix(a.text)) return a;
        const letter = LETTERS[idx];
        if (!letter) return a;
        changedAny = true;
        return { ...a, text: prefixed(letter, a.text) };
      });

      if (!changedAny) {
        skipped++;
        console.log(`  Q${row.position} (id=${row.id}): already prefixed — skip`);
        continue;
      }

      console.log(`  Q${row.position} (id=${row.id}): wrapping ${newAnswers.length} options`);
      for (let i = 0; i < newAnswers.length; i++) {
        console.log(`    [${LETTERS[i]}] ${newAnswers[i].text.slice(0, 90)}...`);
      }

      if (APPLY) {
        await db`UPDATE quiz_questions SET answers = ${db.json(newAnswers)} WHERE id = ${row.id}`;
        updated++;
      }
    }

    console.log('');
    if (APPLY) {
      console.log(`Done. Updated ${updated}; skipped ${skipped}.`);
    } else {
      console.log(`DRY RUN: ${rows.length - skipped} would be updated; ${skipped} already prefixed.`);
      console.log('Re-run with --apply to write changes.');
    }
  } catch (e) {
    console.error('ERR:', e.message);
    process.exitCode = 1;
  } finally {
    db.end();
  }
})();
