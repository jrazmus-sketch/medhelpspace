'use strict';
/**
 * parse-simulados.js
 *
 * Reads one *-simulados page from Supabase, parses its "Perguntas" + "Respostas"
 * lessons into structured quiz data, and dumps JSON to stdout (or a file).
 *
 * Usage:
 *   node scripts/parse-simulados.js <slug>            # prints to stdout
 *   node scripts/parse-simulados.js <slug> --out path # writes JSON to file
 *
 * Pure dry-run — never writes to the database.
 */
const fs = require('fs'), path = require('path');
const raw = fs.readFileSync(path.join(__dirname,'..','app','.env.local'),'utf8');
for (const line of raw.split('\n')) {
  const eq = line.indexOf('='); if (eq===-1) continue;
  const k=line.slice(0,eq).trim(), v=line.slice(eq+1).trim();
  if (!(k in process.env)) process.env[k]=v;
}
const postgres = require('postgres');

// ---------- HTML helpers ----------

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
  // Encode bare "<" that's not actually opening an HTML tag. Common cause:
  // lab reference values like "< 5 mg/L" — without this, the tag-stripper
  // <[^>]+> treats the bare "<" as a tag opener and eats everything up to
  // the next ">" (which is often the closing of the next real <br />).
  s = s.replace(/<(?![\/a-zA-Z!])/g, '&lt;');
  // Match <br>, <br/>, <br />, AND <br data-start="..." /> (with attributes).
  s = s.replace(/<br\b[^>]*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<\/div>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/​/g, ''); // strip ZWSP
  s = s.replace(/[ \t]+/g, ' ');
  s = s.split('\n').map(l => l.trim()).join('\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/**
 * Convert the cleaned plain-text explanation into rendering-friendly HTML.
 * The source format uses three bullet conventions:
 *   ● — main bullets under a heading
 *   🟣 — bullets in the "Resumo-chave" key-takeaways block
 *   ❌ — bullets in the "PEGA REVALIDA" pitfall block
 * Each "Heading:" line on its own becomes <h4>; bullet runs become <ul>.
 */
function explanationTextToHtml(text) {
  const lines = text.split('\n').map(l => l.trim());
  const out = [];
  let buf = []; // accumulating <li> items
  let bulletKind = null; // '●' | '🟣' | '❌' | null

  function flushList() {
    if (buf.length === 0) return;
    const cls = bulletKind === '🟣' ? ' class="resumo"' : bulletKind === '❌' ? ' class="pega"' : '';
    out.push(`<ul${cls}>${buf.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`);
    buf = [];
    bulletKind = null;
  }

  for (const line of lines) {
    if (line === '') { flushList(); continue; }
    const bulletMatch = line.match(/^([●🟣❌])\s*(.*)$/u);
    if (bulletMatch) {
      const kind = bulletMatch[1];
      if (bulletKind && bulletKind !== kind) flushList();
      bulletKind = kind;
      buf.push(bulletMatch[2].trim());
      continue;
    }
    flushList();
    // Headings end with ":"
    if (/:$/.test(line)) {
      // Strip leading emoji decoration like 🟪 / 🟣
      const cleaned = line.replace(/^[🟪🟣]\s*/u, '');
      out.push(`<h4>${escapeHtml(cleaned)}</h4>`);
    } else {
      out.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  flushList();
  return out.join('\n');
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- Question splitting ----------

function splitQuestions(plainText) {
  // Case-insensitive: some source pages use "QUESTÃO 1" all-caps.
  // No \b after \d+: some pages concatenate the header with question text
  // ("Questão 1Um homem de..."), giving a digit→letter transition that is
  // NOT a word boundary. \d+ is greedy so it still captures multi-digit
  // numbers like "10" correctly.
  const re = /^Quest[aã]o\s+(\d+)/gmi;
  const matches = [...plainText.matchAll(re)].map(m => ({
    number: parseInt(m[1], 10),
    idx: m.index,
  }));
  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : plainText.length;
    out.push({ number: matches[i].number, text: plainText.slice(start, end).trim() });
  }
  return out;
}

// ---------- Per-question parsing ----------

function parseQuestionChunk(chunkText, qNumber) {
  const firstNL = chunkText.indexOf('\n');
  const afterHeader = firstNL === -1 ? '' : chunkText.slice(firstNL + 1).trim();

  // Brazilian medical exams use 4 OR 5 options. Match (A)..(E) at line start.
  const optRe = /^\(([A-E])\)\s*/gm;
  const optMatches = [...afterHeader.matchAll(optRe)].map(m => ({
    letter: m[1],
    idx: m.index,
    after: m.index + m[0].length,
  }));
  if (optMatches.length < 4) {
    throw new Error(`Q${qNumber}: expected at least 4 options, found ${optMatches.length}`);
  }
  if (optMatches.length > 5) {
    throw new Error(`Q${qNumber}: expected 4 or 5 options, found ${optMatches.length}`);
  }

  const stem = afterHeader.slice(0, optMatches[0].idx).trim();

  // Iterate over however many options the question actually has (4 or 5).
  const options = [];
  for (let i = 0; i < optMatches.length; i++) {
    const start = optMatches[i].after;
    const end = i + 1 < optMatches.length ? optMatches[i + 1].idx : afterHeader.length;
    options.push(afterHeader.slice(start, end).trim());
  }
  return { stem, options };
}

function parseAnswerChunk(chunkText, qNumber) {
  // Accept (A)..(E) for the correct-answer marker.
  const correctRe = /Alternativa\s+correta:\s*\(([A-E])\)/i;
  const cm = chunkText.match(correctRe);
  if (!cm) throw new Error(`Q${qNumber}: missing "Alternativa correta" marker`);
  const correctLetter = cm[1];
  const correctIdx = chunkText.indexOf(cm[0]);
  const explanationRaw = chunkText.slice(correctIdx + cm[0].length).trim();

  const distractorFb = { A: null, B: null, C: null, D: null, E: null };
  const incorrectSecRe = /An[aá]lise\s+das\s+alternativas\s+incorretas:\s*([\s\S]*?)(?=\n\s*(?:PEGA REVALIDA|Resumo-chave|Quest[aã]o\s+\d|$))/i;
  const im = explanationRaw.match(incorrectSecRe);
  if (im) {
    const lineRe = /\(([A-E])\)\s*([\s\S]*?)(?=\n\(\w\)|$)/g;
    const lines = [...im[1].matchAll(lineRe)];
    for (const lm of lines) {
      distractorFb[lm[1]] = lm[2].trim();
    }
  }

  // Clean explanation: trim leading repeated correct-answer echo (everything before
  // the Comentário marker) and drop the distractor analysis block (it's already
  // captured into per-option feedback).
  let explanationClean = explanationRaw;
  const commentMarker = explanationClean.search(/🟪?\s*Coment[aá]rio:/i);
  if (commentMarker > -1) explanationClean = explanationClean.slice(commentMarker);
  if (im) {
    explanationClean = explanationClean.replace(incorrectSecRe, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  return { correctLetter, distractorFb, explanationText: explanationClean };
}

// ---------- Main ----------

(async () => {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: node scripts/parse-simulados.js <slug> [--out file]');
    process.exit(2);
  }
  const outIdx = process.argv.indexOf('--out');
  const outFile = outIdx > -1 ? process.argv[outIdx + 1] : null;

  const db = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const pages = await db`
      SELECT id, slug, title, type, specialty_id
      FROM pages WHERE slug = ${slug}
    `;
    if (pages.length === 0) throw new Error(`page not found: ${slug}`);
    const page = pages[0];

    const lessons = await db`
      SELECT id, position, title, body_html
      FROM lessons WHERE page_id = ${page.id}
      ORDER BY position
    `;

    const perguntas = lessons.find(l => /pergunta/i.test(l.title));
    const respostas = lessons.find(l => /resposta/i.test(l.title));
    if (!perguntas) throw new Error('no Perguntas lesson found');
    if (!respostas) throw new Error('no Respostas lesson found');

    const perguntasText = htmlToLines(perguntas.body_html);
    const respostasText = htmlToLines(respostas.body_html);

    const qChunks = splitQuestions(perguntasText);
    const aChunks = splitQuestions(respostasText);

    const result = {
      page: {
        id: String(page.id),
        slug: page.slug,
        title: page.title,
        specialty_id: page.specialty_id,
      },
      source_lesson_ids: {
        perguntas: String(perguntas.id),
        respostas: String(respostas.id),
      },
      counts: { perguntas: qChunks.length, respostas: aChunks.length },
      questions: [],
      warnings: [],
    };

    if (qChunks.length !== aChunks.length) {
      result.warnings.push(`question count mismatch: perguntas=${qChunks.length}, respostas=${aChunks.length}`);
    }

    for (let i = 0; i < qChunks.length; i++) {
      const q = qChunks[i];
      const a = aChunks[i];
      if (!a || a.number !== q.number) {
        result.warnings.push(`Q${q.number}: matching Respostas chunk not found`);
        continue;
      }
      try {
        const { stem, options } = parseQuestionChunk(q.text, q.number);
        const { correctLetter, distractorFb, explanationText } = parseAnswerChunk(a.text, q.number);

        // Letters array sized to actual option count (4 or 5).
        const letters = ['A','B','C','D','E'].slice(0, options.length);
        const answers = letters.map((L, idx) => ({
          text: options[idx],
          correct: L === correctLetter,
          feedback: L === correctLetter ? '' : (distractorFb[L] ?? ''),
        }));

        result.questions.push({
          number: q.number,
          position: q.number,
          stem,
          options: Object.fromEntries(letters.map((L,idx)=>[L, options[idx]])),
          correct: correctLetter,
          answers,
          distractor_feedback: distractorFb,
          explanation_text: explanationText,
          explanation_html: explanationTextToHtml(explanationText),
        });
      } catch (e) {
        result.warnings.push(`Q${q.number}: ${e.message}`);
      }
    }

    const json = JSON.stringify(result, null, 2);
    if (outFile) {
      fs.writeFileSync(outFile, json);
      console.log(`Wrote ${result.questions.length} questions to ${outFile} (warnings: ${result.warnings.length})`);
    } else {
      console.log(json);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    db.end();
  }
})();
