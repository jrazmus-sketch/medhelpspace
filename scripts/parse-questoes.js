'use strict';
/**
 * parse-questoes.js — READ-ONLY parser (no DB, no SQL). Reads the locally
 * downloaded `questoes revalida` .docx files directly (via `unzip`), parses each
 * topic doc's past-exam MCQs, and writes:
 *   parsed/questoes-parsed.json   — [{spec, topicSlug, title, file, questions:[...]}]
 *   (prints a per-specialty summary + warnings)
 *
 * Output feeds scripts/reconcile-questoes.js (diff vs live) and later the apply
 * step. Each parsed question is already in the h5p-quiz HTML shape QuizPlayer
 * expects (question stem w/ provenance <h3>, answers [{text,correct,feedback}],
 * explanation_html). media_url is attached later from local images.
 *
 * MUST be run via the Bash tool (Git Bash) so `unzip` is on PATH:
 *   node scripts/parse-questoes.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.env.RQ_LOCAL || 'C:/Users/jrazm/OneDrive/Desktop/Medhelpspace/questoes revalida/questoes revalida';
const OUT = path.join(__dirname, '..', 'parsed', 'questoes-parsed.json');
const SUBSPEC = { CARDIO: 'cardiologia', DERMATO: 'dermatologia', ENDOCRINO: 'endocrinologia', GASTRO: 'gastroenterologia', HEMATO: 'hematologia', INFECTO: 'infectologia', NEFRO: 'nefrologia', NEURO: 'neurologia', PNEUMO: 'pneumologia', PSIQUIATRIA: 'psiquiatria', REUMATO: 'reumatologia' };

// ---------- docx -> clean text ----------

// Word tables (lab panels, vaccination charts) used to be flattened to one cell per
// line, which made the stem unreadable. Each <w:tbl> is now swapped for a token on its
// own line and rendered as a real HTML table once the question HTML is assembled.
const TABLES = [];
const TABLE_TOKEN = /@@TABLE(\d+)@@/g;
function xmlText(x) {
  return x.replace(/<w:tab\b[^>]*\/?>/g, ' ').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&').trim();
}
function tableToHtml(tblXml) {
  const rows = [...tblXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((rm) =>
    [...rm[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cm) =>
      [...cm[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((pm) => xmlText(pm[0])).filter(Boolean).map(escapeHtml).join('<br>')));
  const body = rows.filter((r) => r.some((c) => c)).map((cells, i) =>
    `<tr>${cells.map((c) => (i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('');
  return `<div class="quiz-table-wrap"><table class="quiz-table">${body}</table></div>`;
}
const restoreTables = (html) => (html == null ? html : html
  .replace(/<(p|li|h4)>\s*@@TABLE(\d+)@@\s*<\/\1>/g, (_, _t, n) => TABLES[+n])
  .replace(TABLE_TOKEN, (_, n) => TABLES[+n]));

function docxToText(file) {
  const r = spawnSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) throw new Error(`unzip failed (${r.status}) for ${path.basename(file)} — run via Git Bash so unzip is on PATH`);
  let s = r.stdout;
  s = s.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => { TABLES.push(tableToHtml(tbl)); return `</w:p>@@TABLE${TABLES.length - 1}@@</w:p>`; });
  s = s.replace(/<\/w:p>/g, '\n');          // paragraph end -> newline
  s = s.replace(/<w:br\b[^>]*\/?>/g, '\n'); // soft line break -> newline
  s = s.replace(/<w:tab\b[^>]*\/?>/g, ' ');
  s = s.replace(/<[^>]+>/g, '');            // strip remaining tags
  // decode XML entities (&amp; last to avoid double-decode)
  s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
  return s;
}

// ---------- cleaning + parsing (proven on the connector pull; tolerant of both) ----------

function cleanDocText(raw) {
  let s = raw.replace(/ðª/g, '🟪').replace(/ð£/g, '🟣'); // no-op on clean docx; safe for connector text
  s = s.replace(/\\([<>=_*#.\-+|`~()[\]])/g, '$1');
  const lines = s.split(/\r?\n/).map((line) => line.replace(/^\s*#+\s*/, '').replace(/\*\*/g, '').trim());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function explanationTextToHtml(text) {
  const lines = text.split('\n').map((l) => l.trim());
  const out = []; let buf = []; let bulletKind = null;
  const flush = () => {
    if (!buf.length) return;
    const cls = bulletKind === '🟣' ? ' class="resumo"' : bulletKind === '❌' ? ' class="pega"' : bulletKind === '✔' ? ' class="certo"' : '';
    out.push(`<ul${cls}>${buf.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`);
    buf = []; bulletKind = null;
  };
  for (const line of lines) {
    if (line === '') { flush(); continue; }
    const m = line.match(/^([●🟣❌✔])\uFE0F?\s*(.*)$/u);
    if (m) { const k = m[1]; if (bulletKind && bulletKind !== k) flush(); bulletKind = k; if (m[2].trim()) buf.push(m[2].trim()); continue; }
    flush();
    if (/^(?:🟪\s*)?Coment[aá]rio:?$/iu.test(line)) out.push('<h4>Comentário:</h4>');
    else if (/:\.?$/.test(line)) out.push(`<h4>${escapeHtml(line.replace(/^[🟪🟣]\s*/u, '').replace(/:\.$/, ':'))}</h4>`);
    else out.push(`<p>${escapeHtml(line)}</p>`);
  }
  flush();
  return out.join('\n');
}

const Q_HEADER = /^quest[aã]o\s+\d+/;

function splitQuestions(cleanText) {
  const lines = cleanText.split('\n');
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    // A real question header is "Questão N (Revalida YYYY)" or "Questão N (YYYY.S)"
    // — it always carries an exam YEAR. A bare "Questão 1" (a figure/table caption
    // embedded in a stem) has no year and must NOT split a question.
    if (Q_HEADER.test(lines[i].toLowerCase()) && /20\d\d/.test(lines[i])) heads.push(i);
  }
  const chunks = [];
  for (let h = 0; h < heads.length; h++) {
    chunks.push(lines.slice(heads[h], h + 1 < heads.length ? heads[h + 1] : lines.length).join('\n').trim());
  }
  return chunks;
}

function parseChunk(chunk) {
  const lines = chunk.split('\n');
  const header = lines[0];
  const number = (header.match(/\d+/) || [null])[0];
  // Year appears as "(Revalida 2021)" OR bare "(2022.2)" (both are Revalida exams).
  const yearM = header.match(/\b(20\d\d(?:\.[12])?)/);
  const year = yearM ? yearM[1] : null;
  const rest = lines.slice(1).join('\n');

  // The answer line STARTS a line. Anchoring matters: many stems END with "assinale a
  // alternativa correta:", which an unanchored search mistook for the answer marker and
  // so cut the options off. The 2026-09 rewrite also writes "Gabarito: D",
  // "✔ Gabarito oficial: QUESTÃO ANULADA …" and "✔ Questão anulada."
  const markerM = rest.match(/^[ \t]*(?:[✔⚠]\uFE0F?\s*)?(?:Alternativa\s+correta[^:\n]{0,60}:|Gabarito(?:\s+(?:oficial|definitivo|hist[óo]rico|da\s+quest[aã]o))*\s*:|Quest[aã]o\s+anulada\b)/im);
  if (!markerM) return { error: 'no answer marker (Alternativa correta / Gabarito / Questão anulada)', number, year };
  const markerIdx = markerM.index;
  const questionPart = rest.slice(0, markerIdx).trim();
  const answerPart = rest.slice(markerIdx).trim();
  const anulada = /anulad/i.test(header) || /anulad/i.test(answerPart);

  const optRe = /^\(?([A-E])\)\s*/gm; // "(A) …" and the odd-template "A) …"
  let optMatches = [...questionPart.matchAll(optRe)].map((m) => ({ letter: m[1], idx: m.index, after: m.index + m[0].length }));
  // Fallback: options packed on one line "(A) .. (B) .. (C) .. (D) .." — split inline.
  if (optMatches.length < 4) {
    const inline = /\(([A-E])\)\s+/g;
    const im = [...questionPart.matchAll(inline)].map((m) => ({ letter: m[1], idx: m.index, after: m.index + m[0].length }));
    if (im.length >= 4 && im.length <= 5) optMatches = im;
  }
  if (optMatches.length < 4) return { error: `only ${optMatches.length} options found`, number, year, anulada };
  if (optMatches.length > 5) return { error: `${optMatches.length} options found (>5)`, number, year, anulada };

  const stem = questionPart.slice(0, optMatches[0].idx).trim();
  const options = [];
  for (let i = 0; i < optMatches.length; i++) {
    const b = i + 1 < optMatches.length ? optMatches[i + 1].idx : questionPart.length;
    options.push(questionPart.slice(optMatches[i].after, b).trim().replace(/\s*\n\s*/g, ' '));
  }
  const letters = ['A', 'B', 'C', 'D', 'E'].slice(0, options.length);

  let correct = null;
  const answerLine = answerPart.split('\n')[0];
  const direct = answerLine.match(/(?:Alternativa\s+correta[^:\n]{0,60}|Gabarito[^:\n]*)\s*:\s*\(?([A-E])\)?(?=[\s.,;)—–-]|$)/i);
  if (direct) correct = direct[1];
  if (!correct) {
    // Annulled question where Karina names the answer worth studying.
    const adq = answerLine.match(/mais\s+(?:adequada|defens[áa]vel)[^()]*\(([A-E])\)/i)
      || answerPart.match(/mais\s+(?:adequada|defens[áa]vel)[^()\n]*\(([A-E])\)/i)
      || answerPart.match(/seria\s+a?\s*\(([A-E])\)/i)
      || (/anulad/i.test(answerLine) ? null : answerPart.match(/correta:[\s\S]{0,120}?\(([A-E])\)/i));
    if (adq) correct = adq[1];
  }

  const distractor = { A: '', B: '', C: '', D: '', E: '' };
  const analiseRe = /An[aá]lise\s+das\s+(?:demais\s+)?alternativas(?:\s+incorretas)?:\s*([\s\S]*?)(?=\n\s*(?:🟪?\s*PEGA REVALIDA|🟪?\s*Resumo-chave|quest[aã]o\s+\d|$))/i;
  const am = answerPart.match(analiseRe);
  if (am) {
    for (const lm of am[1].matchAll(/(?:^|\n)\s*\(?([A-E])\)\s*([\s\S]*?)(?=\n\s*\(?[A-E]\)|$)/g)) distractor[lm[1]] = lm[2].trim().replace(/\s*\n\s*/g, ' ');
  }

  let explanation = answerPart;
  const ci = answerPart.search(/^[ \t]*🟪?\s*Coment[aá]rio\s*:?[ \t]*$/im);
  if (ci > -1) explanation = answerPart.slice(ci);
  if (am) explanation = explanation.replace(analiseRe, '').replace(/\n{3,}/g, '\n\n').trim();

  const needsImage = /(a seguir|imagem abaixo|exibid|mostrad[ao]\b|na imagem|figura abaixo|conforme (a )?imagem|eletrocardiograma|\bECG\b|radiografia[\s\S]{0,40}(seguir|abaixo)|tomografia[\s\S]{0,40}(seguir|abaixo)|exames? labora[\s\S]{0,40}(seguir|abaixo|tabela))/i.test(stem);

  return { number, year, anulada, stem, options, letters, correct, distractor, explanation, needsImage };
}

const SMALL = new Set(['e', 'de', 'da', 'do', 'das', 'dos', 'na', 'no', 'em', 'a', 'o', 'ao', 'à', 'com', 'por']);
function humanizeSlug(slug) {
  return slug.split('-').map((w, i) => (i > 0 && SMALL.has(w)) ? w : /^[ivx]+$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const isSkip = (base) => /\bn[aã]o\b/i.test(base.replace(/_/g, ' '));

// ---------- walk + parse ----------

// 2026-09-20 delivery: the clínica médica folder is named "clinica-medica falta",
// file names carry editorial notes ("cancer-de-esofago atualizado", trailing "_"),
// and ONE exam arrives as its own tree ("2026.1 pronto/<spec>/<topic>.docx", with
// full-name subspecialty folders) whose questions belong INSIDE the matching topic.
const SUPPLEMENT_RE = /^20\d\d\.[12]\b/;
const isClinica = (name) => /^clinica[- ]medica\b/i.test(name.trim());
const SPEC_FULL = new Set(Object.values(SUBSPEC));
function subspecOf(name) {
  const first = name.trim().split(/\s+/)[0];
  return SUBSPEC[first.toUpperCase()] || (SPEC_FULL.has(slugify(first)) ? slugify(first) : null);
}
const cleanBase = (base) => base.replace(/\batualizad[oa]\b/gi, ' ');

function topics() {
  const out = [];
  const addDir = (dir, spec, supplement) => {
    for (const f of fs.readdirSync(dir)) {
      if (!/\.docx$/i.test(f) || f.startsWith('~$')) continue;
      const base = f.replace(/\.docx$/i, '');
      if (isSkip(base)) continue;
      const slug = slugify(cleanBase(base));
      out.push({ spec, topicSlug: slug, title: humanizeSlug(slug), file: path.join(dir, f), supplement });
    }
  };
  const walkTree = (root, supplement) => {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (!supplement && SUPPLEMENT_RE.test(e.name)) { walkTree(path.join(root, e.name), e.name.match(SUPPLEMENT_RE)[0]); continue; }
      if (isClinica(e.name)) {
        for (const sub of fs.readdirSync(path.join(root, e.name), { withFileTypes: true })) {
          if (!sub.isDirectory()) continue;
          const spec = subspecOf(sub.name);
          if (!spec) { console.warn('  ! unmapped subspec:', sub.name); continue; }
          addDir(path.join(root, e.name, sub.name), spec, supplement);
        }
      } else {
        addDir(path.join(root, e.name), slugify(e.name), supplement);
      }
    }
  };
  walkTree(ROOT, null);
  // Main docs first, supplements after, so a topic's new-exam questions append to its history.
  return out.sort((a, b) => ((a.supplement ? 1 : 0) - (b.supplement ? 1 : 0)) || (a.spec + a.topicSlug).localeCompare(b.spec + b.topicSlug));
}

function main() {
  if (!fs.existsSync(ROOT)) { console.error('Local root not found:', ROOT); process.exit(1); }
  const ts = topics();
  const result = [];
  const byTopic = new Map();
  const warnings = [];
  const perSpec = {};
  let qTotal = 0, anulada = 0, imgHints = 0, dropped = 0;
  const droppedRows = [];

  for (const t of ts) {
    let text;
    try { text = docxToText(t.file); } catch (e) { warnings.push(`${t.spec}/${t.topicSlug}: ${e.message}`); continue; }
    const clean = cleanDocText(text);
    const chunks = splitQuestions(clean);
    const questions = [];
    let pos = 0;
    for (const chunk of chunks) {
      const p = parseChunk(chunk);
      if (p.error) { warnings.push(`${t.spec}/${t.topicSlug} Q${p.number ?? '?'}: ${p.error}`); continue; }
      if (!p.correct) {
        dropped++;
        // Keep a machine-readable record: scripts/import-anuladas.js needs the topic of a
        // question Karina later sends back with a defensible answer.
        droppedRows.push({ spec: t.spec, topicSlug: t.topicSlug, number: String(p.number), year: p.year || null, anulada: !!p.anulada });
        warnings.push(`${t.spec}/${t.topicSlug} Q${p.number}: no correct letter — DROPPED${p.anulada ? ' (anulada)' : ''}`);
        continue;
      }
      pos += 1;
      if (p.anulada) anulada++;
      if (p.needsImage) imgHints++;
      const prov = [`Questão ${p.number}`, p.year ? `Revalida ${p.year}` : null, p.anulada ? 'Anulada' : null].filter(Boolean).join(' · ');
      const stemHtml = p.stem.split('\n').filter((l) => l.trim()).map((l) => `<p>${escapeHtml(l)}</p>`).join('\n');
      questions.push({
        position: pos, number: p.number, year: p.year, anulada: p.anulada, needsImage: p.needsImage,
        question: restoreTables(`<h3><strong>${escapeHtml(prov)}</strong></h3>\n${stemHtml}`),
        answers: p.letters.map((L, i) => ({ text: `<div><strong>(${L}) ${escapeHtml(p.options[i])}</strong></div>`, correct: L === p.correct, feedback: L === p.correct ? '' : (p.distractor[L] || '') })),
        explanation_html: restoreTables(explanationTextToHtml(p.explanation) || null),
      });
      qTotal += 1;
    }
    // A topic can be fed by several files: its main doc plus one per supplement tree.
    const key = `${t.spec}::${t.topicSlug}`;
    if (!byTopic.has(key)) byTopic.set(key, { spec: t.spec, topicSlug: t.topicSlug, title: t.title, file: t.file.replace(/\\/g, '/'), files: [], questions: [], supplementQuestions: 0, mainFile: false });
    const acc = byTopic.get(key);
    acc.files.push(t.file.replace(/\\/g, '/'));
    if (!t.supplement) acc.mainFile = true;
    for (const q of questions) {
      if (acc.questions.some((x) => x.number === q.number && x.year === q.year)) { qTotal -= 1; warnings.push(`${t.spec}/${t.topicSlug} Q${q.number} (${q.year}): duplicate within topic — kept the first copy`); continue; }
      if (t.supplement) acc.supplementQuestions += 1;
      acc.questions.push({ ...q, supplement: t.supplement || null });
    }
  }
  for (const acc of byTopic.values()) {
    if (!acc.questions.length) { warnings.push(`${acc.spec}/${acc.topicSlug}: 0 questions — topic SKIPPED`); continue; }
    acc.questions.forEach((q, i) => { q.position = i + 1; });
    perSpec[acc.spec] = (perSpec[acc.spec] || 0) + 1;
    result.push({ spec: acc.spec, topicSlug: acc.topicSlug, title: acc.title, file: acc.file, files: acc.files, mainFile: acc.mainFile, questionCount: acc.questions.length, supplementQuestions: acc.supplementQuestions, anulada: acc.questions.filter((q) => q.anulada).length, questions: acc.questions });
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT.replace('questoes-parsed.json', 'questoes-dropped.json'), JSON.stringify(droppedRows, null, 2), 'utf8');

  console.log(`\nQuestões parse (from local .docx)`);
  console.log(`  root   : ${ROOT}`);
  console.log(`  out    : ${OUT}`);
  console.log(`  topics : ${result.length}   questions: ${qTotal}   anulada: ${anulada}   image-hints: ${imgHints}   dropped(no-correct): ${dropped}`);
  const byYear = {};
  for (const r of result) for (const q of r.questions) byYear[q.year || '?'] = (byYear[q.year || '?'] || 0) + 1;
  console.log(`  by year: ${Object.keys(byYear).sort().map((y) => `${y}=${byYear[y]}`).join('  ')}`);
  const sup = result.filter((r) => r.supplementQuestions);
  if (sup.length) console.log(`  supplement: ${sup.reduce((n, r) => n + r.supplementQuestions, 0)} questions merged into ${sup.filter((r) => r.mainFile).length} existing topic(s); ${sup.filter((r) => !r.mainFile).length} topic(s) exist ONLY in the supplement: ${sup.filter((r) => !r.mainFile).map((r) => `${r.spec}/${r.topicSlug}`).join(', ')}`);
  console.log(`\n  per specialty (topics):`);
  for (const s of Object.keys(perSpec).sort()) console.log(`    ${s.padEnd(20)} ${perSpec[s]}`);
  if (warnings.length) {
    console.log(`\n  ⚠ ${warnings.length} warning(s) (first 50):`);
    for (const w of warnings.slice(0, 50)) console.log(`    - ${w}`);
    if (warnings.length > 50) console.log(`    … +${warnings.length - 50} more`);
  } else console.log(`\n  ✓ no warnings`);
}

main();
