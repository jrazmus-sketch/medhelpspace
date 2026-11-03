'use strict';
/**
 * repair-quiz-explanation-format.js — puts back the comment formatting the old admin editor
 * stripped (Karina 2026-11-02, "Correção da formatação dos comentários após edição das
 * questões – Revalida"). FORMATTING ONLY: her current wording is kept word for word, and the
 * script refuses to write a row whose text would change.
 *
 *   node scripts/repair-quiz-explanation-format.js            # DRY RUN — before/after (PROD via app/.env.local)
 *   node scripts/repair-quiz-explanation-format.js --apply    # one transaction + rollback file in parsed/
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/repair-quiz-explanation-format.js --apply   # local
 *
 * The damage, as the old editor (TipTap without the question vocabulary) left it:
 *   <h4>Comentário:</h4>            → <p>Comentário:</p>          (every section title)
 *   <ul class="pega|certo|resumo">  → <ul>
 *   <li>x</li>                      → <li><p>x</p></li>,  plus a trailing <p></p>
 * The repair rebuilds the shape every sibling question has: the section titles become <h4>,
 * the first list after "PEGA REVALIDA:" is ul.pega and a list right after it is ul.certo
 * (the ✔ closing line), the list after "Resumo-chave:" is ul.resumo.
 *
 * Only the rows listed in TARGETS, and only while they still carry the damage (a row that
 * already has an <h4> is skipped), so a re-run is a no-op.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'app', '.env.local'), quiet: true });
const postgres = require('postgres');

// Found by scanning every quiz_questions row for the editor's fingerprint (<li><p>) on 2026-11-03.
const TARGETS = [
  { id: 3153, what: 'fibromialgia · Questão 96 · Revalida 2022.2 (Karina\'s e-mail)' },
  { id: 2631, what: 'trauma-raquimedular · Questão 17 · Revalida 2023.1' },
];

const SECTION_TITLES = ['Comentário:', 'PEGA REVALIDA:', 'Resumo-chave:', 'Análise das alternativas incorretas:'];

function text(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function repair(html) {
  let s = html
    .replace(/<li([^>]*)><p>((?:(?!<\/?p[\s>]).)*?)<\/p><\/li>/gs, '<li$1>$2</li>')
    .replace(/(?:\s*<p>\s*<\/p>)+\s*$/g, '');
  for (const t of SECTION_TITLES) s = s.split(`<p>${t}</p>`).join(`<h4>${t}</h4>`);
  // Lists take their class from the section they sit in.
  const blocks = s.match(/<h4>.*?<\/h4>|<ul[^>]*>.*?<\/ul>|<p>.*?<\/p>/gs) ?? [];
  if (blocks.join('') !== s.replace(/>\s+</g, '><').trim()) throw new Error('unexpected block layout');
  let section = '';
  let prev = '';
  const out = blocks.map((b) => {
    if (b.startsWith('<h4>')) { section = b; prev = 'h4'; return b; }
    if (b.startsWith('<ul>')) {
      let cls = null;
      if (section === '<h4>PEGA REVALIDA:</h4>') cls = prev === 'ul.pega' ? 'certo' : prev === 'h4' ? 'pega' : null;
      if (section === '<h4>Resumo-chave:</h4>' && prev === 'h4') cls = 'resumo';
      prev = cls ? `ul.${cls}` : 'ul';
      return cls ? b.replace('<ul>', `<ul class="${cls}">`) : b;
    }
    prev = 'p';
    return b;
  });
  return out.join('\n');
}

const sqlLiteral = (s) => (s === null ? 'NULL' : `'${s.replace(/'/g, "''")}'`);

(async () => {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  const local = /127\.0\.0\.1|localhost/.test(url);
  const sql = postgres(url, { ssl: local ? false : 'require', max: 1 });
  const label = local ? 'local' : 'prod';
  const plan = [];
  for (const t of TARGETS) {
    const [row] = await sql`select id, explanation_html from quiz_questions where id = ${t.id}`;
    if (!row) { console.log(`#${t.id} ${t.what}: not in ${label} — skipped`); continue; }
    if (/<h4>/.test(row.explanation_html) || !/<li><p>/.test(row.explanation_html)) {
      console.log(`#${t.id} ${t.what}: no editor damage in ${label} — skipped`);
      continue;
    }
    const fixed = repair(row.explanation_html);
    if (text(fixed) !== text(row.explanation_html)) throw new Error(`#${t.id}: the repair would change the text — refusing`);
    for (const need of ['<h4>Comentário:</h4>', '<h4>PEGA REVALIDA:</h4>', '<ul class="pega">', '<h4>Resumo-chave:</h4>', '<ul class="resumo">']) {
      if (!fixed.includes(need)) throw new Error(`#${t.id}: expected ${need} after repair`);
    }
    console.log(`\n#${t.id} ${t.what}\n--- after:\n${fixed}`);
    plan.push({ id: t.id, before: row.explanation_html, after: fixed });
  }
  if (!plan.length) { console.log('\nnothing to do'); await sql.end(); return; }
  if (!apply) { console.log(`\nDRY RUN — ${plan.length} row(s) would be repaired in ${label}. Re-run with --apply.`); await sql.end(); return; }

  const stamp = new Date().toISOString().slice(0, 10);
  const rollback = path.join(__dirname, '..', 'parsed', `quiz-format-repair-rollback-${stamp}-${label}.sql`);
  fs.mkdirSync(path.dirname(rollback), { recursive: true });
  fs.writeFileSync(rollback, ['BEGIN;', ...plan.map((p) => `UPDATE quiz_questions SET explanation_html = ${sqlLiteral(p.before)} WHERE id = ${p.id};`), 'COMMIT;', ''].join('\n'));
  await sql.begin(async (tx) => {
    for (const p of plan) {
      const r = await tx`update quiz_questions set explanation_html = ${p.after} where id = ${p.id} and explanation_html = ${p.before}`;
      if (r.count !== 1) throw new Error(`#${p.id} changed while running — nothing written`);
    }
  });
  console.log(`\nAPPLIED ${plan.length} row(s) in ${label}. Rollback: ${path.relative(process.cwd(), rollback)}`);
  await sql.end();
})().catch((e) => { console.error(e); process.exit(1); });
