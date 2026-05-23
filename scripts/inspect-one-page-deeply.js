'use strict';
/**
 * inspect-one-page-deeply.js
 *
 * For a single page slug, dump the FULL cleaned plain text of the
 * Perguntas lesson with every "Questão N" header marked, so we can see
 * why splitQuestions is cutting chunks short.
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

const slug = process.argv[2] || 'anemia-falciforme-simulados';

(async () => {
  try {
    const pages = await db`SELECT id FROM pages WHERE slug = ${slug}`;
    if (!pages.length) throw new Error(`page not found: ${slug}`);
    const lessons = await db`
      SELECT id, title, body_html FROM lessons WHERE page_id = ${pages[0].id} ORDER BY position
    `;
    const perguntas = lessons.find(l => /pergunta/i.test(l.title));
    if (!perguntas) throw new Error('no perguntas lesson');

    const plainText = htmlToLines(perguntas.body_html);
    const lines = plainText.split('\n');

    // Find every occurrence of "Questão" (case/diacritic insensitive)
    const questaoRe = /Quest[aã]o\b/gi;
    const allMatches = [...plainText.matchAll(questaoRe)];
    console.log(`Total "Questão" occurrences (case/diacritic insensitive): ${allMatches.length}`);
    console.log(`First 30 chars around each:`);
    for (const m of allMatches) {
      const start = Math.max(0, m.index - 20);
      const ctx = plainText.slice(start, m.index + 30).replace(/\n/g, '⏎');
      const lineNum = plainText.slice(0, m.index).split('\n').length;
      console.log(`  line ${String(lineNum).padStart(3)} idx ${String(m.index).padStart(5)}: "${ctx}"`);
    }

    // Now also check the parser's exact regex: ^Quest[aã]o\s+(\d+)\b
    const parserRe = /^Quest[aã]o\s+(\d+)\b/gm;
    const parserMatches = [...plainText.matchAll(parserRe)].map(m => ({n: parseInt(m[1],10), idx: m.index}));
    console.log(`\nParser's splitQuestions matches (^Questão\\s+\\d+ at line start):`);
    for (const m of parserMatches) {
      const lineNum = plainText.slice(0, m.idx).split('\n').length;
      console.log(`  Q${m.n}  line ${lineNum}  idx ${m.idx}`);
    }

    // Print the FULL plain text with line numbers, marking lines that match the parser regex
    console.log(`\n=== FULL plain text (${lines.length} lines, ${plainText.length} chars) ===\n`);
    const parserIdxSet = new Set(parserMatches.map(m => {
      return plainText.slice(0, m.idx).split('\n').length;
    }));
    for (let i = 0; i < lines.length; i++) {
      const marker = parserIdxSet.has(i+1) ? '★' : ' ';
      // also mark any line that contains "Questão" but isn't at start
      const hasQuestao = /Quest[aã]o/i.test(lines[i]);
      const altMarker = (!parserIdxSet.has(i+1) && hasQuestao) ? '?' : '';
      console.log(`${marker}${altMarker} ${String(i+1).padStart(3)} | ${lines[i]}`);
    }
  } finally {
    db.end();
  }
})();
