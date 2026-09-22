#!/usr/bin/env node
'use strict';

/**
 * parse-flashcards-docx.js — READ-ONLY parser + dry-run diff for Karina's full
 * flashcard replacement delivered 2026-09-22 as Word files (`*.md.docx`).
 *
 * It NEVER writes to any database and NEVER reads app/.env* (so it cannot find
 * the prod DATABASE_URL). The optional diff connects to the LOCAL Supabase only,
 * inside a READ ONLY transaction, and refuses any non-loopback host.
 *
 *   node scripts/parse-flashcards-docx.js                 # parse → parsed/flashcards-2026-09-22-{parsed.json,warnings.txt}
 *   node scripts/parse-flashcards-docx.js --diff          # + dry-run diff vs LOCAL → parsed/flashcards-2026-09-22-diff.{txt,json}
 *
 * Flags:
 *   --src <dir>       source root (default: Karina's 2026-09-22 download folder)
 *   --tag <yyyy-mm-dd> output file tag (default 2026-09-22)
 *   --diff            run the dry-run diff against the LOCAL test DB
 *   --db <url>        local DB url (default postgresql://postgres:postgres@127.0.0.1:55322/postgres);
 *                     must point at 127.0.0.1 / localhost / ::1
 *   --no-overlay      skip the "prod-only content known from parsed/parajustin-*.sql" section
 *
 * Source layout (the FOLDER is authoritative for specialty — June precedent):
 *   <root>/<specialty>/<file>.md.docx                  cirurgia-geral, emergencia, ginecologia, …, outros
 *   <root>/clinica-medica/<sub>/<file>.md.docx          the 11 clinical subspecialties
 *
 * Paragraph structure inside each docx (Word style in brackets):
 *   [Heading2] ===FILE: cirurgia-geral__apendicite.md===
 *   [Heading2] specialty: cirurgia-geral subject: Apendicite
 *   [Heading2] Card 1
 *   Qual padrão de dor é clássico da apendicite aguda?        <- block 1 = question
 *   (empty paragraph)
 *   Dor periumbilical ou epigástrica que migra para a FID.   <- block 2 = answer
 *   [Heading2] Card 2 …
 * The old `Pergunta:` / `Resposta:` labels were removed, but a file that still
 * carries them is accepted (labels stripped). Anything irregular (≠ 2 blocks,
 * multi-paragraph blocks, numbering gaps, …) is WARNED, never silently guessed.
 */

const fs = require('fs');
const path = require('path');
const { unzipSync, strFromU8 } = require(path.join(__dirname, '..', 'app', 'node_modules', 'fflate'));

// ── config ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const SRC = path.resolve(argVal('--src',
  'C:/Users/jrazm/OneDrive/Desktop/Medhelpspace/09-22-2026/flashcards-20260922T142541Z-1-001/flashcards'));
const TAG = argVal('--tag', '2026-09-22');
const DO_DIFF = args.includes('--diff');
const DO_OVERLAY = !args.includes('--no-overlay');
const LOCAL_DB = argVal('--db', 'postgresql://postgres:postgres@127.0.0.1:55322/postgres');
const OUT_DIR = path.join(__dirname, '..', 'parsed');
const OUT_JSON = path.join(OUT_DIR, `flashcards-${TAG}-parsed.json`);
const OUT_WARN = path.join(OUT_DIR, `flashcards-${TAG}-warnings.txt`);
const OUT_DIFF = path.join(OUT_DIR, `flashcards-${TAG}-diff.txt`);
const OUT_DIFF_JSON = path.join(OUT_DIR, `flashcards-${TAG}-diff.json`);

const CLINICA_MEDICA_SUBS = new Set([
  'cardiologia', 'dermatologia', 'endocrinologia', 'gastroenterologia', 'hematologia',
  'infectologia', 'nefrologia', 'neurologia', 'pneumologia', 'psiquiatria', 'reumatologia',
]);
const KNOWN_SPECS = new Set([
  ...CLINICA_MEDICA_SUBS, 'emergencia', 'cirurgia-geral', 'ginecologia', 'obstetricia',
  'pediatria', 'saude-coletiva', 'outros',
]);
const BS = String.fromCharCode(92); // a literal backslash, spelled out to survive any tooling

// ── text helpers ────────────────────────────────────────────────────────────────
function xmlDecode(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, '&');
}
const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', deg: '°', middot: '·', ordm: 'º', ordf: 'ª',
};
function htmlDecode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m);
}
// Markdown export backslash-escapes punctuation (\= \_ \- \( \. …). Medical
// Portuguese never uses a literal backslash, so drop a backslash before punctuation.
const RE_MD_ESCAPE = new RegExp(BS + BS + '([^0-9A-Za-z\\u00C0-\\u024F\\s])', 'g');
function unescapeMd(s) { return s.replace(RE_MD_ESCAPE, '$1'); }

/** Clean one paragraph / label; returns {text, scrubbed:[…what was removed]}. */
function cleanTracked(s) {
  const scrubbed = [];
  let t = String(s).normalize('NFC').replace(/\u00A0/g, ' ');
  if (/&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(t)) { t = htmlDecode(t); scrubbed.push('html-entity'); }
  if (t.includes(BS)) { const u = unescapeMd(t); if (u !== t) scrubbed.push('md-backslash'); t = u; }
  if (/<\/?[a-z][^>]*>/i.test(t)) { t = t.replace(/<\/?[a-z][^>]*>/gi, ''); scrubbed.push('html-tag'); }
  if (t.includes('**')) { t = t.replace(/\*\*/g, ''); scrubbed.push('md-bold'); }
  if (/(^|\s)__|__(\s|$)/.test(t)) { t = t.replace(/(^|\s)__|__(\s|$)/g, '$1$2'); scrubbed.push('md-underscore-bold'); }
  if (/^\s*[*_-]\s+/.test(t)) { t = t.replace(/^\s*[*_-]\s+/, ''); scrubbed.push('md-bullet'); }
  if (/^\s*#{1,6}\s+/.test(t)) { t = t.replace(/^\s*#{1,6}\s+/, ''); scrubbed.push('md-heading'); }
  t = t.replace(/[ \t\r\n\f\v]+/g, ' ').trim();
  return { text: t, scrubbed };
}
const clean = (s) => cleanTracked(s).text;

/** Label key for subject matching: strip tags, decode entities, trim, casefold, strip accents. */
function labelKey(s) {
  return clean(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
/** Strict card-text key: cleaned, NFC, whitespace-collapsed. */
const strictKey = (s) => clean(s || '');
/** Loose card-text key: + casefold, accents, punctuation. */
function looseKey(s) {
  return clean(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function slugify(s) { return looseKey(s).replace(/ /g, '-'); }

const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'na', 'no', 'nas', 'nos', 'em', 'a', 'o', 'as', 'os', 'por', 'para', 'com']);
function tokenDice(a, b) {
  const A = new Set(looseKey(a).split(' ').filter((w) => w && !STOP.has(w)));
  const B = new Set(looseKey(b).split(' ').filter((w) => w && !STOP.has(w)));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return (2 * inter) / (A.size + B.size);
}
function bigrams(s) {
  const t = looseKey(s).replace(/ /g, '');
  const m = new Map();
  for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
  return { m, n: Math.max(0, t.length - 1) };
}
function bigramDiceB(A, B) {
  if (!A.n || !B.n) return 0;
  let inter = 0;
  for (const [g, c] of A.m) { const d = B.m.get(g); if (d) inter += Math.min(c, d); }
  return (2 * inter) / (A.n + B.n);
}
const bigramDice = (a, b) => bigramDiceB(bigrams(a), bigrams(b));
const labelSim = (a, b) => Math.max(tokenDice(a, b), bigramDice(a, b));
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—');

// ── docx → paragraphs ───────────────────────────────────────────────────────────
function docxParagraphs(file) {
  const zip = unzipSync(new Uint8Array(fs.readFileSync(file)));
  if (!zip['word/document.xml']) throw new Error('no word/document.xml');
  const xml = strFromU8(zip['word/document.xml']);
  const features = [];
  for (const [tag, name] of [['<w:tbl', 'table'], ['<w:drawing', 'image'], ['<w:pict', 'image'],
    ['<w:ins ', 'tracked-insert'], ['<w:del ', 'tracked-delete'], ['<w:numPr', 'list'], ['<w:hyperlink', 'hyperlink']]) {
    if (xml.includes(tag)) features.push(name);
  }
  const paras = [];
  for (const pm of xml.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const p = pm[1] || '';
    const style = (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
    let text = '';
    let lineBreak = false;
    // deleted text (<w:delText>) is intentionally NOT read
    for (const t of p.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>|<w:cr\/>/g)) {
      if (t[1] != null) text += xmlDecode(t[1]);
      else if (t[0] === '<w:tab/>') text += ' ';
      else { text += '\n'; lineBreak = true; }
    }
    const bold = /<w:b\/>|<w:b w:val="(?:1|true|on)"\/>/.test(p);
    paras.push({ style, text, bold, lineBreak });
  }
  return { paras, features };
}

// ── one file → subject ──────────────────────────────────────────────────────────
function specFromRel(rel) {
  const parts = rel.split(/[\\/]/);
  if (parts[0] === 'clinica-medica') return parts.length >= 3 ? parts[1] : null;
  return parts.length >= 2 ? parts[0] : null;
}
/** "cirurgia-geral__tumor-de-pancreas(1).md.docx" → {base:"cirurgia-geral__tumor-de-pancreas.md", prefix, slug, dlSuffix} */
function fileParts(fileName) {
  let b = fileName.replace(/\.docx$/i, '');
  const dl = b.match(/\((\d+)\)(?=\.md$|$)/);
  b = b.replace(/\(\d+\)(?=\.md$|$)/, '');
  const noMd = b.replace(/\.md$/i, '');
  const i = noMd.indexOf('__');
  return { base: b, prefix: i >= 0 ? noMd.slice(0, i) : null, slug: i >= 0 ? noMd.slice(i + 2) : noMd, dlSuffix: dl ? dl[0] : null };
}

function parseFile(file, rel) {
  const issues = []; // {sev, code, msg}
  const warn = (sev, code, msg) => issues.push({ sev, code, msg });
  const spec = specFromRel(rel);
  const fileName = path.basename(file);
  const fp = fileParts(fileName);
  if (!spec) warn('ERROR', 'no-folder-specialty', 'file is not inside a specialty folder');
  else if (!KNOWN_SPECS.has(spec)) warn('ERROR', 'unknown-folder-specialty', `folder "${spec}" is not a known specialty slug`);
  if (fp.dlSuffix) warn('INFO', 'download-suffix', `file name carries a download suffix ${fp.dlSuffix}`);

  const { paras, features } = docxParagraphs(file);
  for (const f of features) if (f !== 'list') warn('WARN', `docx-${f}`, `document contains a ${f} (not represented in plain-text cards)`);

  let fileHeader = null, headerSpecialty = null, subject = null;
  const cards = [];
  let cur = null;
  const scrubCounts = {};
  for (const p of paras) {
    const raw = p.text;
    const isHeading = /^heading/i.test(p.style);
    const t = clean(raw);
    const tHead = t.replace(/^#+\s*/, '');
    let m;
    if ((m = tHead.match(/^=+\s*FILE:\s*(.+?)\s*=+$/i))) {
      if (fileHeader) warn('WARN', 'second-file-header', `second ===FILE header: ${m[1]}`);
      fileHeader = m[1]; continue;
    }
    if ((m = tHead.match(/^specialty:\s*(.+?)\s+subject:\s*(.+)$/i))) {
      if (subject) warn('WARN', 'second-subject-header', `second specialty/subject header: ${tHead}`);
      headerSpecialty = m[1].trim(); subject = m[2].trim(); continue;
    }
    if ((m = tHead.match(/^subject:\s*(.+)$/i)) && !cur) { subject = m[1].trim(); continue; }
    if ((m = tHead.match(/^specialty:\s*(.+)$/i)) && !cur) { headerSpecialty = m[1].trim(); continue; }
    if ((m = tHead.match(/^Card\s*(\d+)\s*[:.]?$/i))) {
      if (!isHeading) warn('INFO', 'card-marker-not-heading', `"${tHead}" is not styled as a heading`);
      cur = { n: Number(m[1]), paras: [] };
      cards.push(cur);
      continue;
    }
    if (isHeading && t) warn('WARN', 'unexpected-heading', `unexpected heading ${cur ? `inside card ${cur.n}` : 'before first card'}: "${t.slice(0, 80)}"`);
    if (!cur) { if (t) warn('WARN', 'text-before-first-card', `text before the first card: "${t.slice(0, 80)}"`); continue; }
    cur.paras.push(p);
  }

  if (!fileHeader) warn('WARN', 'no-file-header', 'missing ===FILE: …=== header');
  if (!subject) warn('ERROR', 'no-subject', 'missing "specialty: … subject: …" header');

  // header checks
  if (headerSpecialty && spec && slugify(headerSpecialty) !== spec) {
    warn('WARN', 'header-specialty-mismatch', `header specialty "${headerSpecialty}" ≠ folder "${spec}" (folder wins)`);
  }
  if (fileHeader) {
    const fh = fileHeader.replace(/\(\d+\)(?=\.md$|$)/, '');
    if (fh !== fp.base) warn('WARN', 'file-header-name-mismatch', `===FILE: ${fileHeader}=== ≠ file name "${fp.base}"`);
    const fhp = fileParts(fh + '.docx');
    if (fhp.prefix && spec && fhp.prefix !== spec) warn('WARN', 'file-header-prefix-mismatch', `===FILE prefix "${fhp.prefix}" ≠ folder "${spec}"`);
  }
  if (fp.prefix && spec && fp.prefix !== spec) warn('WARN', 'filename-prefix-mismatch', `file-name prefix "${fp.prefix}" ≠ folder "${spec}"`);
  if (subject && slugify(subject) !== fp.slug) {
    const noStop = (s) => s.split('-').filter((w) => w && !STOP.has(w)).join('-');
    if (noStop(slugify(subject)) === noStop(fp.slug)) {
      warn('INFO', 'filename-subject-stopwords', `file slug "${fp.slug}" ≈ subject "${subject}" (differs only by e/de/no…)`);
    } else {
      warn('WARN', 'filename-subject-mismatch', `file slug "${fp.slug}" ≠ subject "${subject}" (slug "${slugify(subject)}")`);
    }
  }

  // numbering checks
  const nums = cards.map((c) => c.n);
  const seen = new Set(); const dups = new Set();
  for (const n of nums) { if (seen.has(n)) dups.add(n); seen.add(n); }
  if (dups.size) warn('WARN', 'card-number-duplicate', `duplicate card numbers: ${[...dups].join(', ')}`);
  if (nums.length) {
    const max = Math.max(...nums);
    const missing = []; for (let i = 1; i <= max; i++) if (!seen.has(i)) missing.push(i);
    if (missing.length) warn('WARN', 'card-number-gap', `missing card numbers: ${missing.join(', ')}`);
    if (nums.some((n, i) => i > 0 && n <= nums[i - 1]) && !dups.size) warn('WARN', 'card-number-order', `card numbers out of order: ${nums.join(',')}`);
  }

  // cards → {n, q, a}
  const out = [];
  let noQMark = 0;
  for (const c of cards) {
    const lines = c.paras.map((p) => { const r = cleanTracked(p.text); r.scrubbed.forEach((k) => { scrubCounts[k] = (scrubCounts[k] || 0) + 1; }); return { ...p, clean: r.text }; });
    if (lines.some((p) => p.lineBreak && p.clean)) warn('INFO', 'line-break-in-paragraph', `card ${c.n}: manual line break inside a paragraph (joined with a space)`);
    if (lines.some((p) => p.bold && p.clean)) warn('INFO', 'bold-text', `card ${c.n}: bold run in card body`);
    // blocks = runs of non-empty paragraphs separated by ≥1 empty paragraph
    const blocks = [];
    let b = null;
    for (const p of lines) {
      if (!p.clean) { b = null; continue; }
      if (!b) { b = []; blocks.push(b); }
      b.push(p.clean);
    }
    let q = '', a = '';
    const full = blocks.map((x) => x.join('\n')).join('\n\n');
    const lab = full.match(/^\s*Pergunta\s*:\s*([\s\S]*?)\s*Resposta\s*:\s*([\s\S]*)$/i);
    if (lab) {
      q = lab[1]; a = lab[2];
      warn('INFO', 'pergunta-resposta-labels', `card ${c.n}: Pergunta:/Resposta: labels present (stripped)`);
    } else if (/(^|\n)\s*(Pergunta|Resposta)\s*:/i.test(full)) {
      warn('WARN', 'partial-labels', `card ${c.n}: only one of Pergunta:/Resposta: present — used block order`);
    }
    if (!lab) {
      if (blocks.length === 2) {
        q = blocks[0].join(' '); a = blocks[1].join(' ');
        if (blocks[0].length > 1) warn('WARN', 'multi-paragraph-question', `card ${c.n}: question spans ${blocks[0].length} paragraphs (joined)`);
        if (blocks[1].length > 1) warn('WARN', 'multi-paragraph-answer', `card ${c.n}: answer spans ${blocks[1].length} paragraphs (joined)`);
      } else if (blocks.length > 2) {
        q = blocks[0].join(' '); a = blocks.slice(1).map((x) => x.join(' ')).join(' ');
        warn('WARN', 'more-than-2-blocks', `card ${c.n}: ${blocks.length} blocks — block 1 used as question, blocks 2..${blocks.length} joined as answer`);
      } else if (blocks.length === 1) {
        if (blocks[0].length === 2) {
          q = blocks[0][0]; a = blocks[0][1];
          warn('WARN', 'no-blank-separator', `card ${c.n}: question and answer not separated by an empty paragraph (split on paragraphs)`);
        } else if (blocks[0].length > 2) {
          q = blocks[0][0]; a = blocks[0].slice(1).join(' ');
          warn('WARN', 'ambiguous-single-block', `card ${c.n}: one block of ${blocks[0].length} paragraphs — first used as question`);
        } else {
          q = blocks[0][0];
        }
      }
    }
    q = clean(q); a = clean(a);
    if (!q) warn('ERROR', 'empty-question', `card ${c.n}: empty question`);
    if (!a) warn('ERROR', 'empty-answer', `card ${c.n}: empty answer`);
    if (q && !/[?]\s*$/.test(q)) {
      noQMark++;
      if (/[?]\s*$/.test(a)) warn('WARN', 'possible-swap', `card ${c.n}: answer ends with "?" but question does not — swapped?`);
    }
    out.push({ n: c.n, q, a });
  }
  if (noQMark) warn('INFO', 'question-without-qmark', `${noQMark} question(s) do not end with "?"`);
  for (const [k, n] of Object.entries(scrubCounts)) warn('INFO', `scrubbed-${k}`, `${n} paragraph(s) had ${k} artifacts removed`);
  if (!out.length) warn('ERROR', 'zero-cards', 'no cards parsed');
  else if (out.length < 15 || out.length > 40) warn('INFO', 'unusual-card-count', `${out.length} cards (typical band 15–40)`);
  const subjectIsSlug = !!subject && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subject.trim());
  if (subjectIsSlug) warn('WARN', 'subject-is-slug', `subject header "${subject}" is a slug, not a display label (no accents/casing) — import must supply the label`);
  else if (subject && /[a-zà-ÿ]/.test(subject) && subject === subject.toLowerCase()) warn('INFO', 'lowercase-label', `subject "${subject}" is all lowercase`);

  // duplicate questions within the subject
  const qSeen = new Map();
  for (const c of out) {
    const k = looseKey(c.q); if (!k) continue;
    if (qSeen.has(k)) warn('WARN', 'duplicate-question', `card ${c.n} repeats the question of card ${qSeen.get(k)}`);
    else qSeen.set(k, c.n);
  }

  return {
    spec, subject: subject ? clean(subject) : null, file: fileName, relPath: rel.replace(/\\/g, '/'),
    headerSpecialty, fileHeader, subjectIsSlug, cards: out, issues,
  };
}

function walk(dir, root = dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(full, root));
    else out.push(path.relative(root, full));
  }
  return out;
}

// ── parse all ───────────────────────────────────────────────────────────────────
function parseAll() {
  if (!fs.existsSync(SRC)) { console.error(`Source dir not found: ${SRC}`); process.exit(1); }
  const all = walk(SRC).sort();
  const docx = all.filter((r) => /\.docx$/i.test(r) && !path.basename(r).startsWith('~$'));
  const other = all.filter((r) => !docx.includes(r));
  const subjects = docx.map((rel) => {
    try { return parseFile(path.join(SRC, rel), rel); }
    catch (e) { return { spec: specFromRel(rel), subject: null, file: path.basename(rel), relPath: rel, cards: [], issues: [{ sev: 'ERROR', code: 'unreadable', msg: e.message }] }; }
  });
  // cross-file checks: duplicate subject within a deck
  const byDeck = new Map();
  for (const s of subjects) {
    if (!s.spec) continue;
    if (!byDeck.has(s.spec)) byDeck.set(s.spec, []);
    byDeck.get(s.spec).push(s);
  }
  for (const [spec, list] of byDeck) {
    const byKey = new Map();
    for (const s of list) {
      const k = labelKey(s.subject || s.file);
      if (byKey.has(k)) {
        s.issues.push({ sev: 'ERROR', code: 'duplicate-subject', msg: `subject "${s.subject}" duplicates ${byKey.get(k).relPath} in deck ${spec}` });
      } else byKey.set(k, s);
    }
    // duplicate questions across subjects in the same deck (cheap signal of copy/paste)
    const qMap = new Map();
    for (const s of list) for (const c of s.cards) {
      const k = looseKey(c.q); if (!k) continue;
      const prev = qMap.get(k);
      if (prev && prev.s !== s) s.issues.push({ sev: 'INFO', code: 'duplicate-question-in-deck', msg: `card ${c.n} repeats a question from "${prev.s.subject}" card ${prev.n}` });
      else if (!prev) qMap.set(k, { s, n: c.n });
    }
  }
  subjects.sort((a, b) => (a.spec || '').localeCompare(b.spec || '') ||
    (a.subject || a.file).localeCompare(b.subject || b.file, 'pt', { sensitivity: 'base' }));
  return { subjects, other, byDeck };
}

function writeParseOutputs({ subjects, other, byDeck }) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const json = subjects.map((s) => ({
    spec: s.spec, subject: s.subject, file: s.file, relPath: s.relPath,
    headerSpecialty: s.headerSpecialty ?? null, subjectIsSlug: !!s.subjectIsSlug, cards: s.cards,
  }));
  fs.writeFileSync(OUT_JSON, JSON.stringify(json, null, 2), 'utf8');

  const totalCards = subjects.reduce((n, s) => n + s.cards.length, 0);
  const counts = {};
  for (const s of subjects) for (const i of s.issues) { const k = `${i.sev.padEnd(5)} ${i.code}`; counts[k] = (counts[k] || 0) + 1; }
  const L = [];
  L.push(`FLASHCARDS PARSE — ${TAG}`);
  L.push(`source : ${SRC}`);
  L.push(`output : ${path.relative(path.join(__dirname, '..'), OUT_JSON)}`);
  L.push(`files  : ${subjects.length} docx` + (other.length ? `  (+${other.length} non-docx ignored: ${other.map((o) => o.replace(/\\/g, '/')).join(', ')})` : ''));
  L.push(`decks  : ${byDeck.size}   subjects: ${subjects.length}   cards: ${totalCards}`);
  L.push('');
  L.push('Per deck:');
  for (const [spec, list] of [...byDeck].sort((a, b) => a[0].localeCompare(b[0]))) {
    L.push(`  ${spec.padEnd(18)} ${String(list.length).padStart(3)} subjects  ${String(list.reduce((n, s) => n + s.cards.length, 0)).padStart(5)} cards`);
  }
  L.push('');
  L.push('Issue counts (occurrences; ERROR blocks import, WARN needs a human look, INFO is informational):');
  const keys = Object.keys(counts).sort((a, b) => ['ERROR', 'WARN ', 'INFO '].indexOf(a.slice(0, 5)) - ['ERROR', 'WARN ', 'INFO '].indexOf(b.slice(0, 5)) || a.localeCompare(b));
  if (!keys.length) L.push('  (none)');
  for (const k of keys) L.push(`  ${k.padEnd(48)} ${counts[k]}`);
  L.push('');
  L.push('Per file (ERROR + WARN first, then INFO):');
  for (const s of subjects) {
    if (!s.issues.length) continue;
    const sorted = [...s.issues].sort((a, b) => ['ERROR', 'WARN', 'INFO'].indexOf(a.sev) - ['ERROR', 'WARN', 'INFO'].indexOf(b.sev));
    L.push(`- ${s.relPath}  [${s.subject ?? '??'} · ${s.cards.length} cards]`);
    for (const i of sorted) L.push(`    ${i.sev.padEnd(5)} ${i.code}: ${i.msg}`);
  }
  fs.writeFileSync(OUT_WARN, L.join('\n') + '\n', 'utf8');
  return { totalCards, counts, text: L.join('\n') };
}

// ── diff helpers ────────────────────────────────────────────────────────────────
/**
 * Match new cards to old cards inside one subject. Passes, each greedy and
 * same-position-first: strict q+a → loose q+a → loose q (answer changed) →
 * loose a (question changed; answers ≥ 25 chars only, "Sim."/"Não." would
 * false-match) → fuzzy q (bigram Dice ≥ REWORD_MIN, "reworded"). Whatever is
 * left is new (INSERT) or dropped. "reworded" is a HEURISTIC upper bound: spot
 * checks at 0.60–0.70 were mostly different cards on the same theme.
 */
const REWORD_MIN = 0.7;
function matchCards(oldCards, newCards) {
  const O = oldCards.map((c, i) => ({ i, c, sq: strictKey(c.q), sa: strictKey(c.a), lq: looseKey(c.q), la: looseKey(c.a), bq: bigrams(c.q) }));
  const N = newCards.map((c, i) => ({ i, c, sq: strictKey(c.q), sa: strictKey(c.a), lq: looseKey(c.q), la: looseKey(c.a), bq: bigrams(c.q) }));
  const newTo = new Array(N.length).fill(null); // {oi, kind}
  const oldUsed = new Array(O.length).fill(false);
  const passes = [
    ['identical', (o, n) => o.sq === n.sq && o.sa === n.sa],
    ['cosmetic', (o, n) => o.lq === n.lq && o.la === n.la],
    ['answer-changed', (o, n) => o.lq && o.lq === n.lq],
    ['question-changed', (o, n) => o.la.length >= 25 && o.la === n.la],
    ['reworded', (o, n) => bigramDiceB(o.bq, n.bq) >= REWORD_MIN],
  ];
  for (const [kind, eq] of passes) {
    // same position first
    for (const n of N) {
      if (newTo[n.i]) continue;
      const o = O[n.i];
      if (o && !oldUsed[o.i] && eq(o, n)) { newTo[n.i] = { oi: o.i, kind }; oldUsed[o.i] = true; }
    }
    for (const n of N) {
      if (newTo[n.i]) continue;
      let best = null, bestScore = -1;
      for (const o of O) {
        if (oldUsed[o.i] || !eq(o, n)) continue;
        const score = kind === 'reworded' ? bigramDiceB(o.bq, n.bq) : -Math.abs(o.i - n.i);
        if (score > bestScore) { best = o; bestScore = score; }
      }
      if (best) { newTo[n.i] = { oi: best.i, kind }; oldUsed[best.i] = true; }
    }
  }
  const r = { old: O.length, new: N.length, identicalSamePos: 0, identicalMoved: 0, cosmetic: 0, answerChanged: 0,
    questionChanged: 0, reworded: 0, added: 0, dropped: 0, posSafe: 0, posUnsafe: 0, oldFate: new Array(O.length).fill('dropped') };
  newTo.forEach((m, ni) => {
    if (!m) { r.added++; return; }
    r.oldFate[m.oi] = m.kind;
    if (m.kind === 'identical') { if (m.oi === ni) r.identicalSamePos++; else r.identicalMoved++; }
    else if (m.kind === 'cosmetic') r.cosmetic++;
    else if (m.kind === 'answer-changed') r.answerChanged++;
    else if (m.kind === 'question-changed') r.questionChanged++;
    else r.reworded++;
  });
  r.dropped = oldUsed.filter((u) => !u).length;
  // Position-keyed UPDATE safety: does new[i] correspond to old[i]?
  for (let i = 0; i < Math.min(O.length, N.length); i++) {
    if (newTo[i] && newTo[i].oi === i) r.posSafe++; else r.posUnsafe++;
  }
  // fate of old card under a position-keyed update
  r.oldPosFate = O.map((o) => (o.i >= N.length ? 'no-position (deleted/kept as leftover)' : (newTo[o.i] && newTo[o.i].oi === o.i ? 'same card' : 'DIFFERENT card')));
  return r;
}
const SUM_KEYS = ['old', 'new', 'identicalSamePos', 'identicalMoved', 'cosmetic', 'answerChanged', 'questionChanged', 'reworded', 'added', 'dropped', 'posSafe', 'posUnsafe'];
function addInto(acc, r) { for (const k of SUM_KEYS) acc[k] = (acc[k] || 0) + (r[k] || 0); return acc; }
function fmtMatch(r) {
  const unchanged = r.identicalSamePos + r.identicalMoved;
  return `${r.old}→${r.new} | identical ${unchanged} (same pos ${r.identicalSamePos}, moved ${r.identicalMoved}) · cosmetic ${r.cosmetic}` +
    ` · answer-changed ${r.answerChanged} · question-changed ${r.questionChanged} · reworded ${r.reworded}` +
    ` · NEW ${r.added} · DROPPED ${r.dropped} | position-key: ${r.posSafe} same card / ${r.posUnsafe} DIFFERENT card`;
}

/** Content overlap of old subject A into new subject B: share of A's questions that reappear (loose or fuzzy ≥ 0.6). */
function contentOverlap(oldCards, newCards) {
  if (!oldCards.length || !newCards.length) return 0;
  const nb = newCards.map((c) => ({ l: looseKey(c.q), b: bigrams(c.q) }));
  let hit = 0;
  for (const c of oldCards) {
    const l = looseKey(c.q), b = bigrams(c.q);
    if (nb.some((x) => x.l === l || bigramDiceB(x.b, b) >= 0.6)) hit++;
  }
  return hit / oldCards.length;
}

function parseAcTranscript(html) {
  const out = [];
  const re = /<p class="ac-q">([\s\S]*?)<\/p>\s*<p class="ac-a">([\s\S]*?)<\/p>/g;
  for (const m of (html || '').matchAll(re)) {
    out.push({ q: clean(m[1].replace(/<strong>\s*Pergunta:\s*<\/strong>/i, '')), a: clean(m[2].replace(/<strong>\s*Resposta:\s*<\/strong>/i, '')) });
  }
  return out;
}
function transcriptCompare(pairs, cards) {
  if (!pairs.length) return { state: 'no-transcript', same: 0, total: cards.length };
  let strict = 0, loose = 0;
  for (let i = 0; i < Math.min(pairs.length, cards.length); i++) {
    if (strictKey(pairs[i].q) === strictKey(cards[i].q) && strictKey(pairs[i].a) === strictKey(cards[i].a)) strict++;
    if (looseKey(pairs[i].q) === looseKey(cards[i].q) && looseKey(pairs[i].a) === looseKey(cards[i].a)) loose++;
  }
  const n = Math.max(pairs.length, cards.length);
  const state = strict === n && pairs.length === cards.length ? 'identical'
    : loose === n && pairs.length === cards.length ? 'cosmetic-only' : 'CHANGED';
  return { state, same: loose, total: n, oldPairs: pairs.length, newCards: cards.length };
}

/** Parse flashcard INSERT rows from a parsed/*.sql patch (prod-only content not on local). */
function parseSqlFlashcards(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const q = "'((?:[^']|'')*)'";
  const re = new RegExp(`^\\((?:\\(SELECT id FROM pages WHERE slug='([^']+)'\\)|(\\d+)), (\\d+), ${q}, (\\d+), ${q}, ${q}\\)[,;]\\s*$`, 'gm');
  const rows = [];
  for (const m of txt.matchAll(re)) {
    const un = (s) => s.replace(/''/g, "'");
    rows.push({ pageSlug: m[1] || null, pageId: m[2] ? Number(m[2]) : null, group_position: Number(m[3]), group_label: un(m[4]), position: Number(m[5]), text: un(m[6]), answer: un(m[7]) });
  }
  return rows;
}

// ── diff vs LOCAL ───────────────────────────────────────────────────────────────
async function runDiff(parsed) {
  const u = new URL(LOCAL_DB);
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(u.hostname)) {
    console.error(`REFUSING: --db host "${u.hostname}" is not local. This diff only ever reads the LOCAL test DB.`);
    process.exit(2);
  }
  const postgres = require(path.join(__dirname, '..', 'node_modules', 'postgres'));
  const db = postgres(LOCAL_DB, { max: 1, connect_timeout: 10, idle_timeout: 0, onnotice: () => {} });
  const L = [];
  const J = { tag: TAG, db: `${u.hostname}:${u.port}`, decks: [], totals: {}, audiocards: [], history: {} };
  const out = (s = '') => L.push(s);
  try {
    const data = await db.begin('READ ONLY', async (tx) => {
      const specialties = await tx`SELECT id, slug FROM specialties`;
      const deckPages = await tx`SELECT id, slug, specialty_id, status FROM pages WHERE track_id = 3 AND slug LIKE '%-flashcards' ORDER BY slug`;
      const items = await tx`SELECT id, page_id, group_label, group_position, position, text, answer FROM flashcard_items ORDER BY page_id, group_position, position`;
      const acPages = await tx`SELECT id, slug, specialty_id FROM pages WHERE track_id = 2 AND slug LIKE '%-audiocards' ORDER BY slug`;
      const acLessons = acPages.length ? await tx`SELECT id, page_id, position, title, audio_url, body_html FROM lessons WHERE page_id IN ${tx(acPages.map((p) => p.id))} ORDER BY page_id, position` : [];
      const rs = await tx`SELECT rs.id, rs.user_id, rs.item_id, (fi.id IS NULL) AS orphan FROM review_schedule rs LEFT JOIN flashcard_items fi ON fi.id = rs.item_id WHERE rs.item_type = 'flashcard'`;
      const att = await tx`SELECT flashcard_item_id AS item_id, user_id FROM flashcard_attempts`;
      const prog = await tx`SELECT flashcard_item_id AS item_id, user_id FROM flashcard_progress`;
      const themes = await tx`SELECT specialty_id, group_label, topic_id FROM flashcard_theme_topics`;
      const leadsFc = await tx`SELECT id, fc_progress FROM leads WHERE fc_progress IS NOT NULL AND fc_progress <> '{}'::jsonb`;
      const lessonHist = acLessons.length ? {
        completions: (await tx`SELECT count(*)::int n FROM lesson_completions WHERE lesson_id IN ${tx(acLessons.map((l) => l.id))}`)[0].n,
        progress: (await tx`SELECT count(*)::int n FROM lesson_progress WHERE lesson_id IN ${tx(acLessons.map((l) => l.id))}`)[0].n,
      } : { completions: 0, progress: 0 };
      const fks = await tx`
        SELECT c.conrelid::regclass::text AS tbl, pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c
        WHERE c.contype = 'f' AND c.confrelid IN ('public.flashcard_items'::regclass, 'public.lessons'::regclass)
        ORDER BY 1`;
      return { specialties, deckPages, items, acPages, acLessons, rs, att, prog, themes, leadsFc, lessonHist, fks };
    });

    const specIdBySlug = new Map(data.specialties.map((s) => [s.slug, Number(s.id)]));
    const deckBySpec = new Map(data.deckPages.map((p) => [p.slug.replace(/-flashcards$/, ''), p]));
    const oldByPage = new Map();
    for (const it of data.items) {
      const pid = Number(it.page_id);
      if (!oldByPage.has(pid)) oldByPage.set(pid, new Map());
      const g = oldByPage.get(pid);
      const lbl = it.group_label || '';
      if (!g.has(lbl)) g.set(lbl, { label: lbl, group_position: it.group_position, cards: [] });
      g.get(lbl).cards.push({ id: Number(it.id), q: it.text, a: it.answer, position: it.position });
    }
    const newBySpec = new Map();
    for (const s of parsed.subjects) {
      if (!s.spec) continue;
      if (!newBySpec.has(s.spec)) newBySpec.set(s.spec, []);
      newBySpec.get(s.spec).push(s);
    }
    const allSpecs = [...new Set([...deckBySpec.keys(), ...newBySpec.keys()])].sort();

    // global pools for rename suggestions
    const missingPool = []; // {spec, label, cards}
    const newOnlyPool = []; // {spec, subject}
    const oldFate = new Map(); // item id -> {content, position}
    const deckResults = [];
    const T = { decksOld: 0, decksNew: 0, subjectsOld: 0, subjectsNew: 0, kept: 0, added: 0, missing: 0, cardsOld: 0, cardsNew: 0, match: {} };

    for (const spec of allSpecs) {
      const page = deckBySpec.get(spec) || null;
      const oldGroups = page ? [...(oldByPage.get(Number(page.id)) || new Map()).values()] : [];
      const newSubs = newBySpec.get(spec) || [];
      if (page) T.decksOld++;
      if (newSubs.length) T.decksNew++;
      T.subjectsOld += oldGroups.length; T.subjectsNew += newSubs.length;
      const oldCardsN = oldGroups.reduce((n, g) => n + g.cards.length, 0);
      const newCardsN = newSubs.reduce((n, s) => n + s.cards.length, 0);
      T.cardsOld += oldCardsN; T.cardsNew += newCardsN;
      const oldByKey = new Map(oldGroups.map((g) => [labelKey(g.label), g]));
      const newByKey = new Map(newSubs.map((s) => [labelKey(s.subject), s]));
      const kept = [], added = [], missing = [];
      const deckMatch = {};
      for (const s of newSubs) {
        const g = oldByKey.get(labelKey(s.subject));
        if (g) {
          const r = matchCards(g.cards, s.cards);
          g.cards.forEach((c, i) => oldFate.set(c.id, { content: r.oldFate[i], position: r.oldPosFate[i] }));
          addInto(deckMatch, r);
          kept.push({ subject: s.subject, oldLabel: g.label, isSlug: !!s.subjectIsSlug, labelTextChanges: clean(g.label) !== s.subject, r });
        } else {
          added.push(s);
          newOnlyPool.push({ spec, s });
        }
      }
      for (const g of oldGroups) {
        if (!newByKey.has(labelKey(g.label))) {
          missing.push(g);
          missingPool.push({ spec, g });
          g.cards.forEach((c) => oldFate.set(c.id, { content: 'subject-missing', position: 'subject-missing' }));
        }
      }
      addInto(T.match, deckMatch);
      T.kept += kept.length; T.added += added.length; T.missing += missing.length;
      deckResults.push({ spec, page, oldGroups, newSubs, oldCardsN, newCardsN, kept, added, missing, deckMatch });
    }

    // rename suggestions (global, cross-deck): label similarity + content overlap
    const suggest = (g, spec) => {
      const cands = [];
      for (const { spec: nspec, s } of newOnlyPool) {
        const ls = labelSim(g.label, s.subject);
        const ov = contentOverlap(g.cards, s.cards);
        if (ls >= 0.45 || ov >= 0.2) cands.push({ spec: nspec, subject: s.subject, ls, ov, score: Math.max(ls, ov) });
      }
      // also check kept subjects (content may have merged into an existing subject)
      for (const d of deckResults) for (const k of d.kept) {
        const s = d.newSubs.find((x) => x.subject === k.subject);
        const ov = contentOverlap(g.cards, s.cards);
        if (ov >= 0.25) cands.push({ spec: d.spec, subject: s.subject, ls: labelSim(g.label, s.subject), ov, score: ov, merged: true });
      }
      return cands.sort((a, b) => b.score - a.score).slice(0, 3)
        .map((c) => `${c.spec === spec ? '' : `${c.spec}/`}"${c.subject}"${c.merged ? ' [existing subject]' : ''} (label ${c.ls.toFixed(2)}, content ${pct(Math.round(c.ov * 100), 100)})`);
    };

    // ── report ──
    out(`FLASHCARDS DRY-RUN DIFF — Karina ${TAG} files vs LOCAL test DB (${u.hostname}:${u.port}) — READ ONLY`);
    out(`Generated ${new Date().toISOString()} by scripts/parse-flashcards-docx.js --diff`);
    out('NOTE: local is NOT prod. Prod is known to also hold the "outros" deck (90247) and endocrinologia');
    out('"Doenças das Paratireoides" (Para Justin drop 2026-06-27, prod-only), plus any admin inline edits.');
    out('');
    out('Card classes (new card ↔ old card, within a matched subject; greedy, same position first):');
    out('  identical = q+a equal after whitespace/entity cleanup · cosmetic = equal ignoring case/accents/punctuation');
    out('  answer-changed = same question, new answer · question-changed = same (long) answer, new question');
    out(`  reworded = question ≥ ${Math.round(REWORD_MIN * 100)}% similar (bigram Dice; heuristic upper bound — spot checks show some are different cards on the same theme)`);
  out('  NEW = no counterpart (INSERT) · DROPPED = old card with no counterpart');
    out('  position-key = would an UPDATE keyed by (deck, subject, card #) land on the SAME card? "DIFFERENT card" = history re-pointed to another question');
    out('');
    for (const d of deckResults) {
      const pageTxt = d.page ? `page ${d.page.id} (${d.page.slug}, ${d.page.status})` : 'NO DECK PAGE LOCALLY → brand-new deck';
      out(`### ${d.spec} — ${pageTxt}`);
      out(`   subjects ${d.oldGroups.length} → ${d.newSubs.length}   cards ${d.oldCardsN} → ${d.newCardsN}   kept ${d.kept.length} · new ${d.added.length} · missing-in-new ${d.missing.length}`);
      if (d.kept.length) out(`   deck match: ${fmtMatch(d.deckMatch)}`);
      for (const k of d.kept) {
        const lbl = k.isSlug ? `"${k.oldLabel}" (file header is the slug "${k.subject}")`
          : k.labelTextChanges ? `"${k.oldLabel}" → "${k.subject}"` : `"${k.subject}"`;
        out(`     = ${lbl}: ${fmtMatch(k.r)}`);
      }
      for (const s of d.added) out(`     + NEW subject "${s.subject}" (${s.cards.length} cards)${s.subjectIsSlug ? ' — header is a SLUG, needs a display label' : ''}`);
      for (const g of d.missing) {
        const sug = suggest(g, d.spec);
        out(`     - WOULD DISAPPEAR "${g.label}" (${g.cards.length} cards)` + (sug.length ? `  → likely renamed/merged: ${sug.join(' | ')}` : '  → no similar new subject'));
      }
      out('');
      J.decks.push({
        spec: d.spec, page_id: d.page ? Number(d.page.id) : null, subjectsOld: d.oldGroups.length, subjectsNew: d.newSubs.length,
        cardsOld: d.oldCardsN, cardsNew: d.newCardsN,
        kept: d.kept.map((k) => ({ subject: k.subject, oldLabel: k.oldLabel, ...Object.fromEntries(SUM_KEYS.map((x) => [x, k.r[x]])) })),
        added: d.added.map((s) => ({ subject: s.subject, cards: s.cards.length })),
        missing: d.missing.map((g) => ({ label: g.label, cards: g.cards.length, suggestions: suggest(g, d.spec) })),
      });
    }

    // totals
    const M = T.match;
    out('================ TOTALS (vs LOCAL) ================');
    out(`decks     ${T.decksOld} → ${T.decksNew}   brand-new decks: ${deckResults.filter((d) => !d.page && d.newSubs.length).map((d) => d.spec).join(', ') || 'none'}` +
      `   decks absent from the new files: ${deckResults.filter((d) => d.page && !d.newSubs.length).map((d) => d.spec).join(', ') || 'none'}`);
    out(`subjects  ${T.subjectsOld} → ${T.subjectsNew}   kept ${T.kept} · new ${T.added} · would disappear ${T.missing}`);
    out(`cards     ${T.cardsOld} → ${T.cardsNew}`);
    out(`in kept subjects: ${M.old || 0} old cards vs ${M.new || 0} new cards`);
    out(`   identical ${(M.identicalSamePos || 0) + (M.identicalMoved || 0)} (same pos ${M.identicalSamePos || 0}, moved ${M.identicalMoved || 0}) · cosmetic ${M.cosmetic || 0}` +
      ` · answer-changed ${M.answerChanged || 0} · question-changed ${M.questionChanged || 0} · reworded ${M.reworded || 0} · NEW ${M.added || 0} · DROPPED ${M.dropped || 0}`);
    out(`   position-keyed UPDATE: ${M.posSafe || 0} positions keep the same card, ${M.posUnsafe || 0} would re-point history to a DIFFERENT card`);
    const labelsChanging = deckResults.flatMap((d) => d.kept.filter((k) => k.labelTextChanges && !k.isSlug).map((k) => `${d.spec}: "${k.oldLabel}" → "${k.subject}"`));
    const slugKept = deckResults.reduce((n, d) => n + d.kept.filter((k) => k.isSlug).length, 0);
    const slugNew = deckResults.reduce((n, d) => n + d.added.filter((s) => s.subjectIsSlug).length, 0);
    out(`subject headers that are SLUGS (e.g. "doencas-bolhosas"): ${slugKept} kept (DB label available) + ${slugNew} new (no label anywhere) — importing verbatim would show slugs to students and break theme→topic keys`);
    out(`kept subjects whose real label TEXT changes (casing/accents/punctuation) — flashcard_theme_topics is keyed by exact label: ${labelsChanging.length}`);
    for (const x of labelsChanging) out(`   ${x}`);
    out('');
    J.totals = { ...T, labelsChanging };

    // AudioCards
    out('================ AUDIOCARDS (lessons on <spec>-audiocards pages) ================');
    const acBySpec = new Map(data.acPages.map((p) => [p.slug.replace(/-audiocards$/, ''), p]));
    const lessonsByPage = new Map();
    for (const l of data.acLessons) { const k = Number(l.page_id); if (!lessonsByPage.has(k)) lessonsByPage.set(k, []); lessonsByPage.get(k).push(l); }
    const AC = { lessons: 0, withAudio: 0, identical: 0, cosmetic: 0, changedWithAudio: 0, changedNoAudio: 0, missingWithAudio: 0, missingNoAudio: 0, newSubjectsNoLesson: 0, currentInSync: 0 };
    for (const d of deckResults) {
      const acp = acBySpec.get(d.spec);
      const lessons = acp ? lessonsByPage.get(Number(acp.id)) || [] : [];
      const newByKey = new Map(d.newSubs.map((s) => [labelKey(s.subject), s]));
      const oldByKey = new Map(d.oldGroups.map((g) => [labelKey(g.label), g]));
      const lines = [];
      const matchedKeys = new Set();
      for (const l of lessons) {
        AC.lessons++;
        const has = !!l.audio_url; if (has) AC.withAudio++;
        const pairs = parseAcTranscript(l.body_html);
        const key = labelKey(l.title);
        const cur = oldByKey.get(key);
        if (cur) { const c = transcriptCompare(pairs, cur.cards); if (c.state !== 'CHANGED') AC.currentInSync++; }
        const s = newByKey.get(key);
        if (!s) {
          if (has) AC.missingWithAudio++; else AC.missingNoAudio++;
          lines.push(`     - "${l.title}" (lesson ${l.id}, ${has ? 'HAS audio' : 'no audio'}): subject not in new files`);
          J.audiocards.push({ spec: d.spec, lesson_id: Number(l.id), title: l.title, audio: has, state: 'subject-missing' });
          continue;
        }
        matchedKeys.add(key);
        const c = transcriptCompare(pairs, s.cards);
        if (c.state === 'identical') AC.identical++;
        else if (c.state === 'cosmetic-only') AC.cosmetic++;
        else if (has) AC.changedWithAudio++; else AC.changedNoAudio++;
        if (c.state === 'CHANGED') lines.push(`     ~ "${l.title}" (lesson ${l.id}, ${has ? 'HAS audio' : 'no audio'}): transcript ${c.oldPairs} pairs vs ${c.newCards} new cards, ${c.same}/${c.total} pairs still equal → ${has ? 'AUDIO WOULD NO LONGER MATCH' : 'text only'}`);
        J.audiocards.push({ spec: d.spec, lesson_id: Number(l.id), title: l.title, audio: has, state: c.state, samePairs: c.same, total: c.total });
      }
      for (const s of d.newSubs) if (!matchedKeys.has(labelKey(s.subject))) { AC.newSubjectsNoLesson++; lines.push(`     + "${s.subject}": no audiocards lesson/audio yet`); }
      out(`### ${d.spec} — ${acp ? `page ${acp.id}, ${lessons.length} lessons, ${lessons.filter((l) => l.audio_url).length} with audio` : 'NO audiocards page locally'}`);
      for (const x of lines) out(x);
    }
    out('');
    out(`AudioCards totals: ${AC.lessons} lessons (${AC.withAudio} with audio_url). Current transcripts in sync with current LOCAL deck: ${AC.currentInSync}/${AC.lessons}.`);
    out(`   vs new cards: identical ${AC.identical} · cosmetic-only ${AC.cosmetic} · CHANGED with audio ${AC.changedWithAudio} · changed without audio ${AC.changedNoAudio}`);
    out(`   subject missing in new: ${AC.missingWithAudio} with audio, ${AC.missingNoAudio} without · new subjects with no lesson: ${AC.newSubjectsNoLesson}`);
    out(`   Audio files delivered with this batch: ${parsed.other.filter((o) => /\.mp3$/i.test(o)).map((o) => o.replace(/\\/g, '/')).join(', ') || 'none'}` +
      ' (existing Bunny naming is AudioCards-Audio/<spec>/<slug>-A.mp3; note "_A" vs "-A")');
    out('');
    J.audiocardsTotals = AC;

    // History coupling
    out('================ HISTORY COUPLING (LOCAL) ================');
    out('Foreign keys into flashcard_items / lessons:');
    for (const f of data.fks) out(`   ${f.tbl}: ${f.def}`);
    out('   flashcard_items: UNIQUE (page_id, group_position, position) — NOT deferrable → re-ordering in place needs an offset shuffle (+1000 trick, as in parajustin-endo-paratireoides.sql)');
    out('No-FK references (id-keyed, silently orphaned by a delete+reinsert):');
    const rsOrphan = data.rs.filter((r) => r.orphan).length;
    out(`   review_schedule item_type='flashcard': ${data.rs.length} rows, ${new Set(data.rs.map((r) => r.user_id)).size} users, ${rsOrphan} ALREADY orphaned (item_id not in flashcard_items)`);
    const leadKeys = data.leadsFc.flatMap((l) => Object.keys(l.fc_progress || {}));
    const itemIds = new Set(data.items.map((i) => String(i.id)));
    out(`   leads.fc_progress (JSONB keyed by flashcard_items.id): ${data.leadsFc.length} leads, ${leadKeys.length} keys, ${leadKeys.filter((k) => !itemIds.has(k)).length} already orphaned`);
    out(`   flashcard_theme_topics (keyed by (specialty_id, exact group_label)): ${data.themes.length} rows`);
    out('FK-cascaded history:');
    out(`   flashcard_attempts: ${data.att.length} rows, ${new Set(data.att.map((r) => r.user_id)).size} users (ON DELETE CASCADE)`);
    out(`   flashcard_progress: ${data.prog.length} rows (ON DELETE CASCADE)`);
    out(`   audiocards lessons: lesson_completions ${data.lessonHist.completions}, lesson_progress ${data.lessonHist.progress} (ON DELETE CASCADE from lessons)`);
    // fate of history rows under content-matching vs position-keyed update
    const fateTally = (rows) => {
      const c = {}, p = {};
      for (const r of rows) {
        const f = oldFate.get(Number(r.item_id));
        const ck = f ? f.content : 'orphan/unknown'; const pk = f ? f.position : 'orphan/unknown';
        c[ck] = (c[ck] || 0) + 1; p[pk] = (p[pk] || 0) + 1;
      }
      return { c, p };
    };
    const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ');
    for (const [name, rows] of [['review_schedule', data.rs], ['flashcard_attempts', data.att], ['flashcard_progress', data.prog]]) {
      const { c, p } = fateTally(rows);
      out(`   ${name} rows by fate of their card — content-matched: ${fmt(c) || 'none'}`);
      out(`   ${name} rows by fate of their card — position-keyed: ${fmt(p) || 'none'}`);
    }
    // theme topics vs new labels
    const newLabelsBySpecId = new Map();
    for (const s of parsed.subjects) {
      const sid = specIdBySlug.get(s.spec); if (sid == null) continue;
      if (!newLabelsBySpecId.has(sid)) newLabelsBySpecId.set(sid, new Map());
      newLabelsBySpecId.get(sid).set(labelKey(s.subject), s.subjectIsSlug ? null : s.subject); // null = slug header, keep DB label
    }
    let thExact = 0, thRekey = 0, thGone = 0; const thGoneList = [], thRekeyList = [];
    for (const t of data.themes) {
      const m = newLabelsBySpecId.get(Number(t.specialty_id));
      const nl = m && m.get(labelKey(t.group_label));
      if (nl === undefined) { thGone++; thGoneList.push(`${t.specialty_id}:"${t.group_label}"`); }
      else if (nl === null || nl === t.group_label) thExact++;
      else { thRekey++; thRekeyList.push(`${t.specialty_id}:"${t.group_label}"→"${nl}"`); }
    }
    out(`   flashcard_theme_topics vs new labels: ${thExact} exact (slug headers assumed to keep the DB label) · ${thRekey} need re-key (label text changes) · ${thGone} label gone`);
    if (thRekeyList.length) out(`      re-key: ${thRekeyList.join(', ')}`);
    if (thGoneList.length) out(`      gone:   ${thGoneList.join(', ')}`);
    const newSubjectsNoTheme = parsed.subjects.filter((s) => {
      const sid = specIdBySlug.get(s.spec);
      return !data.themes.some((t) => Number(t.specialty_id) === sid && labelKey(t.group_label) === labelKey(s.subject));
    }).length;
    out(`      new subjects without a theme→topic row (backfill needed): ${newSubjectsNoTheme}`);
    out('');
    J.history = { review_schedule: data.rs.length, review_schedule_orphans: rsOrphan, flashcard_attempts: data.att.length, flashcard_progress: data.prog.length,
      leads_fc_progress: { leads: data.leadsFc.length, keys: leadKeys.length }, theme_topics: { rows: data.themes.length, exact: thExact, rekey: thRekey, gone: thGone },
      lessonHist: data.lessonHist, fks: data.fks };

    // Overlay: prod-only content known from parsed SQL patches
    if (DO_OVERLAY) {
      const files = ['parajustin-outros-decks.sql', 'parajustin-endo-paratireoides.sql'].map((f) => path.join(OUT_DIR, f)).filter((f) => fs.existsSync(f));
      if (files.length) {
        out('================ PROD-ONLY CONTENT (not on local; from parsed/parajustin-*.sql, 2026-06-27) ================');
        out('Compared against the new files the same way. Admin inline edits made on prod since then are NOT visible here.');
        const pageSpec = (r) => (r.pageSlug ? r.pageSlug.replace(/-flashcards$/, '') : [...deckBySpec].find(([, p]) => Number(p.id) === r.pageId)?.[0]);
        for (const f of files) {
          const rows = parseSqlFlashcards(f);
          const groups = new Map();
          for (const r of rows) {
            const spec = pageSpec(r);
            const k = `${spec}::${r.group_label}`;
            if (!groups.has(k)) groups.set(k, { spec, label: r.group_label, cards: [] });
            groups.get(k).cards.push({ q: r.text, a: r.answer, position: r.position });
          }
          for (const g of groups.values()) {
            g.cards.sort((a, b) => a.position - b.position);
            const s = (newBySpec.get(g.spec) || []).find((x) => labelKey(x.subject) === labelKey(g.label));
            out(`   ${path.basename(f)} · ${g.spec} "${g.label}" (${g.cards.length} cards): ` + (s ? fmtMatch(matchCards(g.cards, s.cards)) : 'NOT in new files'));
          }
        }
        out('');
      }
    }
  } finally {
    await db.end();
  }
  fs.writeFileSync(OUT_DIFF, L.join('\n') + '\n', 'utf8');
  fs.writeFileSync(OUT_DIFF_JSON, JSON.stringify(J, null, 2), 'utf8');
  return L.join('\n');
}

// ── main ────────────────────────────────────────────────────────────────────────
async function main() {
  const parsed = parseAll();
  const { totalCards, counts } = writeParseOutputs(parsed);
  const errs = Object.entries(counts).filter(([k]) => k.startsWith('ERROR')).reduce((n, [, v]) => n + v, 0);
  const warns = Object.entries(counts).filter(([k]) => k.startsWith('WARN')).reduce((n, [, v]) => n + v, 0);
  console.log(`Parsed ${parsed.subjects.length} files → ${parsed.byDeck.size} decks, ${totalCards} cards. ERROR ${errs} · WARN ${warns}.`);
  console.log(`  ${path.relative(path.join(__dirname, '..'), OUT_JSON)}`);
  console.log(`  ${path.relative(path.join(__dirname, '..'), OUT_WARN)}`);
  if (DO_DIFF) {
    const txt = await runDiff(parsed);
    console.log('');
    console.log(txt);
    console.log(`\nDiff written: ${path.relative(path.join(__dirname, '..'), OUT_DIFF)} (+ ${path.basename(OUT_DIFF_JSON)})`);
  }
}

main().catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1); });
