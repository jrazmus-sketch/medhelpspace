'use strict';
/**
 * migrate-legacy-quiz-feedback.js
 *
 * Normalizes legacy H5P-quiz feedback into the same shape that
 * scripts/parse-simulados.js produces for converted simulado pages:
 *
 *   - quiz_questions.explanation_html  ← semantic HTML (<h4>, <ul>,
 *       <ul class="resumo">, <ul class="pega">) for the Comentário block
 *   - answers[wrong].feedback          ← short "why this distractor is wrong"
 *       sentence (extracted from "Análise das alternativas incorretas:")
 *   - answers[correct].feedback        ← cleared (its content moves to
 *       explanation_html)
 *
 * Source pattern in legacy data: the entire Comentário block is stored as
 * raw HTML on the CORRECT answer's `feedback` field, with the format:
 *   <div><strong>🟪 Comentário:</strong><br>
 *   Quadro clínico...<br>
 *   ●bullet<br>●bullet<br>
 *   ...
 *   Análise das alternativas incorretas:<br>
 *   (A) blurb<br>(B) blurb<br>...
 *   </div>
 *
 * Strategy: htmlToLines (strip tags → plain text) → locate Comentário marker
 * → split off "Análise das alternativas incorretas" block → run the same
 * explanationTextToHtml that parse-simulados.js uses on the cleaned text →
 * write back. Skips rows that already have explanation_html populated, so
 * re-running is safe.
 *
 * Usage:
 *   node scripts/migrate-legacy-quiz-feedback.js                 # dry run
 *   node scripts/migrate-legacy-quiz-feedback.js --slug <slug>   # dry run, one page only
 *   node scripts/migrate-legacy-quiz-feedback.js --apply         # commit + backup
 *   node scripts/migrate-legacy-quiz-feedback.js --slug bradiarritmias --apply
 *
 * Backup table: quiz_questions_feedback_backup_legacy_migration
 * Rollback SQL is printed at the end of an --apply run.
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
const slugIdx = process.argv.indexOf('--slug');
const SLUG_FILTER = slugIdx > -1 ? process.argv[slugIdx + 1] : null;
const VERBOSE = process.argv.includes('--verbose');

// ---------- HTML helpers (copied from parse-simulados.js so this script
// stays self-contained; keep them in sync if the parser ever changes) ----

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&#8211;': '–', '&#8212;': '—',
  '&#8216;': '‘', '&#8217;': '’',
  '&#8220;': '“', '&#8221;': '”',
  '&#8230;': '…', '&#8203;': '',
  '&times;': '×',
};

function decodeEntities(s) {
  return s.replace(/&[a-zA-Z#0-9]+;/g, m => ENTITIES[m] ?? m);
}

function htmlToLines(html) {
  let s = html;
  s = s.replace(/<(?![\/a-zA-Z!])/g, '&lt;');
  s = s.replace(/<br\b[^>]*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<\/div>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/​/g, '');
  s = s.replace(/[ \t]+/g, ' ');
  s = s.split('\n').map(l => l.trim()).join('\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function explanationTextToHtml(text) {
  const lines = text.split('\n').map(l => l.trim());
  const out = [];
  let buf = [];
  let bulletKind = null;

  function flushList() {
    if (buf.length === 0) return;
    const cls = bulletKind === '🟣' ? ' class="resumo"' : bulletKind === '❌' ? ' class="pega"' : '';
    out.push(`<ul${cls}>${buf.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`);
    buf = [];
    bulletKind = null;
  }

  // Standard disc bullets: ● (parser canonical) and * (used by the 📌 family
  // of legacy feedback). Normalize both to "●" before list assembly so they
  // collapse into the same <ul>.
  for (const line of lines) {
    if (line === '') { flushList(); continue; }
    const bulletMatch = line.match(/^([●🟣❌*])\s*(.*)$/u);
    if (bulletMatch) {
      const kind = bulletMatch[1] === '*' ? '●' : bulletMatch[1];
      if (bulletKind && bulletKind !== kind) flushList();
      bulletKind = kind;
      buf.push(bulletMatch[2].trim());
      continue;
    }
    flushList();
    if (/:$/.test(line)) {
      // Strip leading decorative emoji (🟪 🟣 📌 ⚠️) from heading prefixes
      // so the rendered <h4> is clean and the brand-purple ::before square
      // can take the role they used to play.
      const cleaned = line.replace(/^(?:🟪|🟣|📌|⚠️|🧠)\s*/u, '');
      out.push(`<h4>${escapeHtml(cleaned)}</h4>`);
    } else {
      out.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  flushList();
  return out.join('\n');
}

// ---------- Legacy-feedback parser ----------

// End of the per-distractor section is signalled by the next heading
// (PEGA REVALIDA or Resumo-chave) or end of input. Those headings may carry
// a leading decorative emoji (⚠️, 🧠, 🟪, 📌) in the 📌-family content, so
// the lookahead accepts an optional emoji prefix.
const INCORRECT_SEC_RE =
  /An[aá]lise\s+das\s+alternativas\s+incorretas:\s*([\s\S]*?)(?=\n\s*(?:(?:⚠️|🧠|🟪|📌)\s*)?(?:PEGA REVALIDA|Resumo-chave|$))/i;

// Matches both legacy conventions: "🟪 Comentário:" (the dominant H5P paste)
// and "📌 Comentário clínico:" (a sister convention on ~8 pages). The leading
// emoji is optional; "clínico" is optional.
const COMENTARIO_RE = /(?:🟪|📌)?\s*Coment[aá]rio(?:\s+cl[ií]nico)?:/i;

const DISTRACTOR_LINE_RE = /\(([A-E])\)\s*([\s\S]*?)(?=\n\(\w\)|$)/g;

/**
 * Given the legacy correct-answer HTML feedback, returns:
 *   { explanationHtml, distractorFb: {A,B,C,D,E}, reason? }
 * If the feedback can't be safely migrated (no Comentário marker, embedded
 * media we'd destroy, etc.), returns { skip: true, reason }.
 */
function migrateLegacyFeedback(html) {
  if (!html) return { skip: true, reason: 'empty' };

  // Refuse to touch rows whose feedback contains content htmlToLines would
  // silently destroy. These get triaged manually.
  if (/<img\b/i.test(html)) return { skip: true, reason: 'contains <img>' };
  if (/<table\b/i.test(html)) return { skip: true, reason: 'contains <table>' };
  if (/<iframe\b/i.test(html)) return { skip: true, reason: 'contains <iframe>' };

  const text = htmlToLines(html);
  if (!text) return { skip: true, reason: 'empty after htmlToLines' };

  const startIdx = text.search(COMENTARIO_RE);
  if (startIdx === -1) return { skip: true, reason: 'no Comentário marker' };

  let comentario = text.slice(startIdx);

  // Pull out per-distractor blurbs, then strip the section so it doesn't
  // get rendered twice (once inside explanation_html, once next to the
  // wrong answer).
  const distractorFb = { A: null, B: null, C: null, D: null, E: null };
  const im = comentario.match(INCORRECT_SEC_RE);
  if (im) {
    const lines = [...im[1].matchAll(DISTRACTOR_LINE_RE)];
    for (const lm of lines) {
      distractorFb[lm[1]] = lm[2].trim();
    }
    comentario = comentario.replace(INCORRECT_SEC_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  if (!comentario) return { skip: true, reason: 'empty Comentário after extraction' };

  const explanationHtml = explanationTextToHtml(comentario);
  if (!explanationHtml) return { skip: true, reason: 'parser produced empty HTML' };

  return { explanationHtml, distractorFb };
}

// ---------- Main ----------

(async () => {
  try {
    const filterFrag = SLUG_FILTER ? db`AND p.slug = ${SLUG_FILTER}` : db``;
    const rows = await db`
      SELECT q.id, q.page_id, q.position, q.answers, q.explanation_html,
             p.slug, p.title AS page_title
      FROM quiz_questions q
      JOIN pages p ON p.id = q.page_id
      WHERE (q.explanation_html IS NULL OR length(q.explanation_html) = 0)
        AND q.answers::text ~* '🟪|📌|Coment[aá]rio|●'
        ${filterFrag}
      ORDER BY p.slug, q.position
    `;
    console.log(
      `Candidates: ${rows.length} quiz_questions row(s)` +
      (SLUG_FILTER ? ` (filter slug=${SLUG_FILTER})` : '') +
      `.\n`,
    );

    const updates = [];
    const skipped = []; // { id, slug, position, reason }
    let withDistractors = 0;

    for (const r of rows) {
      const correctIdx = r.answers.findIndex(a => a.correct);
      if (correctIdx === -1) {
        skipped.push({ id: r.id, slug: r.slug, position: r.position, reason: 'no correct answer' });
        continue;
      }
      const correctFb = r.answers[correctIdx].feedback || '';
      const result = migrateLegacyFeedback(correctFb);
      if (result.skip) {
        skipped.push({ id: r.id, slug: r.slug, position: r.position, reason: result.reason });
        continue;
      }

      const newAnswers = r.answers.map(a => ({ ...a }));
      const letters = ['A', 'B', 'C', 'D', 'E'];
      let touchedDistractors = 0;
      for (let i = 0; i < newAnswers.length; i++) {
        if (newAnswers[i].correct) continue;
        const L = letters[i];
        const blurb = result.distractorFb[L];
        // Only populate if currently empty — never clobber existing
        // per-distractor feedback that's already curated.
        if (blurb && !(newAnswers[i].feedback || '').trim()) {
          newAnswers[i].feedback = blurb;
          touchedDistractors++;
        }
      }
      if (touchedDistractors > 0) withDistractors++;
      newAnswers[correctIdx].feedback = '';

      updates.push({
        id: r.id,
        slug: r.slug,
        position: r.position,
        oldAnswers: r.answers,
        oldExplanationHtml: r.explanation_html,
        newAnswers,
        newExplanationHtml: result.explanationHtml,
        touchedDistractors,
      });
    }

    console.log('--- SUMMARY ---');
    console.log(`Will migrate:                       ${updates.length}`);
    console.log(`  with per-distractor extraction:   ${withDistractors}`);
    console.log(`  Comentário-only (no distractors): ${updates.length - withDistractors}`);
    console.log(`Skipped (need manual review):       ${skipped.length}`);

    if (skipped.length > 0) {
      const byReason = {};
      for (const s of skipped) byReason[s.reason] = (byReason[s.reason] || 0) + 1;
      console.log('\nSkip reasons:');
      for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${n.toString().padStart(4)}  ${reason}`);
      }
      if (VERBOSE) {
        console.log('\nAll skipped rows:');
        for (const s of skipped) console.log(`  qid=${s.id} ${s.slug}#${s.position}  (${s.reason})`);
      } else {
        console.log('\n(Re-run with --verbose to list every skipped row.)');
      }
    }

    if (updates.length > 0) {
      console.log('\n--- SAMPLE (first row to be written) ---');
      const u = updates[0];
      console.log(`qid=${u.id} slug=${u.slug} #${u.position}`);
      console.log(`new explanation_html (first 600 chars):`);
      console.log(u.newExplanationHtml.slice(0, 600));
      console.log('\nnew answers feedback:');
      for (let i = 0; i < u.newAnswers.length; i++) {
        const a = u.newAnswers[i];
        const fb = String(a.feedback || '');
        const tag = a.correct ? '✓' : ' ';
        console.log(`  [${tag}] (${'ABCDE'[i]}) feedback="${fb.slice(0, 120)}"${fb.length > 120 ? '…' : ''}`);
      }
    }

    if (!APPLY) {
      console.log('\nDRY RUN. Re-run with --apply to commit.');
      return;
    }

    console.log('\nCreating backup table…');
    await db`
      CREATE TABLE IF NOT EXISTS quiz_questions_feedback_backup_legacy_migration (
        question_id INT NOT NULL,
        original_answers JSONB NOT NULL,
        original_explanation_html TEXT,
        backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (question_id)
      )
    `;
    for (const u of updates) {
      await db`
        INSERT INTO quiz_questions_feedback_backup_legacy_migration
          (question_id, original_answers, original_explanation_html)
        VALUES (${u.id}, ${db.json(u.oldAnswers)}, ${u.oldExplanationHtml})
        ON CONFLICT (question_id) DO NOTHING
      `;
    }
    console.log(`Backed up ${updates.length} questions.`);

    console.log('\nApplying updates…');
    let applied = 0;
    await db.begin(async (sql) => {
      for (const u of updates) {
        await sql`
          UPDATE quiz_questions
          SET answers = ${sql.json(u.newAnswers)},
              explanation_html = ${u.newExplanationHtml}
          WHERE id = ${u.id}
        `;
        applied++;
      }
    });
    console.log(`Applied ${applied} updates.`);

    console.log('\nDONE.');
    console.log('Rollback:');
    console.log("  UPDATE quiz_questions q");
    console.log("  SET answers = b.original_answers,");
    console.log("      explanation_html = b.original_explanation_html");
    console.log("  FROM quiz_questions_feedback_backup_legacy_migration b");
    console.log("  WHERE b.question_id = q.id;");
  } catch (e) {
    console.error('ERROR', e);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
