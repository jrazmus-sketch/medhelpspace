'use strict';
/**
 * parse-simulados-new.js — READ-ONLY parser (no DB). Reads Karina's new
 * "Simulados-new" .docx tree and emits the h5p-quiz shape QuizPlayer expects.
 *
 *   node scripts/parse-simulados-new.js
 *
 * Source tree (each leaf .docx = one "Mini Simulado N", 25 MCQs):
 *   Simulados-new/geral/geral/mini-simulado-<N>.docx                 → group=geral,   spec=null
 *   Simulados-new/por-areas/por-areas/<area>/mini-simulado-<N>.docx  → group=por-area, spec=<area>
 *   Simulados-new/por-areas/por-areas/clinica-medica/<subspec>/mini-simulado-<N>.docx
 *                                                                     → group=por-area, spec=<subspec>
 *
 * Output: parsed/simulados-new-parsed.json
 *   [{ group, specSlug, num, title, file, questionCount, questions:[{position,question,answers,explanation_html}] }]
 *
 * Doc format (clean, consistent — differs from questoes: NO exam year, different labels):
 *   QUESTÃO 1
 *   <stem…>
 *   (A) …(B) …(C) …(D) …
 *   ✔ Alternativa correta: (A) …
 *   Comentário:<…>
 *   Por que as outras estão erradas?(B) Errada. …(C) Errada. …(D) …
 *   Conceito-chave:<…>
 *
 * MUST run via Git Bash (needs `unzip` on PATH).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.env.SIM_LOCAL || 'C:/Users/jrazm/OneDrive/Desktop/Medhelpspace/Simulados-new';
const OUT = path.join(__dirname, '..', 'parsed', 'simulados-new-parsed.json');

// Subfolder name → specialty slug. clinica-medica subfolders already match slugs
// exactly (cardiologia, dermatologia, emergencia, …), as do the standalone areas
// (cirurgia-geral, ginecologia, obstetricia, pediatria, saude-coletiva).
const CM_SUBSPECS = new Set([
  'cardiologia', 'dermatologia', 'emergencia', 'endocrinologia', 'gastroenterologia',
  'hematologia', 'infectologia', 'nefrologia', 'neurologia', 'pneumologia',
  'psiquiatria', 'reumatologia',
]);

// ---------- docx -> clean text ----------

function docxToText(file) {
  const r = spawnSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) throw new Error(`unzip failed (${r.status}) for ${path.basename(file)} — run via Git Bash`);
  let s = r.stdout;
  s = s.replace(/<\/w:p>/g, '\n');
  s = s.replace(/<w:br\b[^>]*\/?>/g, '\n');
  s = s.replace(/<w:tab\b[^>]*\/?>/g, ' ');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
  return s;
}

function cleanDocText(raw) {
  const lines = raw.split(/\r?\n/).map((line) => line.replace(/ /g, ' ').replace(/\*\*/g, '').trimEnd());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- split into questions ----------
// A header line is "Questão N" at line start (any case) — allowing an optional
// "Mini Simulado … " title prefix glued in front (cirurgia's Q1) and an optional
// short trailing suffix after the number ("– ajustada", ":", etc.). Anchoring to
// the whole line (nothing but a short suffix after N) avoids false splits on a
// mid-stem "questão N" mention, which is always followed by a full sentence.
const Q_HEADER = /^\s*(?:mini\s+simulado[^\n]*?)?quest[aã]o\s+(\d+)\s*(?:[–\-—:.][^\n]{0,60})?\s*$/i;

function splitQuestions(cleanText, label) {
  const lines = cleanText.split('\n');
  const heads = [];
  for (let i = 0; i < lines.length; i++) if (Q_HEADER.test(lines[i])) heads.push(i);
  const chunks = [];
  for (let h = 0; h < heads.length; h++) {
    chunks.push(lines.slice(heads[h], h + 1 < heads.length ? heads[h + 1] : lines.length).join('\n').trim());
  }

  // Some source docs contain a draft block followed by a "versão ajustada"
  // (final) block — the title + "Questão 1" repeat, so the number sequence
  // resets. Segment on every reset (n <= prev) and keep the LARGEST block
  // (ties → last), i.e. the complete final version.
  const numOf = (c) => { const m = c.match(/quest[aã]o\s+(\d+)/i); return m ? +m[1] : 0; };
  const blocks = [];
  let cur = [], prev = 0;
  for (const c of chunks) {
    const n = numOf(c);
    if (cur.length && n <= prev) { blocks.push(cur); cur = []; }
    cur.push(c); prev = n;
  }
  if (cur.length) blocks.push(cur);
  if (blocks.length <= 1) return chunks;
  let best = blocks[0];
  for (const b of blocks) if (b.length >= best.length) best = b;
  console.warn(`  ↺ ${label}: ${blocks.length} blocks (sizes ${blocks.map((b) => b.length).join('+')}) — kept last/largest (${best.length}) as final version`);
  return best;
}

// ---------- parse one question chunk ----------

// The answer line is "✔ Alternativa correta: (X) …". Case-SENSITIVE "Alternativa"
// + line anchor distinguishes it from the common stem lead-in "…assinale a
// alternativa correta:" (lowercase 'a', mid-line), which would otherwise cut the
// options off the question.
const ANSWER_LINE = /^\s*✔?\s*Alternativa\s+correta:\s*\(([A-E])\)/;

function parseChunk(chunk) {
  const lines = chunk.split('\n');
  const header = lines[0];
  // Number comes from the "Questão N" token specifically (not the first digit,
  // which for a title-glued header would be the "Simulado 03").
  const numM = header.match(/quest[aã]o\s+(\d+)/i);
  const number = numM ? numM[1] : (header.match(/\d+/) || [null])[0];

  // Find the answer line; everything before it is the question, from it on is the
  // answer/explanation block.
  let ansIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (ANSWER_LINE.test(lines[i])) { ansIdx = i; break; }
  }
  if (ansIdx === -1) return { error: 'no "✔ Alternativa correta:" line', number };
  const questionPart = lines.slice(1, ansIdx).join('\n').trim();
  const answerPart = lines.slice(ansIdx).join('\n').trim();

  // Options: normally packed inline "(A) …(B) …(C) …(D) …". Try line-anchored
  // first, then inline fallback.
  let optMatches = [...questionPart.matchAll(/^\(([A-E])\)\s*/gm)].map((m) => ({ letter: m[1], idx: m.index, after: m.index + m[0].length }));
  if (optMatches.length < 4) {
    const im = [...questionPart.matchAll(/\(([A-E])\)\s+/g)].map((m) => ({ letter: m[1], idx: m.index, after: m.index + m[0].length }));
    if (im.length >= 4) optMatches = im;
  }
  if (optMatches.length < 4) return { error: `only ${optMatches.length} options found`, number };
  if (optMatches.length > 5) return { error: `${optMatches.length} options found (>5)`, number };

  const stem = questionPart.slice(0, optMatches[0].idx).trim();
  const options = [];
  for (let i = 0; i < optMatches.length; i++) {
    const b = i + 1 < optMatches.length ? optMatches[i + 1].idx : questionPart.length;
    options.push(questionPart.slice(optMatches[i].after, b).trim().replace(/\s*\n\s*/g, ' '));
  }
  const letters = ['A', 'B', 'C', 'D', 'E'].slice(0, options.length);

  const direct = answerPart.match(/Alternativa\s+correta:\s*\(([A-E])\)/i);
  const correct = direct ? direct[1] : null;
  if (!correct) return { error: 'no correct letter parsed', number };

  // Per-distractor feedback: block after "Por que as outras estão erradas?"
  // (inline "(B) Errada. …(C) Errada. …"). Ends at Conceito-chave or end.
  const distractor = { A: '', B: '', C: '', D: '', E: '' };
  const whyRe = /Por\s+que\s+as\s+outras\s+est[aã]o\s+erradas\?\s*([\s\S]*?)(?=\n?\s*Conceito-chave:|$)/i;
  const wm = answerPart.match(whyRe);
  if (wm) {
    for (const lm of wm[1].matchAll(/\(([A-E])\)\s*([\s\S]*?)(?=\s*\([A-E]\)\s|$)/g)) {
      distractor[lm[1]] = lm[2].trim().replace(/\s*\n\s*/g, ' ');
    }
  }

  // Explanation = Comentário + Conceito-chave (the "Por que…" block is dropped —
  // already captured per-distractor).
  const comentM = answerPart.match(/Coment[aá]rio:\s*([\s\S]*?)(?=\n?\s*Por\s+que\s+as\s+outras|\n?\s*Conceito-chave:|$)/i);
  const conceitoM = answerPart.match(/Conceito-chave:\s*([\s\S]*?)$/i);
  const comment = comentM ? comentM[1].trim().replace(/\s*\n\s*/g, ' ') : '';
  const conceito = conceitoM ? conceitoM[1].trim().replace(/\s*\n\s*/g, ' ') : '';

  return { number, stem, options, letters, correct, distractor, comment, conceito };
}

function buildExplanationHtml(comment, conceito) {
  const out = [];
  if (comment) out.push(`<h4>Comentário</h4>\n<p>${escapeHtml(comment)}</p>`);
  if (conceito) out.push(`<h4>Conceito-chave</h4>\n<ul class="resumo"><li>${escapeHtml(conceito)}</li></ul>`);
  return out.join('\n') || null;
}

// ---------- walk the tree ----------

function collectFiles() {
  const out = []; // { group, specSlug, num, file }
  const numOf = (name) => { const m = name.match(/(\d+)/); return m ? parseInt(m[1], 10) : null; };

  const geralDir = path.join(ROOT, 'geral', 'geral');
  for (const f of fs.readdirSync(geralDir)) {
    if (!/\.docx$/i.test(f) || f.startsWith('~$')) continue;
    out.push({ group: 'geral', specSlug: null, num: numOf(f), file: path.join(geralDir, f) });
  }

  const areasDir = path.join(ROOT, 'por-areas', 'por-areas');
  for (const area of fs.readdirSync(areasDir, { withFileTypes: true })) {
    if (!area.isDirectory()) continue;
    const areaPath = path.join(areasDir, area.name);
    if (area.name === 'clinica-medica') {
      for (const sub of fs.readdirSync(areaPath, { withFileTypes: true })) {
        if (!sub.isDirectory()) continue;
        if (!CM_SUBSPECS.has(sub.name)) { console.warn('  ! unmapped CM subspec:', sub.name); continue; }
        for (const f of fs.readdirSync(path.join(areaPath, sub.name))) {
          if (!/\.docx$/i.test(f) || f.startsWith('~$')) continue;
          out.push({ group: 'por-area', specSlug: sub.name, num: numOf(f), file: path.join(areaPath, sub.name, f) });
        }
      }
    } else {
      for (const f of fs.readdirSync(areaPath)) {
        if (!/\.docx$/i.test(f) || f.startsWith('~$')) continue;
        out.push({ group: 'por-area', specSlug: area.name, num: numOf(f), file: path.join(areaPath, f) });
      }
    }
  }
  return out.sort((a, b) => (a.specSlug ?? '~geral').localeCompare(b.specSlug ?? '~geral') || a.num - b.num);
}

function main() {
  if (!fs.existsSync(ROOT)) { console.error('Root not found:', ROOT); process.exit(1); }
  const files = collectFiles();
  const result = [];
  const warnings = [];
  let qTotal = 0;

  for (const t of files) {
    if (t.num == null) { warnings.push(`${t.file}: could not derive number`); continue; }
    let text;
    try { text = docxToText(t.file); } catch (e) { warnings.push(`${t.specSlug ?? 'geral'}#${t.num}: ${e.message}`); continue; }
    const chunks = splitQuestions(cleanDocText(text), `${t.specSlug ?? 'geral'}#${t.num}`);
    const questions = [];
    let pos = 0;
    for (const chunk of chunks) {
      const p = parseChunk(chunk);
      if (p.error) { warnings.push(`${t.specSlug ?? 'geral'}#${t.num} Q${p.number ?? '?'}: ${p.error}`); continue; }
      pos += 1;
      const stemHtml = p.stem.split('\n').filter((l) => l.trim()).map((l) => `<p>${escapeHtml(l.trim())}</p>`).join('\n');
      questions.push({
        position: pos,
        // Heading uses the sequential position (1..N), not the source number, so
        // a doc that starts numbering at 2 (cirurgia#9) has no gap.
        question: `<h3><strong>Questão ${pos}</strong></h3>\n${stemHtml}`,
        answers: p.letters.map((L, i) => ({
          text: `<div><strong>(${L}) ${escapeHtml(p.options[i])}</strong></div>`,
          correct: L === p.correct,
          feedback: L === p.correct ? '' : (p.distractor[L] || ''),
        })),
        explanation_html: buildExplanationHtml(p.comment, p.conceito),
      });
      qTotal += 1;
    }
    if (!questions.length) { warnings.push(`${t.specSlug ?? 'geral'}#${t.num}: 0 questions — SKIPPED`); continue; }
    const title = `Simulado ${t.num}`;
    result.push({
      group: t.group, specSlug: t.specSlug, num: t.num, title,
      file: t.file.replace(/\\/g, '/'), questionCount: questions.length, questions,
    });
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');

  // Summary
  const bySpec = {};
  for (const r of result) { const k = r.specSlug ?? '(geral)'; (bySpec[k] ??= { files: 0, q: 0 }); bySpec[k].files++; bySpec[k].q += r.questionCount; }
  console.log(`\nSimulados-new parse`);
  console.log(`  root : ${ROOT}`);
  console.log(`  out  : ${OUT}`);
  console.log(`  files: ${result.length}   questions: ${qTotal}`);
  console.log(`\n  per group/specialty (files, questions):`);
  for (const k of Object.keys(bySpec).sort()) console.log(`    ${k.padEnd(20)} ${String(bySpec[k].files).padStart(3)} files  ${String(bySpec[k].q).padStart(4)} q`);
  // Flag any file whose question count isn't 25 (expected).
  const odd = result.filter((r) => r.questionCount !== 25);
  if (odd.length) {
    console.log(`\n  ⚠ ${odd.length} file(s) with != 25 questions:`);
    for (const r of odd) console.log(`    - ${r.specSlug ?? 'geral'} Simulado ${r.num}: ${r.questionCount} q  (${r.file})`);
  }
  if (warnings.length) {
    console.log(`\n  ⚠ ${warnings.length} warning(s) (first 60):`);
    for (const w of warnings.slice(0, 60)) console.log(`    - ${w}`);
    if (warnings.length > 60) console.log(`    … +${warnings.length - 60} more`);
  } else console.log(`\n  ✓ no warnings`);
}

main();
