'use strict';
/**
 * inspect-questoes.js — READ-ONLY. Maps the live "Questões Revalida" (view='quiz')
 * section structure and diffs it against the local downloaded docx topics so we
 * can decide a clean replace. Runs SELECTs only; never writes.
 *
 *   node scripts/inspect-questoes.js
 */
const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
function connUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
  return `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`;
}

const LOCAL_ROOT = process.env.RQ_LOCAL || 'C:/Users/jrazm/OneDrive/Desktop/Medhelpspace/questoes revalida/questoes revalida';
const SUBSPEC = { CARDIO: 'cardiologia', DERMATO: 'dermatologia', ENDOCRINO: 'endocrinologia', GASTRO: 'gastroenterologia', HEMATO: 'hematologia', INFECTO: 'infectologia', NEFRO: 'nefrologia', NEURO: 'neurologia', PNEUMO: 'pneumologia', PSIQUIATRIA: 'psiquiatria', REUMATO: 'reumatologia' };

function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function isSkip(base) { return /\bn[aã]o\b/i.test(base.replace(/_/g, ' ')); }

function localTopics() {
  const out = []; // {spec, topic}
  for (const entry of fs.readdirSync(LOCAL_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'clinica-medica') {
      for (const sub of fs.readdirSync(path.join(LOCAL_ROOT, entry.name), { withFileTypes: true })) {
        if (!sub.isDirectory()) continue;
        const spec = SUBSPEC[sub.name.split(/\s+/)[0].toUpperCase()];
        if (!spec) { console.warn('  ! unmapped subspec:', sub.name); continue; }
        for (const f of fs.readdirSync(path.join(LOCAL_ROOT, entry.name, sub.name))) {
          if (!f.toLowerCase().endsWith('.docx')) continue;
          const base = f.replace(/\.docx$/i, '');
          if (isSkip(base)) continue;
          out.push({ spec, topic: slugify(base) });
        }
      }
    } else {
      const spec = entry.name; // already canonical (cirurgia-geral, emergencia, ginecologia, obstetricia, pediatria, saude-coletiva, outros)
      for (const f of fs.readdirSync(path.join(LOCAL_ROOT, entry.name))) {
        if (!f.toLowerCase().endsWith('.docx')) continue;
        const base = f.replace(/\.docx$/i, '');
        if (isSkip(base)) continue;
        out.push({ spec, topic: slugify(base) });
      }
    }
  }
  return out;
}

const norm = (slug) => slug.replace(/-(quiz|questoes|revalida-up)$/i, '');

(async () => {
  loadEnvLocal();
  const postgres = require('postgres');
  const db = postgres(connUrl(), { max: 1 });
  try {
    console.log('=== pages by (type, view) ===');
    for (const r of await db`SELECT type, view, count(*)::int n FROM pages GROUP BY type, view ORDER BY n DESC`)
      console.log(`  ${String(r.n).padStart(4)}  type=${r.type}  view=${r.view ?? 'NULL'}`);

    console.log('\n=== view=quiz: by page type ===');
    for (const r of await db`SELECT type, status, count(*)::int n FROM pages WHERE view='quiz' GROUP BY type, status ORDER BY n DESC`)
      console.log(`  ${String(r.n).padStart(4)}  type=${r.type}  status=${r.status}`);

    console.log('\n=== view=quiz topic pages (h5p-quiz) per specialty ===');
    for (const r of await db`SELECT COALESCE(s.slug,'(none)') spec, count(*)::int n FROM pages p LEFT JOIN specialties s ON s.id=p.specialty_id WHERE p.view='quiz' AND p.type='h5p-quiz' GROUP BY s.slug ORDER BY n DESC`)
      console.log(`  ${String(r.n).padStart(4)}  ${r.spec}`);

    const quizQ = await db`SELECT count(*)::int n FROM quiz_questions q JOIN pages p ON p.id=q.page_id WHERE p.view='quiz'`;
    console.log(`\n=== quiz_questions under view=quiz pages: ${quizQ[0].n}`);

    const att = await db`SELECT count(*)::int n FROM quiz_attempts`;
    const rev = await db`SELECT count(*)::int n FROM review_schedule WHERE item_type='quiz_question'`;
    console.log(`=== user progress: quiz_attempts=${att[0].n}  review_schedule(quiz_question)=${rev[0].n}`);

    console.log('\n=== sample view=quiz h5p-quiz slugs (first 30 alpha) ===');
    for (const r of await db`SELECT slug FROM pages WHERE view='quiz' AND type='h5p-quiz' ORDER BY slug LIMIT 30`)
      console.log(`  ${r.slug}`);

    console.log('\n=== specialties ===');
    for (const r of await db`SELECT id, slug, name, group_label FROM specialties ORDER BY display_order`)
      console.log(`  ${String(r.id).padStart(3)}  ${r.slug.padEnd(22)} ${(r.group_label ?? '').padEnd(16)} ${r.name}`);

    // ---- DIFF: local topics vs existing quiz topic slugs ----
    const existing = (await db`SELECT slug, specialty_id FROM pages WHERE view='quiz' AND type='h5p-quiz'`);
    const existingNorm = new Set(existing.map((r) => norm(r.slug)));
    const local = localTopics();
    const localBySpec = {};
    for (const t of local) localBySpec[t.spec] = (localBySpec[t.spec] || 0) + 1;

    console.log('\n=== LOCAL docx topics per specialty (non-NAO) ===');
    for (const s of Object.keys(localBySpec).sort()) console.log(`  ${String(localBySpec[s]).padStart(3)}  ${s}`);
    console.log(`  TOTAL local topics: ${local.length}`);

    const localNorm = new Set(local.map((t) => norm(t.topic)));
    const overlap = [...localNorm].filter((t) => existingNorm.has(t));
    const addedOnly = [...localNorm].filter((t) => !existingNorm.has(t));
    const droppedOnly = [...existingNorm].filter((t) => !localNorm.has(t));

    console.log(`\n=== DIFF (normalized topic-slug match) ===`);
    console.log(`  existing quiz topic pages: ${existing.length} (normalized unique: ${existingNorm.size})`);
    console.log(`  local topics: ${local.length} (normalized unique: ${localNorm.size})`);
    console.log(`  OVERLAP (in both): ${overlap.length}`);
    console.log(`  NEW only (local, not live): ${addedOnly.length}`);
    console.log(`  LIVE only (would be dropped by full replace): ${droppedOnly.length}`);
    console.log(`\n  --- ALL NEW-only (local topics not live) ---`);
    addedOnly.sort().forEach((t) => console.log(`    + ${t}`));
    console.log(`\n  --- ALL LIVE-only (would be DROPPED by a full replace) ---`);
    droppedOnly.sort().forEach((t) => console.log(`    - ${t}`));
  } finally {
    await db.end();
  }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
