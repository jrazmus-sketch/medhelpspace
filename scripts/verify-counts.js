'use strict';
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
const db = postgres(process.env.DATABASE_URL, { max: 1 });

db`
  SELECT
    (SELECT COUNT(*) FROM pages)               AS pages,
    (SELECT COUNT(*) FROM lessons)             AS lessons,
    (SELECT COUNT(*) FROM quiz_questions)      AS quiz_questions,
    (SELECT COUNT(*) FROM flashcard_items)     AS flashcard_items,
    (SELECT COUNT(*) FROM presentation_slides) AS presentation_slides,
    (SELECT COUNT(*) FROM nav_items)           AS nav_items
`
  .then((r) => {
    const row = r[0];
    const expected = { pages: 958, lessons: 1253, quiz_questions: 711, flashcard_items: 3506, presentation_slides: 54, nav_items: 518 };
    console.log('\nTable              Actual    Expected  Status');
    console.log('─'.repeat(52));
    for (const [col, exp] of Object.entries(expected)) {
      const actual = Number(row[col]);
      const ok = actual === exp ? '✓' : `✗ (diff ${actual - exp})`;
      console.log(`${col.padEnd(22)} ${String(actual).padStart(6)    }    ${String(exp).padStart(6)}  ${ok}`);
    }
    db.end();
  })
  .catch((e) => { console.error(e.message); db.end(); process.exit(1); });
