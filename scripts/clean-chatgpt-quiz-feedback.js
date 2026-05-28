'use strict';
/**
 * clean-chatgpt-quiz-feedback.js
 *
 * Strips ChatGPT export wrapper HTML from quiz_questions.answers[].feedback.
 *
 * Background: ~97 quiz pages have feedback HTML pasted directly from ChatGPT.
 * Outer structure (variants exist):
 *   <div class="flex max-w-full ...">
 *     <div data-message-author-role="assistant" ...>
 *       <div class="hidden">                    (<-- Tailwind: display:none)
 *         <div class="...markdown-new-styling"> (<-- canonical content)
 *           [actual comment HTML]
 *         </div>
 *       </div>
 *     </div>
 *   </div>
 *
 * 40 of these have the comment inside class="hidden" -> renders as empty box.
 * The other ~57 just have ChatGPT junk wrappers but content is visible.
 *
 * Strategy: locate the first <div whose class contains "markdown">, extract
 * its balanced inner HTML, replace the whole feedback. Fallback: strip
 * class="hidden" so content becomes visible at minimum.
 *
 * Usage:
 *   node scripts/clean-chatgpt-quiz-feedback.js           # dry run
 *   node scripts/clean-chatgpt-quiz-feedback.js --apply   # commit + backup
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

/**
 * Walk the string from startIdx counting <div> depth until the matching
 * </div> is found. Returns the index of '<' in the matching '</div>'.
 */
function findClosingDiv(html, startIdx) {
  let depth = 1;
  let i = startIdx;
  while (i < html.length && depth > 0) {
    const rest = html.slice(i);
    const openMatch = rest.match(/<div\b[^>]*>/i);
    const closeMatch = rest.match(/<\/div\s*>/i);
    if (!closeMatch) return -1;
    if (openMatch && openMatch.index < closeMatch.index) {
      depth++;
      i += openMatch.index + openMatch[0].length;
    } else {
      depth--;
      if (depth === 0) return i + closeMatch.index;
      i += closeMatch.index + closeMatch[0].length;
    }
  }
  return -1;
}

function cleanChatGPTPaste(html) {
  if (!html) return null;
  const isChatGPT =
    /data-message-author-role/i.test(html) ||
    /markdown-new-styling/i.test(html) ||
    /class="hidden"/i.test(html);
  if (!isChatGPT) return null;

  // Find the first <div> whose class contains "markdown" — works for both
  // "markdown-new-styling" and "markdown prose" variants.
  const m = html.match(/<div\b[^>]*\bclass="[^"]*\bmarkdown[^"]*"[^>]*>/i);
  if (m && typeof m.index === 'number') {
    const innerStart = m.index + m[0].length;
    const innerEnd = findClosingDiv(html, innerStart);
    if (innerEnd > innerStart) {
      const inner = html.slice(innerStart, innerEnd).trim();
      return `<div>${inner}</div>`;
    }
  }

  // Fallback: just neutralize class="hidden" so content becomes visible.
  const stripped = html.replace(/\bclass="hidden"/gi, 'class=""');
  return stripped !== html ? stripped : null;
}

(async () => {
  try {
    const rows = await db`
      SELECT q.id, q.page_id, q.answers, p.slug
      FROM quiz_questions q
      JOIN pages p ON p.id = q.page_id
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(q.answers) a
        WHERE (a->>'feedback') ~* 'class="hidden"|data-message-author-role|markdown-new-styling'
      )
      ORDER BY p.slug, q.position
    `;
    console.log(`Found ${rows.length} questions with ChatGPT-paste feedback.\n`);

    let totalAnswersChanged = 0;
    let totalQuestionsChanged = 0;
    let extractedFromMarkdown = 0;
    let strippedHiddenFallback = 0;
    let untouched = 0;

    const updates = [];
    for (const r of rows) {
      const newAnswers = r.answers.map((a) => ({ ...a }));
      const deltas = [];
      let qChanged = false;
      for (let i = 0; i < newAnswers.length; i++) {
        const fb = newAnswers[i].feedback;
        const cleaned = cleanChatGPTPaste(fb);
        if (cleaned == null) {
          if (fb && /data-message-author-role|markdown-new-styling|class="hidden"/i.test(fb)) untouched++;
          continue;
        }
        if (cleaned === fb) continue;
        if (/markdown/i.test(fb) && cleaned.length < fb.length * 0.95) extractedFromMarkdown++;
        else strippedHiddenFallback++;
        deltas.push({ idx: i, beforeLen: fb.length, afterLen: cleaned.length });
        newAnswers[i].feedback = cleaned;
        totalAnswersChanged++;
        qChanged = true;
      }
      if (qChanged) {
        totalQuestionsChanged++;
        updates.push({ id: r.id, slug: r.slug, newAnswers, deltas });
      }
    }

    console.log(`Will update ${totalQuestionsChanged} questions (${totalAnswersChanged} answers).`);
    console.log(`  extracted from markdown wrapper: ${extractedFromMarkdown}`);
    console.log(`  fallback (stripped class=hidden): ${strippedHiddenFallback}`);
    console.log(`  untouched (no clean path found):  ${untouched}\n`);

    console.log('--- SAMPLE DIFFS (first 3) ---');
    for (const u of updates.slice(0, 3)) {
      console.log(`qid=${u.id} slug=${u.slug}`);
      for (const d of u.deltas) {
        console.log(`  ans[${d.idx}]: ${d.beforeLen} chars -> ${d.afterLen} chars`);
      }
    }

    if (!APPLY) {
      console.log('\nDRY RUN. Re-run with --apply to commit.');
      return;
    }

    console.log('\nCreating backup table...');
    await db`
      CREATE TABLE IF NOT EXISTS quiz_questions_feedback_backup_chatgpt_clean (
        question_id INT NOT NULL,
        original_answers JSONB NOT NULL,
        backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (question_id)
      )
    `;
    for (const r of rows) {
      await db`
        INSERT INTO quiz_questions_feedback_backup_chatgpt_clean (question_id, original_answers)
        VALUES (${r.id}, ${db.json(r.answers)})
        ON CONFLICT (question_id) DO NOTHING
      `;
    }
    console.log(`Backed up ${rows.length} questions.`);

    console.log('\nApplying updates...');
    let applied = 0;
    for (const u of updates) {
      await db`
        UPDATE quiz_questions
        SET answers = ${db.json(u.newAnswers)}
        WHERE id = ${u.id}
      `;
      applied++;
    }
    console.log(`Applied ${applied} updates.`);
    console.log('\nDONE. Original feedback preserved in quiz_questions_feedback_backup_chatgpt_clean.');
    console.log('Rollback: UPDATE quiz_questions q SET answers = b.original_answers');
    console.log('         FROM quiz_questions_feedback_backup_chatgpt_clean b WHERE b.question_id = q.id;');
  } catch (e) {
    console.error('ERROR', e);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
