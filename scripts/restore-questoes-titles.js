'use strict';
/* Restore the original (accented, human-curated) page titles + nav labels that
 * apply-questoes.js overwrote with slug-humanized text. Pulls from the backups.
 *   node scripts/restore-questoes-titles.js            # dry run
 *   node scripts/restore-questoes-titles.js --apply
 */
const fs = require('fs'), path = require('path');
(function () { const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8'); for (const l of raw.split('\n')) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const e = t.indexOf('='); if (e < 0) continue; const k = t.slice(0, e).trim(), v = t.slice(e + 1).trim().replace(/^["']|["']$/g, ''); if (!(k in process.env)) process.env[k] = v; } })();
function connUrl() { if (process.env.DATABASE_URL) return process.env.DATABASE_URL; const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1]; return `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`; }
(async () => {
  const apply = process.argv.includes('--apply');
  const db = require('postgres')(connUrl(), { max: 1 });
  try {
    const pageDiffs = await db`SELECT p.id, p.title AS now, b.title AS orig FROM pages p JOIN pages_bk_questoes b ON b.id=p.id WHERE p.title <> b.title`;
    const navDiffs = await db`SELECT n.id, n.label AS now, b.label AS orig FROM nav_items n JOIN nav_items_bk_questoes b ON b.id=n.id WHERE n.label <> b.label`;
    console.log(`titles to restore: ${pageDiffs.length}   nav labels to restore: ${navDiffs.length}`);
    pageDiffs.slice(0, 8).forEach((d) => console.log(`  "${d.now}" -> "${d.orig}"`));
    if (!apply) { console.log('\n(dry run — pass --apply)'); await db.end(); return; }
    await db.begin(async (sql) => {
      await sql`UPDATE pages p SET title=b.title, updated_at=now() FROM pages_bk_questoes b WHERE b.id=p.id AND p.title<>b.title`;
      await sql`UPDATE nav_items n SET label=b.label FROM nav_items_bk_questoes b WHERE b.id=n.id AND n.label<>b.label`;
    });
    console.log('✓ restored.');
  } finally { await db.end(); }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
