'use strict';
/**
 * clean-h4-emoji-prefixes.js
 *
 * Strips decorative emoji (🟪 🟣 📌 ⚠️ 🧠) from the start of <h4>…</h4>
 * headings in quiz_questions.explanation_html. The brand-purple CSS marker
 * on .quiz-explanation h4:first-child plays the role those emoji used to
 * play, and the simulado parser already strips them when authoring new
 * content. This script normalizes pre-existing rows from the earlier
 * simulado-conversion batch that retained the literal emoji.
 *
 * Usage:
 *   node scripts/clean-h4-emoji-prefixes.js            # dry run
 *   node scripts/clean-h4-emoji-prefixes.js --apply    # commit + backup
 *
 * Backup table: quiz_questions_h4_emoji_backup. Re-running on already-clean
 * rows is a no-op.
 */
const fs = require('fs'), path = require('path');
const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8');
for (const line of raw.split('\n')) {
  const eq = line.indexOf('='); if (eq === -1) continue;
  const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}
const postgres = require('postgres');
const db = postgres(process.env.DATABASE_URL, { max: 1 });

const APPLY = process.argv.includes('--apply');

const H4_EMOJI_RE = /<h4>(?:🟪|🟣|📌|⚠️|🧠)\s*/gu;

function cleanH4(html) {
  if (!html) return html;
  return html.replace(H4_EMOJI_RE, '<h4>');
}

(async () => {
  try {
    const rows = await db`
      SELECT q.id, p.slug, q.position, q.explanation_html
      FROM quiz_questions q
      JOIN pages p ON p.id = q.page_id
      WHERE q.explanation_html ~ '<h4>(🟪|🟣|📌|⚠️|🧠)'
      ORDER BY p.slug, q.position
    `;
    console.log(`Candidates: ${rows.length} rows with emoji prefix on <h4>.\n`);

    const updates = [];
    for (const r of rows) {
      const cleaned = cleanH4(r.explanation_html);
      if (cleaned !== r.explanation_html) {
        updates.push({ id: r.id, slug: r.slug, position: r.position, old: r.explanation_html, new: cleaned });
      }
    }
    console.log(`Will update: ${updates.length}\n`);

    if (updates[0]) {
      const u = updates[0];
      console.log(`--- SAMPLE diff (qid=${u.id} ${u.slug}#${u.position}) ---`);
      // Show first <h4> from old vs new
      const oldHead = (u.old.match(/<h4>[^<]+<\/h4>/) || ['(none)'])[0];
      const newHead = (u.new.match(/<h4>[^<]+<\/h4>/) || ['(none)'])[0];
      console.log(`  before: ${oldHead}`);
      console.log(`  after:  ${newHead}`);
    }

    if (!APPLY) {
      console.log('\nDRY RUN. Re-run with --apply to commit.');
      return;
    }

    console.log('\nCreating backup table…');
    await db`
      CREATE TABLE IF NOT EXISTS quiz_questions_h4_emoji_backup (
        question_id INT NOT NULL,
        original_explanation_html TEXT,
        backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (question_id)
      )
    `;
    for (const u of updates) {
      await db`
        INSERT INTO quiz_questions_h4_emoji_backup (question_id, original_explanation_html)
        VALUES (${u.id}, ${u.old})
        ON CONFLICT (question_id) DO NOTHING
      `;
    }
    console.log(`Backed up ${updates.length} rows.`);

    console.log('\nApplying updates…');
    let applied = 0;
    await db.begin(async (sql) => {
      for (const u of updates) {
        await sql`UPDATE quiz_questions SET explanation_html = ${u.new} WHERE id = ${u.id}`;
        applied++;
      }
    });
    console.log(`Applied ${applied} updates.`);
    console.log('\nDONE.');
    console.log('Rollback:');
    console.log("  UPDATE quiz_questions q SET explanation_html = b.original_explanation_html");
    console.log("  FROM quiz_questions_h4_emoji_backup b WHERE b.question_id = q.id;");
  } catch (e) {
    console.error('ERROR', e);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
