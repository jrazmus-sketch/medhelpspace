'use strict';
/**
 * import-questoes-images-v2.js — attach Questões figures from the 2026-09-20 delivery.
 * Successor of import-questoes-images.js (June), which targeted (page_id, parsed position):
 * apply-questoes-v2.js re-orders every topic chronologically, so parsed positions no longer
 * point at the right row. This one matches on what the live row SAYS — its heading
 * "Questão N · Revalida YYYY" — so it is immune to ordering.
 *
 *   node scripts/import-questoes-images-v2.js            # DRY RUN — match report (PROD via app/.env.local)
 *   node scripts/import-questoes-images-v2.js --apply    # upload to Bunny + set media_url (one DB transaction)
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/import-questoes-images-v2.js --apply
 *
 * Only EMPTY media_url is ever filled. A question that already shows a figure keeps it —
 * if the file maps to a different URL it is reported, never overwritten. Re-run safe.
 *
 * File names in this delivery: "<topic> Q<n> <year>", "<topic> <year> <n>",
 * "<topic>-q_15_26.1" / "<topic>-q40_26.1" (2026.1 tree), and a few with NO extension
 * (type read from the file's magic bytes). Specialty comes from the folder, like the parser:
 * "clinica-medica*" → subspecialty folders (CARDIO…/full names), "20XX.S …" folders are
 * supplement trees holding one exam.
 * Remote path: images/quizzes/<specialty>/<slug-of-file-name>.<ext> (the June convention).
 *
 * TABLE PICTURES: many figures are just a picture of a lab table that Karina now also
 * TYPED into the question (Word table → .quiz-table). Showing both would print every table
 * twice, and on 2026-09-20 she was told her typed tables replace the pictures. Each file in
 * TABLE_PICTURES was compared by eye (2026-09-22) against its typed table: every value is
 * in the typed version. On a question that carries a typed table, a listed file is never
 * attached, and if it is already attached it is CLEARED (exact-URL guard).
 * Icterícia Neonatal Q73's picture was the one exception — its phototherapy /
 * exsanguinotransfusion grid existed only there — until Karina approved typing that grid out
 * (scripts/patch-ictericia-q73-table.js, 2026-09-22); it is now listed like the rest.
 */
const fs = require('fs');
const path = require('path');

(function () { const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8'); for (const l of raw.split('\n')) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const e = t.indexOf('='); if (e < 0) continue; const k = t.slice(0, e).trim(), v = t.slice(e + 1).trim().replace(/^["']|["']$/g, ''); if (!(k in process.env)) process.env[k] = v; } })();

const ROOT = process.env.RQ_LOCAL || 'C:/Users/jrazm/OneDrive/Desktop/Medhelpspace/questoes revalida 09-20-2026/#questoes revalida';
const CDN_BASE = 'https://medhelpspace.b-cdn.net';
const SUBSPEC = { CARDIO: 'cardiologia', DERMATO: 'dermatologia', ENDOCRINO: 'endocrinologia', GASTRO: 'gastroenterologia', HEMATO: 'hematologia', INFECTO: 'infectologia', NEFRO: 'nefrologia', NEURO: 'neurologia', PNEUMO: 'pneumologia', PSIQUIATRIA: 'psiquiatria', REUMATO: 'reumatologia' };
const SPEC_FULL = new Set(Object.values(SUBSPEC));
const SUPPLEMENT_RE = /^20\d\d\.[12]\b/;
const HEAD_RE = /Quest[aã]o\s+0*(\d+)[^<]{0,8}?Revalida\s+(20\d\d(?:\.[12])?)/;
const TABLE_PICTURES = new Set([
  'cardiologia/tamponamento-cardiaco-q91-2024-1.png',
  'cirurgia-geral/hernia-q10-2025-2.png', 'cirurgia-geral/pancreatite-2024-1-77.png', 'cirurgia-geral/pancreatite-q-38-2025-2.png',
  'dermatologia/farmacodermias-q-15-26-1.png',
  'emergencia/choque-2025-1-q47.png',
  'endocrinologia/diabetes-q40-26-1.png', 'endocrinologia/doenca-das-adrenais-q76-2024-2.png',
  'gastroenterologia/hepatites-virais-q-79-2020.png', 'gastroenterologia/hepatites-virais-q91-2022-1.png',
  'gastroenterologia/ictericia-e-hiperbilirrubinemias-q91-26-1.png',
  'ginecologia/sangramento-uterino-anormal-2025-1-q54.png',
  'hematologia/anemia-falciforme-q86-2025-2.png', 'hematologia/anemia-ferropriva-2025-1-q83-1.png',
  // Q83 and Q29 came as several pictures (each table alone + both together); all typed.
  'hematologia/anemia-ferropriva-2025-1-q83-2.png', 'hematologia/anemia-ferropriva-2025-1-q83.jpg',
  'infectologia/arboviroses-2025-1-q29-1.png', 'infectologia/arboviroses-2025-1-q29-2.png',
  'hematologia/anemia-megaloblastica-q53-2025-1.png', 'hematologia/disturbios-da-hemostasia-primaria-q73-26-1.png',
  'hematologia/mieloma-multiplo-q-71-2023-2.png',
  'infectologia/arboviroses-2025-1-q29-1-e-29-2.png', 'infectologia/arboviroses-2025-1-q51.png', 'infectologia/leptospirose-q-36-2024-1.png',
  'nefrologia/drc-q66-2024-2.png', 'nefrologia/injuria-renal-aguda-q72-26-1.png', 'nefrologia/sindrome-nefrotica-q15-2025-2.png',
  'neurologia/avc-hemorragico-2025-1-q70.png', 'neurologia/sindrome-guillain-barre-q21-2024-1.png',
  'obstetricia/assistencia-pre-natal-q14-2024-1.png', 'obstetricia/infeccao-urinaria-na-gestacao-q04-26-1.png',
  'pediatria/crescimento-e-desenvolvimento-infantil-q21-26-1.png', 'pediatria/ictericia-neonatal-2024-2-23.png',
  // Its reference grid was typed out on 2026-09-22 (scripts/patch-ictericia-q73-table.js),
  // so this picture is now fully redundant like the rest.
  'pediatria/ictericia-neonatal-2024-2q73-atualizado.jpg',
  'pneumologia/dpoc-2025-1-q21.png',
  'reumatologia/artrite-infecciosa-q96-26-1.png', 'reumatologia/lupus-q71-2022-1.png',
  'saude-coletiva/indicadores-de-saude-q20-26-1.png',
]);
// Compared WITHOUT the extension: June named files by their extension, v2 by their bytes,
// and several ".png" files are really JPEGs — same picture, two URLs.
const noExt = (s) => s.replace(/\.(png|jpe?g)$/i, '');
const TABLE_PICTURE_KEYS = new Set([...TABLE_PICTURES].map(noExt));
const tablePicOf = (url) => noExt((url || '').replace(/^.*\/images\/quizzes\//, ''));
TABLE_PICTURES.has = (k) => TABLE_PICTURE_KEYS.has(noExt(k));
const hasTypedTable = (html) => html.includes('class="quiz-table"');

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const tokens = (s) => new Set(slugify(s).split('-').filter((x) => x && !/^\d+$/.test(x)));
function yearMatch(qy, iy) { const [qa, qb] = qy.split('.'); const [ia, ib] = iy.split('.'); if (qa !== ia) return false; return qb && ib ? qb === ib : true; }
function magicExt(buf) { if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'; if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg'; return null; }

function parseName(base) {
  // "2024.2Q73" → "2024.2 Q73", so the year and the Q# separate
  let rest = base.replace(/(\d)(q\s*\d)/gi, '$1 $2'); let year = null;
  const short = rest.match(/_(\d\d)\.([12])$/); // "…_26.1" (2026.1 tree); NOT "Q29.1 e 29.2"
  if (short) { year = `20${short[1]}.${short[2]}`; rest = rest.slice(0, short.index); }
  else { const y = rest.match(/\b(20\d\d(?:\.[12])?)\b/); if (y) { year = y[1]; rest = rest.replace(y[0], ' '); } }
  let qnum = null;
  const q = rest.match(/(?:^|[\s_-])q\s*_?\s*0*(\d{1,3})\b/i);
  if (q) { qnum = +q[1]; rest = rest.replace(q[0], ' '); }
  else { const n = rest.match(/\b0*(\d{1,3})\b/); if (n) { qnum = +n[1]; rest = rest.replace(n[0], ' '); } }
  return { year, qnum, hint: slugify(rest) };
}

function imageFiles() {
  const out = [];
  const add = (dir, spec, rel) => {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (!fs.statSync(full).isFile() || /\.docx$/i.test(f) || f.startsWith('~$')) continue;
      const hasExt = /\.(png|jpe?g)$/i.test(f);
      if (!hasExt && path.extname(f) && !/\.\d$/.test(f)) continue; // other file types ("_26.1" is not an extension)
      const buf = fs.readFileSync(full);
      const ext = magicExt(buf);
      if (!ext) { if (hasExt) out.push({ spec, file: f, rel: `${rel}/${f}`, path: full, bad: 'not a PNG/JPEG by content' }); continue; }
      out.push({ spec, file: f, rel: `${rel}/${f}`, path: full, ext, base: hasExt ? f.replace(/\.[^.]+$/, '') : f });
    }
  };
  const walk = (root, rel, supplement) => {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const here = path.join(root, e.name); const r = rel ? `${rel}/${e.name}` : e.name;
      if (!supplement && SUPPLEMENT_RE.test(e.name)) { walk(here, r, true); continue; }
      if (/^clinica[- ]medica\b/i.test(e.name.trim())) {
        for (const sub of fs.readdirSync(here, { withFileTypes: true })) {
          if (!sub.isDirectory()) continue;
          const first = sub.name.trim().split(/\s+/)[0];
          const spec = SUBSPEC[first.toUpperCase()] || (SPEC_FULL.has(slugify(first)) ? slugify(first) : null);
          if (spec) add(path.join(here, sub.name), spec, `${r}/${sub.name}`);
          else console.warn(`  ! unmapped subspecialty folder: ${r}/${sub.name}`);
        }
      } else add(here, slugify(e.name), r);
    }
  };
  walk(ROOT, '', false);
  return out;
}

(async () => {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL missing'); process.exit(1); }
  const target = url.includes('127.0.0.1') ? 'LOCAL' : 'PROD';
  const db = require('postgres')(url, { max: 1, prepare: false, ssl: target === 'LOCAL' ? false : 'require', onnotice: () => {} });

  try {
    const rows = await db`
      SELECT q.id, q.page_id, q.position, q.question, q.media_url, p.slug, s.slug AS spec
      FROM quiz_questions q JOIN pages p ON p.id = q.page_id JOIN specialties s ON s.id = p.specialty_id
      WHERE p.view = 'quiz' AND p.type = 'h5p-quiz' AND p.status = 'publish' AND p.track_id IS NULL AND p.content_module_id IS NULL`;
    const bySpec = {};
    for (const r of rows) {
      const m = r.question.match(HEAD_RE);
      if (!m) continue;
      (bySpec[r.spec] ||= []).push({ ...r, number: +m[1], year: m[2] });
    }
    const topicsBySpec = {};
    for (const r of rows) (topicsBySpec[r.spec] ||= new Set()).add(r.slug);

    const plan = []; const already = []; const hasOther = []; const unmatched = []; const ambiguous = []; const conflicts = []; const bad = []; const tablePics = [];
    // Live rows still showing a table picture next to the typed table → clear.
    const clears = [];
    for (const list of Object.values(bySpec)) for (const q of list) {
      if (q.media_url && TABLE_PICTURES.has(tablePicOf(q.media_url)) && hasTypedTable(q.question)) clears.push(q);
    }
    const unusedPics = [...TABLE_PICTURES].filter((f) => !Object.values(bySpec).some((l) => l.some((q) => tablePicOf(q.media_url) === f)));
    const claimed = new Map();
    for (const img of imageFiles()) {
      if (img.bad) { bad.push(img); continue; }
      const { year, qnum, hint } = parseName(img.base);
      if (!qnum) { unmatched.push({ img, why: 'no question number in the file name' }); continue; }
      let pool = (bySpec[img.spec] || []).filter((q) => q.number === qnum && (year ? yearMatch(q.year, year) : true));
      if (!pool.length) { unmatched.push({ img, why: `no live ${img.spec} question Q${qnum}${year ? ' ' + year : ''}` }); continue; }
      if (pool.length > 1) {
        const ht = tokens(hint);
        const scored = pool.map((q) => ({ q, s: [...tokens(q.slug)].filter((x) => ht.has(x)).length })).sort((a, b) => b.s - a.s);
        if (scored[0].s === 0 || scored[0].s === scored[1].s) { ambiguous.push({ img, cands: pool.map((q) => `${q.slug}@${q.year}`) }); continue; }
        pool = [scored[0].q];
      }
      const q = pool[0];
      // The name spells out a DIFFERENT live topic of the same specialty → probable mislabel.
      if (hint && topicsBySpec[img.spec]?.has(hint) && hint !== q.slug) { conflicts.push({ img, q, hint }); continue; }
      const remote = `images/quizzes/${img.spec}/${slugify(img.base)}.${img.ext}`;
      const cdn = `${CDN_BASE}/${remote}`;
      if (TABLE_PICTURES.has(tablePicOf(cdn)) && hasTypedTable(q.question)) { tablePics.push({ img, q }); continue; }
      if (claimed.has(q.id)) { hasOther.push({ img, q, why: `second figure for the same question (first: ${claimed.get(q.id)})` }); continue; }
      claimed.set(q.id, img.file);
      if (q.media_url === cdn) { already.push({ img, q }); continue; }
      if (q.media_url) { hasOther.push({ img, q, why: `already shows ${q.media_url}` }); continue; }
      plan.push({ img, q, remote, cdn });
    }

    console.log(`\n=== Questões images v2  [target: ${target}]  ${apply ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`  source: ${ROOT}`);
    console.log(`  WILL ATTACH: ${plan.length}   already attached (same URL): ${already.length}   kept (question already has a different figure): ${hasOther.length}`);
    console.log(`  unmatched: ${unmatched.length}   ambiguous: ${ambiguous.length}   name conflicts: ${conflicts.length}   unreadable: ${bad.length}`);
    console.log(`  TABLE PICTURES (typed table replaces the picture): ${tablePics.length} not attached, ${clears.length} to CLEAR from live rows`);
    for (const p of plan) console.log(`    + ${p.q.slug} Q${p.q.number} ${p.q.year}  <=  ${p.img.rel}${/\.(png|jpe?g)$/i.test(p.img.file) ? '' : `  (no extension → ${p.img.ext})`}`);
    for (const c of clears) console.log(`    − ${c.slug} Q${c.number} ${c.year}  (clear ${tablePicOf(c.media_url)})`);
    if (unusedPics.length) console.log(`  (TABLE_PICTURES not attached anywhere on ${target}: ${unusedPics.length} — expected for the new 2026.1 files before their first run)`);
    if (hasOther.length) { console.log('  kept:'); hasOther.forEach((h) => console.log(`    = ${h.q.slug} Q${h.q.number} ${h.q.year}  (${h.img.rel}) — ${h.why}`)); }
    if (unmatched.length) { console.log('  unmatched:'); unmatched.forEach((u) => console.log(`    ? ${u.img.rel} — ${u.why}`)); }
    if (ambiguous.length) { console.log('  ambiguous:'); ambiguous.forEach((a) => console.log(`    ? ${a.img.rel} — ${a.cands.join(', ')}`)); }
    if (conflicts.length) { console.log('  name conflicts (skipped):'); conflicts.forEach((c) => console.log(`    ! ${c.img.rel} → matched ${c.q.slug} but the name says '${c.hint}'`)); }
    if (bad.length) { console.log('  unreadable:'); bad.forEach((b) => console.log(`    ! ${b.rel} — ${b.bad}`)); }
    if (!apply) { console.log('\n  DRY RUN — re-run with --apply to upload + link.'); return; }
    if (!plan.length && !clears.length) { console.log('\n  nothing to do.'); return; }

    const endpoint = `https://${process.env.BUNNY_STORAGE_HOSTNAME}`.replace(/\/$/, '');
    const zone = process.env.BUNNY_STORAGE_ZONE; const key = process.env.BUNNY_API_KEY;
    if (!process.env.BUNNY_STORAGE_HOSTNAME || !zone || !key) { console.error('✗ Missing BUNNY_STORAGE_HOSTNAME / BUNNY_STORAGE_ZONE / BUNNY_API_KEY'); process.exit(1); }
    for (const p of plan) { // uploads first (idempotent PUT); the DB only links files that are really there
      const res = await fetch(`${endpoint}/${zone}/${p.remote}`, { method: 'PUT', headers: { AccessKey: key, 'Content-Type': p.img.ext === 'jpg' ? 'image/jpeg' : 'image/png' }, body: fs.readFileSync(p.img.path) });
      if (!res.ok) { console.error(`✗ upload ${p.remote}: HTTP ${res.status}`); process.exit(1); }
      const head = await fetch(p.cdn, { method: 'HEAD' });
      if (!head.ok) { console.error(`✗ ${p.cdn} not served after upload (HTTP ${head.status})`); process.exit(1); }
    }
    await db.begin(async (sql) => {
      for (const p of plan) {
        const r = await sql`UPDATE quiz_questions SET media_url = ${p.cdn} WHERE id = ${p.q.id} AND media_url IS NULL`;
        if (r.count !== 1) throw new Error(`question ${p.q.id} changed under us`);
      }
      for (const c of clears) {
        const r = await sql`UPDATE quiz_questions SET media_url = NULL WHERE id = ${c.id} AND media_url = ${c.media_url} AND question LIKE '%class="quiz-table"%'`;
        if (r.count !== 1) throw new Error(`question ${c.id} changed under us`);
      }
    });
    const [{ n }] = await db`SELECT count(*)::int n FROM quiz_questions q JOIN pages p ON p.id = q.page_id
      WHERE p.view = 'quiz' AND p.type = 'h5p-quiz' AND p.status = 'publish' AND p.track_id IS NULL AND p.content_module_id IS NULL AND q.media_url IS NOT NULL`;
    console.log(`\n  ✓ ${plan.length} figure(s) uploaded + linked on ${target}. Questões with a figure now: ${n}.`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
