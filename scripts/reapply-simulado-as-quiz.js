'use strict';
/**
 * reapply-simulado-as-quiz.js
 *
 * Re-runs the parser for a page that is ALREADY h5p-quiz and replaces its
 * quiz_questions rows with fresh ones. Use this to repair pages that were
 * imported with a buggy parser (e.g., the bare-"<" eaten-content bug).
 *
 * Transactional: DELETE old rows + INSERT new rows in one transaction.
 * Aborts if parser produces any warnings.
 *
 * Usage:
 *   node scripts/reapply-simulado-as-quiz.js <slug>          # dry run
 *   node scripts/reapply-simulado-as-quiz.js <slug> --apply
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
    console.error('Usage: node scripts/reapply-simulado-as-quiz.js <slug> [--apply]');
    process.exit(2);
  }

  const tmpOut = path.join(__dirname, `_reapply-tmp-${slug}.json`);
  const parserPath = path.join(__dirname, 'parse-simulados.js');
  const proc = spawnSync(process.execPath, [parserPath, slug, '--out', tmpOut], {encoding: 'utf8'});
  if (proc.status !== 0) {
    console.error('Parser failed:', proc.stderr || proc.stdout);
    process.exit(1);
  }
  const parsed = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
  fs.unlinkSync(tmpOut);

  if (parsed.warnings.length > 0) {
    console.error('Parser produced warnings — aborting:');
    for (const w of parsed.warnings) console.error('  ' + w);
    process.exit(1);
  }
  if (parsed.questions.length !== 10) {
    console.error(`Expected 10 questions, got ${parsed.questions.length} — aborting.`);
    process.exit(1);
  }

  const pageId = parseInt(parsed.page.id, 10);

  if (!apply) {
    console.log(`[DRY] Would replace ${parsed.questions.length} quiz_questions rows for ${slug} (page_id=${pageId}).`);
    return;
  }

  const db = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await db.begin(async (sql) => {
      // Sanity: page must exist and be h5p-quiz (we're re-applying, not converting)
      const [page] = await sql`SELECT id, slug, type FROM pages WHERE id = ${pageId}`;
      if (!page) throw new Error(`page ${pageId} not found`);
      if (page.slug !== slug) throw new Error(`slug mismatch: db has "${page.slug}", parser had "${slug}"`);
      if (page.type !== 'h5p-quiz') throw new Error(`expected page.type=h5p-quiz, got "${page.type}" — use apply-simulado-as-quiz.js instead`);

      // Delete existing rows
      await sql`DELETE FROM quiz_questions WHERE page_id = ${pageId}`;

      // Insert fresh rows (same logic as apply-simulado-as-quiz.js)
      for (const q of parsed.questions) {
        const stemHtml = q.stem
          .split('\n')
          .filter(s => s.trim().length > 0)
          .map(line => `<p>${escapeHtml(line)}</p>`)
          .join('\n');
        const heading = `<h3><strong>Q${q.position}. Questão ${q.number}</strong></h3>`;
        const questionHtml = heading + '\n' + stemHtml;

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
    });

    const verify = await db`
      SELECT (SELECT count(*)::int FROM quiz_questions WHERE page_id = ${pageId}) AS q_count
    `;
    console.log(`✔ Re-applied ${slug}: q_count=${verify[0].q_count}`);
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
