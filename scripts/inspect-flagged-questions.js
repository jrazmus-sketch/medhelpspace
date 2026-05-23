'use strict';
/**
 * inspect-flagged-questions.js
 *
 * For each page+question flagged in _dryrun-results.json (WARN status),
 * extract that question's raw HTML AND its cleaned plain-text view from
 * the database. Output a side-by-side dump so we can see whether the
 * parser was correct to reject the question or if the parser is too strict.
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

// Mirror the parser's htmlToLines behavior so we can show what it sees.
const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&#8211;': '–', '&#8212;': '—',
  '&#8216;': '‘', '&#8217;': '’',
  '&#8220;': '“', '&#8221;': '”',
  '&#8230;': '…', '&#8203;': '',
  '&times;': '×',
};
function decodeEntities(s) { return s.replace(/&[a-zA-Z#0-9]+;/g, m => ENTITIES[m] ?? m); }
function htmlToLines(html) {
  let s = html;
  s = s.replace(/<br\s*\/?>/gi, '\n');
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
function splitQuestions(plainText) {
  const re = /^Quest[aã]o\s+(\d+)\b/gm;
  const matches = [...plainText.matchAll(re)].map(m => ({
    number: parseInt(m[1], 10), idx: m.index,
  }));
  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : plainText.length;
    out.push({ number: matches[i].number, text: plainText.slice(start, end).trim() });
  }
  return out;
}

// Parse the dryrun results and extract every WARN that's a single-question
// option-count defect plus the missing-marker / count-mismatch ones.
const dryrun = JSON.parse(fs.readFileSync(path.join(__dirname,'_dryrun-results.json'),'utf8'));
const flagged = [];
for (const r of dryrun) {
  if (r.status !== 'WARN') continue;
  for (const w of r.warnings) {
    // "Q9: Q9: expected 4 options, found 2"
    const m1 = w.match(/^Q(\d+): Q\d+: expected 4 options, found (\d+)$/);
    if (m1) {
      flagged.push({ slug: r.slug, qNum: parseInt(m1[1],10), found: parseInt(m1[2],10), kind: 'option-count', warning: w });
      continue;
    }
    // "Q4: Q4: missing "Alternativa correta" marker"
    const m2 = w.match(/^Q(\d+): Q\d+: missing "Alternativa correta" marker$/);
    if (m2) {
      flagged.push({ slug: r.slug, qNum: parseInt(m2[1],10), kind: 'missing-marker', warning: w });
      continue;
    }
    // "Q1: matching Respostas chunk not found" or other generic ones — collect but flag separately
    if (/matching Respostas chunk not found/.test(w)) {
      const m3 = w.match(/^Q(\d+):/);
      if (m3) flagged.push({ slug: r.slug, qNum: parseInt(m3[1],10), kind: 'no-respostas', warning: w });
    }
  }
}

(async () => {
  try {
    // Group by slug so we only fetch each page once
    const bySlug = {};
    for (const f of flagged) {
      (bySlug[f.slug] ||= []).push(f);
    }
    const slugs = Object.keys(bySlug).sort();

    const output = [];
    output.push(`=== Inspecting ${flagged.length} flagged question(s) across ${slugs.length} pages ===\n`);

    for (const slug of slugs) {
      const items = bySlug[slug];
      const pages = await db`SELECT id, title FROM pages WHERE slug = ${slug}`;
      if (pages.length === 0) { output.push(`MISSING PAGE: ${slug}\n`); continue; }
      const page = pages[0];

      const lessons = await db`
        SELECT id, title, body_html FROM lessons WHERE page_id = ${page.id} ORDER BY position
      `;
      const perguntas = lessons.find(l => /pergunta/i.test(l.title));
      const respostas = lessons.find(l => /resposta/i.test(l.title));

      output.push(`\n${'='.repeat(80)}`);
      output.push(`PAGE: ${slug}   (id=${page.id})`);
      output.push(`Lessons: ${lessons.map(l=>`"${l.title}"`).join(', ') || '(none)'}`);

      if (!perguntas) { output.push(`  ⚠ no Perguntas lesson found — skipping`); continue; }

      const pText = htmlToLines(perguntas.body_html);
      const qChunks = splitQuestions(pText);

      for (const item of items) {
        output.push(`\n--- Q${item.qNum} (${item.kind}) ---`);
        output.push(`Parser said: ${item.warning}`);

        if (item.kind === 'no-respostas') {
          // Show respostas full plain text trimmed to first 1000 chars
          if (!respostas) {
            output.push(`  No Respostas lesson at all!`);
          } else {
            const rText = htmlToLines(respostas.body_html);
            output.push(`Respostas plain text (first 800 chars):`);
            output.push(rText.slice(0, 800));
          }
          continue;
        }

        const chunk = qChunks.find(q => q.number === item.qNum);
        if (!chunk) {
          output.push(`  ⚠ Parser couldn't find Questão ${item.qNum} either — chunk missing`);
          continue;
        }

        // For option-count defects, show the cleaned plain text of the question
        // AND a search for any A/B/C/D markers regardless of anchor/case
        if (item.kind === 'option-count') {
          output.push(`Cleaned plain text (parser's view):`);
          output.push('-----');
          output.push(chunk.text);
          output.push('-----');

          // Now scan the raw HTML for any (A)/(B)/(C)/(D) candidates
          // First find this question's HTML span by looking for "Questão N" in raw HTML
          const rawHtml = perguntas.body_html;
          const qHeaderRe = new RegExp(`Quest[aã]o\\s*${item.qNum}\\b`, 'i');
          const headerIdx = rawHtml.search(qHeaderRe);
          let rawChunk = '';
          if (headerIdx > -1) {
            // Find next Questão N+1 header
            const nextHeaderRe = new RegExp(`Quest[aã]o\\s*${item.qNum+1}\\b`, 'i');
            const sliceAfter = rawHtml.slice(headerIdx);
            const nextIdx = sliceAfter.slice(20).search(nextHeaderRe);
            rawChunk = nextIdx > -1 ? sliceAfter.slice(0, nextIdx + 20) : sliceAfter.slice(0, 2000);
          }

          if (rawChunk) {
            // Look for any letter+paren patterns
            const candidates = [];
            const reList = [
              [/\(([A-Da-d])\)/g, 'std-paren'],
              [/（([A-Da-d])）/g, 'fullwidth-paren'],
              [/\b([A-Da-d])\)/g, 'no-open-paren'],
              [/\b([A-Da-d])\./g, 'letter-dot'],
              [/\b([A-Da-d])\s*[-–—]\s/g, 'letter-dash'],
            ];
            for (const [re, label] of reList) {
              for (const m of rawChunk.matchAll(re)) {
                candidates.push({label, letter: m[1], context: rawChunk.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g,' ')});
              }
            }
            if (candidates.length > 0) {
              output.push(`Letter markers found in raw HTML (any format):`);
              for (const c of candidates.slice(0, 20)) {
                output.push(`  [${c.label}] (${c.letter})  context: ...${c.context}...`);
              }
            } else {
              output.push(`No letter markers found at all in raw HTML for this question.`);
            }
            // Also dump first 400 chars of raw HTML for visual inspection
            output.push(`Raw HTML (first 400 chars):`);
            output.push(rawChunk.slice(0, 400).replace(/\s+/g,' '));
          } else {
            output.push(`Could not locate "Questão ${item.qNum}" in raw HTML.`);
          }
        }

        // For missing-marker defects, show the respostas chunk for that question
        if (item.kind === 'missing-marker') {
          if (!respostas) { output.push(`  No Respostas lesson!`); continue; }
          const rText = htmlToLines(respostas.body_html);
          const rChunks = splitQuestions(rText);
          const rChunk = rChunks.find(q => q.number === item.qNum);
          if (!rChunk) { output.push(`  Respostas chunk for Q${item.qNum} not found.`); continue; }
          output.push(`Respostas chunk plain text (first 600 chars):`);
          output.push(rChunk.text.slice(0, 600));
          // Scan for any 'correta' / 'resposta correta' / 'gabarito' variants
          const variants = [
            /Alternativa\s+correta/i,
            /Resposta\s+correta/i,
            /Gabarito/i,
            /Correta\s*:/i,
            /✔/u,
            /✓/u,
          ];
          output.push(`Marker variants seen in this chunk:`);
          for (const v of variants) {
            const m = rChunk.text.match(v);
            if (m) output.push(`  FOUND: ${v}  → "${rChunk.text.slice(Math.max(0,m.index-10), m.index+50).replace(/\s+/g,' ')}"`);
          }
        }
      }
    }

    const outPath = path.join(__dirname, '_inspect-flagged-questions.txt');
    fs.writeFileSync(outPath, output.join('\n'));
    console.log(`Wrote ${outPath}  (${output.length} lines)`);
  } finally {
    db.end();
  }
})();
