'use strict';
/**
 * import-questoes-images.js — attach question figures from the LOCAL download.
 *
 * Matches each local image (named like "<topic> <YYYY[.S]> Q<n>.png") to its
 * question by (specialty, exam-year, Questão-number), uploads it to Bunny
 * (images/quizzes/<specialty>/<clean-name>), and sets quiz_questions.media_url.
 * Searching the whole specialty by year+Q# means renamed/moved topics resolve
 * automatically. Retired-topic + outros images are reported as unmatched.
 *
 *   node scripts/import-questoes-images.js            # DRY RUN (match report)
 *   node scripts/import-questoes-images.js --apply    # upload + set media_url
 */
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');

(function () { const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8'); for (const l of raw.split('\n')) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const e = t.indexOf('='); if (e < 0) continue; const k = t.slice(0, e).trim(), v = t.slice(e + 1).trim().replace(/^["']|["']$/g, ''); if (!(k in process.env)) process.env[k] = v; } })();
function connUrl() { if (process.env.DATABASE_URL) return process.env.DATABASE_URL; const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1]; return `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`; }

const ROOT = process.env.RQ_LOCAL || 'C:/Users/jrazm/OneDrive/Desktop/Medhelpspace/questoes revalida/questoes revalida';
const CDN_BASE = 'https://medhelpspace.b-cdn.net';
const BUNNY = {
  // Use the bare storage HOST (BUNNY_STORAGE_ENDPOINT already bakes in the zone,
  // which would double it). Upload URL = https://<host>/<zone>/<path>.
  endpoint: `https://${process.env.BUNNY_STORAGE_HOSTNAME}`.replace(/\/$/, ''),
  zone: process.env.BUNNY_STORAGE_ZONE,
  key: process.env.BUNNY_API_KEY,
};
const SUBSPEC = { CARDIO: 'cardiologia', DERMATO: 'dermatologia', ENDOCRINO: 'endocrinologia', GASTRO: 'gastroenterologia', HEMATO: 'hematologia', INFECTO: 'infectologia', NEFRO: 'nefrologia', NEURO: 'neurologia', PNEUMO: 'pneumologia', PSIQUIATRIA: 'psiquiatria', REUMATO: 'reumatologia' };

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const tokens = (s) => new Set(slugify(s).split('-').filter(Boolean));
function yearMatch(qy, iy) { if (!qy || !iy) return false; const [qa, qb] = qy.split('.'); const [ia, ib] = iy.split('.'); if (qa !== ia) return false; if (qb && ib) return qb === ib; return true; }

function parseImageName(base) {
  const ym = base.match(/\b(20\d\d(?:\.[12])?)/);
  const year = ym ? ym[1] : null;
  let qnum = null;
  const qm = base.match(/Q\s*0*(\d+)/i);
  if (qm) qnum = qm[1];
  else { const rest = (year ? base.replace(year, ' ') : base).match(/\b0*(\d{1,3})\b/); if (rest) qnum = rest[1]; }
  let hint = base;
  if (year) hint = hint.replace(year, ' ');
  hint = hint.replace(/Q\s*0*\d+/ig, ' ').replace(/\b\d{1,3}\b/g, ' ');
  return { year, qnum, hint: slugify(hint) };
}

function imageFiles() {
  const out = [];
  const add = (dir, spec) => {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (!fs.statSync(full).isFile()) continue;
      const isImg = /\.(png|jpe?g)$/i.test(f);
      const looksImg = !path.extname(f) && /Q\s*\d+/i.test(f) && /20\d\d/.test(f); // 2 odd no-ext figures
      if (isImg || looksImg) out.push({ spec, file: f, path: full });
    }
  };
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name === 'clinica-medica') {
      for (const sub of fs.readdirSync(path.join(ROOT, e.name), { withFileTypes: true })) {
        if (!sub.isDirectory()) continue;
        const spec = SUBSPEC[sub.name.trim().split(/\s+/)[0].toUpperCase()];
        if (spec) add(path.join(ROOT, e.name, sub.name), spec);
      }
    } else add(path.join(ROOT, e.name), e.name);
  }
  return out;
}

function detectExt(buf) { if (buf[0] === 0x89 && buf[1] === 0x50) return 'png'; if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg'; return 'png'; }

(async () => {
  const apply = process.argv.includes('--apply');
  const parsed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parsed', 'questoes-parsed.json'), 'utf8'));
  const recon = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parsed', 'questoes-reconciliation.json'), 'utf8'));
  const db = require('postgres')(connUrl(), { max: 1 });

  try {
    // (spec, topicSlug) -> page_id
    const keyToPage = new Map();
    for (const r of [...recon.refresh, ...recon.rename, ...recon.moved]) keyToPage.set(`${r.spec}::${r.localSlug}`, r.liveId);
    const dbPages = await db`SELECT id, slug FROM pages WHERE view='quiz' AND type='h5p-quiz'`;
    const idBySlug = new Map(dbPages.map((p) => [p.slug, p.id]));
    for (const c of recon.create) { // outros topics now exist in the DB too
      const id = idBySlug.get(c.localSlug) || idBySlug.get(`${c.localSlug}-quiz`) || idBySlug.get(`${c.localSlug}-questoes`);
      if (id) keyToPage.set(`${c.spec}::${c.localSlug}`, id);
    }

    // per-specialty question index
    const bySpec = {};
    for (const t of parsed) {
      const pid = keyToPage.get(`${t.spec}::${t.topicSlug}`);
      for (const q of t.questions) (bySpec[t.spec] ||= []).push({ topicSlug: t.topicSlug, key: `${t.spec}::${t.topicSlug}`, number: String(q.number), year: q.year, position: q.position, pageId: pid });
    }

    const matched = [], unmatched = [], ambiguous = [];
    for (const img of imageFiles()) {
      const base = img.file.replace(/\.[^.]+$/, '');
      const { year, qnum, hint } = parseImageName(base);
      const pool = (bySpec[img.spec] || []).filter((q) => qnum && q.number === String(Number(qnum)) && (year ? yearMatch(q.year, year) : true));
      if (pool.length === 0) { unmatched.push({ ...img, year, qnum, why: 'no question with that year+Q# (retired/outros/parse-gap?)' }); continue; }
      let pick = pool[0];
      if (pool.length > 1) {
        const ht = tokens(hint);
        const scored = pool.map((q) => ({ q, s: [...tokens(q.topicSlug)].filter((x) => ht.has(x)).length }));
        scored.sort((a, b) => b.s - a.s);
        if (scored[0].s === scored[1].s) { ambiguous.push({ ...img, year, qnum, cands: pool.map((q) => q.topicSlug) }); continue; }
        pick = scored[0].q;
      }
      if (!pick.pageId) { unmatched.push({ ...img, year, qnum, why: `topic ${pick.topicSlug} not in DB (retired/outros)` }); continue; }
      matched.push({ img, pick, year, qnum, base, hint });
    }

    // Guard 1 — hint conflict: the filename names a real, DIFFERENT current topic
    // in the same specialty -> likely a mislabel; don't auto-attach.
    const perSpecTopics = {};
    for (const t of parsed) (perSpecTopics[t.spec] ||= new Set()).add(t.topicSlug);
    const conflicts = [];
    let kept = matched.filter((m) => {
      if (m.hint && perSpecTopics[m.img.spec]?.has(m.hint) && m.hint !== m.pick.topicSlug) { conflicts.push(m); return false; }
      return true;
    });
    // Guard 2 — dedup: one media_url per question. Keep the first; report extras.
    const seen = new Set(), multi = [];
    const final = [];
    for (const m of kept) {
      const k = `${m.pick.pageId}:${m.pick.position}`;
      if (seen.has(k)) { multi.push(m); continue; }
      seen.add(k); final.push(m);
    }

    console.log(`\n=== Questões images  ${apply ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`  local images: ${matched.length + unmatched.length + ambiguous.length}   will attach: ${final.length}   conflicts: ${conflicts.length}   multi-skip: ${multi.length}   unmatched: ${unmatched.length}`);
    console.log(`\n  WILL ATTACH (first 40):`);
    for (const m of final.slice(0, 40)) console.log(`    ${m.img.spec}/${m.pick.topicSlug}  Q${m.qnum} ${m.year}  pos${m.pick.position}  <= ${m.img.file}`);
    if (conflicts.length) { console.log(`\n  CONFLICT — filename names a different topic (SKIPPED, review w/ Karina):`); conflicts.forEach((c) => console.log(`    ${c.img.file}  -> matched ${c.pick.topicSlug} but hint='${c.hint}'`)); }
    if (multi.length) { console.log(`\n  MULTI-IMAGE — extra figures for a question already attached (SKIPPED, single media_url):`); multi.forEach((m) => console.log(`    ${m.img.file}  (${m.img.spec}/${m.pick.topicSlug} pos${m.pick.position})`)); }
    if (unmatched.length) { console.log(`\n  UNMATCHED:`); unmatched.forEach((u) => console.log(`    ${u.spec}: ${u.file}  (${u.why})`)); }
    const matched_apply = final;

    if (!apply) { console.log(`\n  DRY RUN — re-run with --apply to upload + set media_url.`); await db.end(); return; }
    if (!BUNNY.zone || !BUNNY.key) { console.error('\n  ✗ Missing BUNNY_STORAGE_ZONE / BUNNY_API_KEY'); process.exit(1); }

    let ok = 0, fail = 0;
    for (const m of matched_apply) {
      const buf = fs.readFileSync(m.img.path);
      const ext = /\.(png|jpe?g)$/i.test(m.img.file) ? m.img.file.split('.').pop().toLowerCase() : detectExt(buf);
      const cleanName = `${slugify(m.base)}.${ext === 'jpeg' ? 'jpg' : ext}`;
      const remotePath = `images/quizzes/${m.img.spec}/${cleanName}`;
      const ctype = ext.startsWith('jp') ? 'image/jpeg' : 'image/png';
      try {
        const res = await fetch(`${BUNNY.endpoint}/${BUNNY.zone}/${remotePath}`, { method: 'PUT', headers: { AccessKey: BUNNY.key, 'Content-Type': ctype }, body: buf });
        if (!res.ok) throw new Error(`Bunny ${res.status}`);
        await db`UPDATE quiz_questions SET media_url=${`${CDN_BASE}/${remotePath}`} WHERE page_id=${m.pick.pageId} AND position=${m.pick.position}`;
        ok++; process.stdout.write('.');
      } catch (e) { fail++; console.error(`\n  ✗ ${m.img.file}: ${e.message}`); }
    }
    console.log(`\n  ✓ uploaded + linked ${ok} images${fail ? `, ${fail} failed` : ''}.`);
  } finally { await db.end(); }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
