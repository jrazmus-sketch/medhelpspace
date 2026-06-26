'use strict';
/**
 * apply-questoes-outros.js — adds the 3 "Outros" Questões topics (urologia,
 * oftalmologia, otorrinolaringologia) that aren't real specialties.
 *
 * Creates (all additive — rollback = delete the new rows):
 *   - an 'outros' specialty (group_label NULL → standalone "Outros" row in hubs)
 *   - an 'outros' quiz hub page (blurb-nav-hub, view='quiz')
 *   - the 3 topic pages + their quiz_questions
 *   - 3 nav cards on the outros quiz hub
 *
 *   node scripts/apply-questoes-outros.js            # DRY RUN
 *   node scripts/apply-questoes-outros.js --apply
 *
 * Frontend: estudo-por-questoes hard-codes an empty "Outros" group — remove that
 * push so the real one (provided here) is the only "Outros".
 */
const fs = require('fs'), path = require('path');
(function () { const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8'); for (const l of raw.split('\n')) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const e = t.indexOf('='); if (e < 0) continue; const k = t.slice(0, e).trim(), v = t.slice(e + 1).trim().replace(/^["']|["']$/g, ''); if (!(k in process.env)) process.env[k] = v; } })();
function connUrl() { if (process.env.DATABASE_URL) return process.env.DATABASE_URL; const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1]; return `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`; }

(async () => {
  const apply = process.argv.includes('--apply');
  const parsed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parsed', 'questoes-parsed.json'), 'utf8'));
  const topics = parsed.filter((t) => t.spec === 'outros'); // urologia, oftalmologia, otorrinolaringologia
  const db = require('postgres')(connUrl(), { max: 1 });
  const target = (process.env.DATABASE_URL || connUrl()).includes('127.0.0.1') ? 'LOCAL' : 'PROD';
  try {
    const existing = new Set((await db`SELECT slug FROM pages`).map((r) => r.slug));
    const [{ max: maxPageId }] = await db`SELECT COALESCE(MAX(id),0)::int AS max FROM pages`;
    const [outrosSpec] = await db`SELECT id FROM specialties WHERE slug='outros'`;

    console.log(`\n=== apply-questoes-outros  [${target}]  ${apply ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`  outros specialty: ${outrosSpec ? `exists (id ${outrosSpec.id})` : 'will CREATE'}`);
    for (const t of topics) {
      const slug = existing.has(t.topicSlug) ? `${t.topicSlug}-quiz` : t.topicSlug;
      console.log(`  topic: ${slug.padEnd(22)} ${t.questions.length} questions${slug !== t.topicSlug ? '  (slug suffixed — collision)' : ''}`);
    }
    if (outrosSpec) {
      const [{ n }] = await db`SELECT count(*)::int n FROM pages WHERE specialty_id=${outrosSpec.id} AND view='quiz'`;
      if (n > 0) { console.log(`\n  ✗ outros already has ${n} quiz pages → already applied. Aborting.`); process.exit(1); }
    }
    if (!apply) { console.log('\n  DRY RUN — re-run with --apply.'); await db.end(); return; }

    let newSpecId = outrosSpec?.id;
    let pid = maxPageId;
    const created = [];
    await db.begin(async (sql) => {
      if (!newSpecId) {
        const [{ ord }] = await sql`SELECT COALESCE(MAX(display_order),0)+1 AS ord FROM specialties`;
        const [row] = await sql`INSERT INTO specialties (slug, name, display_order, group_label) VALUES ('outros','Outros',${ord},NULL) RETURNING id`;
        newSpecId = row.id;
        created.push(`specialty outros id=${newSpecId}`);
      }
      // quiz hub (blurb-nav-hub)
      const hubId = ++pid;
      const hubSlug = existing.has('outros-questoes') ? `outros-questoes-${hubId}` : 'outros-questoes';
      await sql`INSERT INTO pages (id, slug, title, type, status, view, content_module_id, specialty_id, wp_created_at, wp_modified_at)
                VALUES (${hubId}, ${hubSlug}, 'Outros', ${'blurb-nav-hub'}::page_type, 'publish', ${'quiz'}::page_view, NULL, ${newSpecId}, now(), now())`;
      created.push(`hub page id=${hubId} slug=${hubSlug}`);
      // topic pages + questions + nav cards
      let navPos = 0;
      for (const t of topics) {
        const id = ++pid;
        const slug = existing.has(t.topicSlug) ? `${t.topicSlug}-quiz` : t.topicSlug;
        await sql`INSERT INTO pages (id, slug, title, type, status, view, content_module_id, specialty_id, wp_created_at, wp_modified_at)
                  VALUES (${id}, ${slug}, ${t.title}, ${'h5p-quiz'}::page_type, 'publish', ${'quiz'}::page_view, NULL, ${newSpecId}, now(), now())`;
        for (const q of t.questions) {
          await sql`INSERT INTO quiz_questions (page_id, position, question, answers, media_url, explanation_html)
                    VALUES (${id}, ${q.position}, ${q.question}, ${sql.json(q.answers)}, ${null}, ${q.explanation_html})`;
        }
        await sql`INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
                  VALUES (${hubId}, ${id}, ${++navPos}, ${t.title}, 'cards')`;
        created.push(`topic page id=${id} slug=${slug} (${t.questions.length}q)`);
      }
    });

    console.log(`\n  ✓ APPLIED to ${target}. Created:`);
    created.forEach((c) => console.log(`    + ${c}`));
    console.log(`\n  Rollback: DELETE the new pages (cascades quiz_questions+nav_items) + the outros specialty.`);
    console.log(`  NEXT: remove the hard-coded empty "Outros" push in estudo-por-questoes/page.tsx + attach the oftalmo image.`);
  } finally { await db.end(); }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
