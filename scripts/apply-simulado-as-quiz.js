'use strict';
/**
 * apply-simulado-as-quiz.js
 *
 * Reads parser output for a single *-simulados page and converts it into
 * h5p-quiz form:
 *   1. Inserts 10 rows into quiz_questions (with explanation_html populated)
 *   2. Flips pages.type from 'text-lesson' to 'h5p-quiz'
 *
 * Source lessons rows are PRESERVED (not deleted) so rollback is trivial:
 *   DELETE FROM quiz_questions WHERE page_id = <id>;
 *   UPDATE pages SET type = 'text-lesson' WHERE id = <id>;
 *
 * Usage:
 *   node scripts/apply-simulado-as-quiz.js <slug>        # dry run (default)
 *   node scripts/apply-simulado-as-quiz.js <slug> --apply
 *
 * Always runs parser first to get fresh data — does not depend on the JSON
 * file on disk.
 */
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');

const envRaw = fs.readFileSync(path.join(__dirname,'..','app','.env.local'),'utf8');
for (const line of envRaw.split('\n')) {
  const eq = line.indexOf('='); if (eq===-1) continue;
  const k=line.slice(0,eq).trim(), v=line.slice(eq+1).trim();
  if (!(k in process.env)) process.env[k]=v;
}
const postgres = require('postgres');

(async () => {
  const slug = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!slug) {
    console.error('Usage: node scripts/apply-simulado-as-quiz.js <slug> [--apply]');
    process.exit(2);
  }

  // Run the parser as a subprocess to get a fresh JSON dump.
  const tmpOut = path.join(__dirname, `_apply-tmp-${slug}.json`);
  const parserPath = path.join(__dirname, 'parse-simulados.js');
  const proc = spawnSync(process.execPath, [parserPath, slug, '--out', tmpOut], {
    encoding: 'utf8',
  });
  if (proc.status !== 0) {
    console.error('Parser failed:', proc.stderr || proc.stdout);
    process.exit(1);
  }
  console.log(proc.stdout.trim());
  const parsed = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
  fs.unlinkSync(tmpOut);

  if (parsed.warnings.length > 0) {
    console.error('Parser produced warnings — aborting:');
    for (const w of parsed.warnings) console.error('  ' + w);
    process.exit(1);
  }
  if (parsed.questions.length === 0) {
    console.error('No questions parsed — aborting.');
    process.exit(1);
  }

  const pageId = parseInt(parsed.page.id, 10);
  console.log(`\nPage ${pageId} (${parsed.page.slug}): ${parsed.questions.length} questions ready to insert.`);

  if (!apply) {
    console.log('\nDRY RUN — pass --apply to commit. Sample of first question to be inserted:');
    const q = parsed.questions[0];
    console.log({
      page_id: pageId,
      position: q.position,
      question: q.stem.slice(0, 120) + '...',
      correct_letter: q.correct,
      answers_count: q.answers.length,
      has_explanation: !!q.explanation_html,
    });
    return;
  }

  // ── Apply ──
  const db = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await db.begin(async (sql) => {
      // Safety check: ensure page exists and is currently text-lesson, and no quiz_questions already inserted for it.
      const [page] = await sql`
        SELECT id, slug, type FROM pages WHERE id = ${pageId}
      `;
      if (!page) throw new Error(`page ${pageId} not found`);
      if (page.slug !== slug) throw new Error(`slug mismatch: db has "${page.slug}", parser had "${slug}"`);
      if (page.type !== 'text-lesson' && page.type !== 'audio-lesson') {
        throw new Error(`expected page.type=text-lesson/audio-lesson, got "${page.type}"`);
      }
      const existing = await sql`SELECT count(*)::int AS n FROM quiz_questions WHERE page_id = ${pageId}`;
      if (existing[0].n > 0) throw new Error(`quiz_questions already exist for page ${pageId} (count=${existing[0].n})`);

      // Wrap question stem in a <p> so the renderer treats it as prose.
      // The stem already has \n separators between paragraphs. Prepend an
      // <h3><strong>Q{N}. Questão {N}</strong></h3> heading to match the
      // existing H5P-quiz format. (No Revalida year — these are inéditas.)
      for (const q of parsed.questions) {
        const stemHtml = q.stem
          .split('\n')
          .filter(s => s.trim().length > 0)
          .map(line => `<p>${escapeHtml(line)}</p>`)
          .join('\n');
        const heading = `<h3><strong>Q${q.position}. Questão ${q.number}</strong></h3>`;
        const questionHtml = heading + '\n' + stemHtml;

        // Wrap each option text in the project's established H5P-quiz format:
        // <div><strong>(A) ...</strong></div> — matches the 204 existing
        // h5p-quiz pages so the QuizPlayer renders them consistently.
        // Up to 5 options (A..E) for INEP-style 5-alternative questions.
        const letters = ['A','B','C','D','E'];
        const answersWithPrefix = q.answers.map((a, i) => ({
          text: `<div><strong>(${letters[i]}) ${escapeHtml(a.text)}</strong></div>`,
          correct: a.correct,
          feedback: a.feedback,
        }));

        await sql`
          INSERT INTO quiz_questions
            (page_id, position, question, answers, media_url, explanation_html)
          VALUES (
            ${pageId},
            ${q.position},
            ${questionHtml},
            ${sql.json(answersWithPrefix)},
            ${null},
            ${q.explanation_html}
          )
        `;
      }

      // Flip the page type.
      await sql`UPDATE pages SET type = 'h5p-quiz' WHERE id = ${pageId}`;
    });

    // Final verification
    const verify = await db`
      SELECT (SELECT type FROM pages WHERE id = ${pageId}) AS new_type,
             (SELECT count(*)::int FROM quiz_questions WHERE page_id = ${pageId}) AS q_count,
             (SELECT count(*)::int FROM lessons WHERE page_id = ${pageId}) AS lessons_preserved
    `;
    console.log('\n✔ Applied. Verification:');
    console.log(verify[0]);
    console.log('\nRollback if needed:');
    console.log(`  DELETE FROM quiz_questions WHERE page_id = ${pageId};`);
    console.log(`  UPDATE pages SET type = 'text-lesson' WHERE id = ${pageId};`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    db.end();
  }
})();

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
