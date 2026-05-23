'use strict';
/**
 * check-applied-for-corruption.js
 *
 * For every page already converted to h5p-quiz by our batch, re-parse with
 * the FIXED parser and compare the resulting question text + options against
 * what was actually inserted into quiz_questions. Report any divergence.
 *
 * Divergence = silent corruption from the bare-"<" bug.
 */
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
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
    // Get all simulado h5p-quiz pages whose source perguntas lesson body_html
    // contains a bare "<" (not followed by /, letter, or !).
    const candidates = await db`
      SELECT p.id, p.slug,
             (SELECT body_html FROM lessons l
                WHERE l.page_id = p.id AND l.title ILIKE '%pergunta%'
                LIMIT 1) AS perguntas_html
      FROM pages p
      WHERE p.type = 'h5p-quiz' AND p.slug LIKE '%-simulados'
    `;

    const suspect = candidates.filter(c => c.perguntas_html && /<(?![\/a-zA-Z!])/.test(c.perguntas_html));
    console.log(`Total *-simulados h5p-quiz pages: ${candidates.length}`);
    console.log(`Pages with bare "<" in perguntas body_html: ${suspect.length}\n`);

    if (suspect.length === 0) {
      console.log('No suspects. Nothing to repair.');
      return;
    }

    // For each suspect, re-parse with the fixed parser and compare the produced
    // stem text & option text against the rows currently in quiz_questions.
    const parserPath = path.join(__dirname, 'parse-simulados.js');
    const report = [];

    for (const sus of suspect) {
      const tmpOut = path.join(__dirname, `_check-${sus.slug}.json`);
      const proc = spawnSync(process.execPath, [parserPath, sus.slug, '--out', tmpOut], {encoding: 'utf8'});
      if (proc.status !== 0) {
        report.push({slug: sus.slug, status: 'PARSER_FAILED', detail: (proc.stderr||proc.stdout||'').slice(0,200)});
        continue;
      }
      const parsed = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
      fs.unlinkSync(tmpOut);

      if (parsed.warnings.length > 0) {
        report.push({slug: sus.slug, status: 'PARSER_WARNS_NOW', detail: parsed.warnings.join('; ')});
        continue;
      }

      // Fetch current quiz_questions rows for this page
      const existing = await db`
        SELECT position, question, answers
        FROM quiz_questions
        WHERE page_id = ${sus.id}
        ORDER BY position
      `;

      // Compare each question's stem (extract from "question" HTML — strip wrapper)
      // and each option text (strip the (X) <strong> wrapper).
      const diffs = [];
      for (const q of parsed.questions) {
        const dbQ = existing.find(e => e.position === q.position);
        if (!dbQ) { diffs.push(`Q${q.position}: missing in DB`); continue; }

        // The applier stored question as: <h3><strong>Qpos. Questão N</strong></h3>\n<p>line1</p>\n<p>line2</p>
        // To compare stem text content, strip HTML and collapse whitespace.
        const dbStemPlain = stripHtml(dbQ.question).replace(/\s+/g, ' ').trim();
        const parsedStemPlain = (`Q${q.position}. Questão ${q.number} ${q.stem}`).replace(/\s+/g, ' ').trim();
        if (dbStemPlain !== parsedStemPlain) {
          // Show a diff
          const dbLen = dbStemPlain.length;
          const psLen = parsedStemPlain.length;
          diffs.push(`Q${q.position} stem: db=${dbLen}ch, parsed=${psLen}ch (diff ${psLen - dbLen})`);
        }

        // Compare options
        for (let i = 0; i < q.answers.length; i++) {
          const dbAns = dbQ.answers[i];
          if (!dbAns) { diffs.push(`Q${q.position} option ${i+1}: missing in DB`); continue; }
          const dbOpt = stripHtml(dbAns.text).replace(/^\([A-D]\)\s*/, '').replace(/\s+/g,' ').trim();
          const psOpt = q.answers[i].text.replace(/\s+/g,' ').trim();
          if (dbOpt !== psOpt) {
            diffs.push(`Q${q.position} option ${String.fromCharCode(65+i)}: db="${dbOpt.slice(0,60)}..." parsed="${psOpt.slice(0,60)}..."`);
          }
        }
      }

      if (diffs.length === 0) {
        report.push({slug: sus.slug, status: 'CLEAN', detail: 'all stems + options match'});
      } else {
        report.push({slug: sus.slug, status: 'CORRUPTED', detail: diffs});
      }
    }

    // Summary
    const clean = report.filter(r => r.status === 'CLEAN').length;
    const corrupted = report.filter(r => r.status === 'CORRUPTED');
    const other = report.filter(r => !['CLEAN','CORRUPTED'].includes(r.status));

    console.log(`\n=== Summary ===`);
    console.log(`Clean (no divergence): ${clean}`);
    console.log(`Corrupted (need re-import): ${corrupted.length}`);
    console.log(`Other anomalies: ${other.length}`);

    if (corrupted.length) {
      console.log(`\n--- Corrupted pages ---`);
      for (const c of corrupted) {
        console.log(`\n  ${c.slug}`);
        for (const d of (Array.isArray(c.detail) ? c.detail : [c.detail])) {
          console.log(`    - ${d}`);
        }
      }
    }
    if (other.length) {
      console.log(`\n--- Other anomalies ---`);
      for (const o of other) console.log(`  [${o.status}] ${o.slug}  ${o.detail}`);
    }

    fs.writeFileSync(path.join(__dirname, '_corruption-check.json'), JSON.stringify(report, null, 2));
    console.log(`\nWrote scripts/_corruption-check.json`);
  } finally {
    db.end();
  }
})();

function stripHtml(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/&#8217;/g,"'").replace(/&#8220;/g,'"').replace(/&#8221;/g,'"');
}
