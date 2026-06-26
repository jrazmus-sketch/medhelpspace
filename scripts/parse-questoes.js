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

function docxToText(file) {
  const r = spawnSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) throw new Error(`unzip failed (${r.status}) for ${path.basename(file)} — run via Git Bash so unzip is on PATH`);
  let s = r.stdout;
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
    const cls = bulletKind === '🟣' ? ' class="resumo"' : bulletKind === '❌' ? ' class="pega"' : '';
    out.push(`<ul${cls}>${buf.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`);
    buf = []; bulletKind = null;
  };
  for (const line of lines) {
    if (line === '') { flush(); continue; }
    const m = line.match(/^([●🟣❌])\s*(.*)$/u);
    if (m) { const k = m[1]; if (bulletKind && bulletKind !== k) flush(); bulletKind = k; if (m[2].trim()) buf.push(m[2].trim()); continue; }
    flush();
    if (/:$/.test(line)) out.push(`<h4>${escapeHtml(line.replace(/^[🟪🟣]\s*/u, ''))}</h4>`);
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

  const markerM = rest.match(/✔?\s*Alternativa\s+correta:/i);
  if (!markerM) return { error: 'no "Alternativa correta" marker', number, year };
  const markerIdx = rest.indexOf(markerM[0]);
  const questionPart = rest.slice(0, markerIdx).trim();
  const answerPart = rest.slice(markerIdx).trim();
  const anulada = /anulad/i.test(header) || /anulad/i.test(answerPart);

  const optRe = /^\(([A-E])\)\s*/gm;
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
  const direct = answerPart.match(/Alternativa\s+correta:\s*\(([A-E])\)/i);
  if (direct) correct = direct[1];
  if (!correct) {
    const adq = answerPart.match(/mais\s+adequada[^()]*\(([A-E])\)/i) || answerPart.match(/seria\s+a?\s*\(([A-E])\)/i) || answerPart.match(/correta:[\s\S]{0,120}?\(([A-E])\)/i);
    if (adq) correct = adq[1];
  }

  const distractor = { A: '', B: '', C: '', D: '', E: '' };
  const analiseRe = /An[aá]lise\s+das\s+alternativas(?:\s+incorretas)?:\s*([\s\S]*?)(?=\n\s*(?:🟪?\s*PEGA REVALIDA|🟪?\s*Resumo-chave|quest[aã]o\s+\d|$))/i;
  const am = answerPart.match(analiseRe);
  if (am) {
    for (const lm of am[1].matchAll(/\(([A-E])\)\s*([\s\S]*?)(?=\n\s*\([A-E]\)|$)/g)) distractor[lm[1]] = lm[2].trim().replace(/\s*\n\s*/g, ' ');
  }

  let explanation = answerPart;
  const ci = answerPart.search(/🟪?\s*Coment[aá]rio:/i);
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

function topics() {
  const out = [];
  const addDir = (dir, spec) => {
    for (const f of fs.readdirSync(dir)) {
      if (!/\.docx$/i.test(f)) continue;
      const base = f.replace(/\.docx$/i, '');
      if (isSkip(base)) continue;
      out.push({ spec, topicSlug: slugify(base), title: humanizeSlug(slugify(base)), file: path.join(dir, f) });
    }
  };
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name === 'clinica-medica') {
      for (const sub of fs.readdirSync(path.join(ROOT, e.name), { withFileTypes: true })) {
        if (!sub.isDirectory()) continue;
        const spec = SUBSPEC[sub.name.trim().split(/\s+/)[0].toUpperCase()];
        if (!spec) { console.warn('  ! unmapped subspec:', sub.name); continue; }
        addDir(path.join(ROOT, e.name, sub.name), spec);
      }
    } else {
      addDir(path.join(ROOT, e.name), e.name);
    }
  }
  return out.sort((a, b) => (a.spec + a.topicSlug).localeCompare(b.spec + b.topicSlug));
}

function main() {
  if (!fs.existsSync(ROOT)) { console.error('Local root not found:', ROOT); process.exit(1); }
  const ts = topics();
  const result = [];
  const warnings = [];
  const perSpec = {};
  let qTotal = 0, anulada = 0, imgHints = 0, dropped = 0;

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
      if (!p.correct) { dropped++; warnings.push(`${t.spec}/${t.topicSlug} Q${p.number}: no correct letter — DROPPED${p.anulada ? ' (anulada)' : ''}`); continue; }
      pos += 1;
      if (p.anulada) anulada++;
      if (p.needsImage) imgHints++;
      const prov = [`Questão ${p.number}`, p.year ? `Revalida ${p.year}` : null, p.anulada ? 'Anulada' : null].filter(Boolean).join(' · ');
      const stemHtml = p.stem.split('\n').filter((l) => l.trim()).map((l) => `<p>${escapeHtml(l)}</p>`).join('\n');
      questions.push({
        position: pos, number: p.number, year: p.year, anulada: p.anulada, needsImage: p.needsImage,
        question: `<h3><strong>${escapeHtml(prov)}</strong></h3>\n${stemHtml}`,
        answers: p.letters.map((L, i) => ({ text: `<div><strong>(${L}) ${escapeHtml(p.options[i])}</strong></div>`, correct: L === p.correct, feedback: L === p.correct ? '' : (p.distractor[L] || '') })),
        explanation_html: explanationTextToHtml(p.explanation) || null,
      });
      qTotal += 1;
    }
    if (!questions.length) { warnings.push(`${t.spec}/${t.topicSlug}: 0 questions — topic SKIPPED`); continue; }
    perSpec[t.spec] = (perSpec[t.spec] || 0) + 1;
    result.push({ spec: t.spec, topicSlug: t.topicSlug, title: t.title, file: t.file.replace(/\\/g, '/'), questionCount: questions.length, anulada: questions.filter((q) => q.anulada).length, questions });
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');

  console.log(`\nQuestões parse (from local .docx)`);
  console.log(`  root   : ${ROOT}`);
  console.log(`  out    : ${OUT}`);
  console.log(`  topics : ${result.length}   questions: ${qTotal}   anulada: ${anulada}   image-hints: ${imgHints}   dropped(no-correct): ${dropped}`);
  console.log(`\n  per specialty (topics):`);
  for (const s of Object.keys(perSpec).sort()) console.log(`    ${s.padEnd(20)} ${perSpec[s]}`);
  if (warnings.length) {
    console.log(`\n  ⚠ ${warnings.length} warning(s) (first 50):`);
    for (const w of warnings.slice(0, 50)) console.log(`    - ${w}`);
    if (warnings.length > 50) console.log(`    … +${warnings.length - 50} more`);
  } else console.log(`\n  ✓ no warnings`);
}

main();
