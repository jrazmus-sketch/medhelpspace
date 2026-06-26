'use strict';
/* READ-ONLY post-apply sanity checks. node scripts/verify-questoes.js */
const fs = require('fs'), path = require('path');
(function () { const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8'); for (const l of raw.split('\n')) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const e = t.indexOf('='); if (e < 0) continue; const k = t.slice(0, e).trim(), v = t.slice(e + 1).trim().replace(/^["']|["']$/g, ''); if (!(k in process.env)) process.env[k] = v; } })();
function connUrl() { if (process.env.DATABASE_URL) return process.env.DATABASE_URL; const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1]; return `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`; }
(async () => {
  const db = require('postgres')(connUrl(), { max: 1 });
  try {
    const untouched = await db`
      SELECT 'flashcards (track_id=3)' AS what, count(DISTINCT p.id)::int pages, count(q.id)::int qs
        FROM pages p LEFT JOIN quiz_questions q ON q.page_id=p.id WHERE p.track_id=3
      UNION ALL SELECT 'memorecards (module=1, h5p)', count(DISTINCT p.id)::int, count(q.id)::int
        FROM pages p LEFT JOIN quiz_questions q ON q.page_id=p.id WHERE p.content_module_id=1 AND p.type='h5p-quiz'
      UNION ALL SELECT 'simulados (view=simulados)', count(DISTINCT p.id)::int, count(q.id)::int
        FROM pages p LEFT JOIN quiz_questions q ON q.page_id=p.id WHERE p.view='simulados'`;
    console.log('UNTOUCHED sections (should be non-zero, unchanged):');
    for (const r of untouched) console.log(`  ${r.what.padEnd(28)} pages=${r.pages}  questions=${r.qs}`);

    const spot = await db`
      SELECT slug, title, status, (SELECT count(*)::int FROM quiz_questions q WHERE q.page_id=p.id) qn
      FROM pages p WHERE slug IN ('feridas-cirurgicas','cardiopatia-congenita','valvulopatias','melanoma','patologias-da-coluna-vertebral','demencias') ORDER BY slug`;
    console.log('\nSPOT CHECKS:');
    for (const r of spot) console.log(`  ${r.slug.padEnd(34)} status=${r.status.padEnd(7)} q=${String(r.qn).padStart(3)}  "${r.title}"`);

    const navOrphan = await db`SELECT count(*)::int n FROM nav_items n JOIN pages p ON p.id=n.target_page_id WHERE p.status='draft' AND p.view='quiz'`;
    console.log(`\nnav_items still pointing at retired(draft) quiz pages (should be 0): ${navOrphan[0].n}`);
    const newNav = await db`SELECT count(*)::int n FROM nav_items n JOIN pages p ON p.id=n.target_page_id WHERE p.slug='melanoma'`;
    console.log(`nav card for a NEW topic 'melanoma' (should be 1): ${newNav[0].n}`);
  } finally { await db.end(); }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
