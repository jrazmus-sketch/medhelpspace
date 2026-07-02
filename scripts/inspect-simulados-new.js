'use strict';
/**
 * inspect-simulados-new.js — READ-ONLY. Maps the live simulados surface so we can
 * plan the Karina "Simulados-new" import (Geral + Por área). SELECTs only.
 *
 *   node scripts/inspect-simulados-new.js
 */
const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
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

(async () => {
  loadEnvLocal();
  const postgres = require('postgres');
  const db = postgres(connUrl(), { max: 1 });
  const target = (process.env.DATABASE_URL || connUrl()).includes('127.0.0.1') ? 'LOCAL' : 'PROD';
  try {
    console.log(`=== target: ${target} ===`);

    console.log('\n=== specialties (all) ===');
    for (const r of await db`SELECT id, slug, name, group_label, display_order FROM specialties ORDER BY display_order`)
      console.log(`  ${String(r.id).padStart(3)}  ord=${String(r.display_order).padStart(3)}  ${r.slug.padEnd(24)} grp=${(r.group_label ?? '-').padEnd(16)} ${r.name}`);

    console.log('\n=== pages: view=simulados by (type, status) ===');
    for (const r of await db`SELECT type, status, count(*)::int n FROM pages WHERE view='simulados' GROUP BY type, status ORDER BY n DESC`)
      console.log(`  ${String(r.n).padStart(4)}  type=${r.type}  status=${r.status}`);

    console.log('\n=== view=simulados pages: per specialty + type ===');
    for (const r of await db`
      SELECT COALESCE(s.slug,'(none)') spec, p.type, count(*)::int n
      FROM pages p LEFT JOIN specialties s ON s.id=p.specialty_id
      WHERE p.view='simulados' GROUP BY s.slug, p.type ORDER BY spec, p.type`)
      console.log(`  ${String(r.n).padStart(4)}  ${r.spec.padEnd(24)} ${r.type}`);

    console.log('\n=== view=simulados blurb-nav-hub pages (the per-specialty hubs) ===');
    const hubs = await db`
      SELECT p.id, p.slug, p.title, p.status, COALESCE(s.slug,'(none)') spec
      FROM pages p LEFT JOIN specialties s ON s.id=p.specialty_id
      WHERE p.view='simulados' AND p.type='blurb-nav-hub' ORDER BY spec`;
    for (const r of hubs) console.log(`  #${String(r.id).padStart(5)} [${r.status}] ${r.spec.padEnd(22)} ${r.slug}  — ${r.title}`);
    console.log(`  (${hubs.length} hub pages)`);

    console.log('\n=== ALL view=simulados h5p-quiz/text-lesson pages (legacy set) ===');
    const legacy = await db`
      SELECT p.id, p.slug, p.type, p.status, p.content_module_id, COALESCE(s.slug,'(none)') spec
      FROM pages p LEFT JOIN specialties s ON s.id=p.specialty_id
      WHERE p.view='simulados' AND p.type <> 'blurb-nav-hub' ORDER BY spec, p.slug`;
    for (const r of legacy) console.log(`  #${String(r.id).padStart(5)} [${r.status}] mod=${r.content_module_id ?? '-'} ${r.spec.padEnd(20)} ${r.type.padEnd(12)} ${r.slug}`);
    console.log(`  (${legacy.length} non-hub simulados pages)`);

    console.log('\n=== quiz_questions under view=simulados pages ===');
    const qq = await db`SELECT count(*)::int n FROM quiz_questions q JOIN pages p ON p.id=q.page_id WHERE p.view='simulados'`;
    console.log(`  ${qq[0].n} quiz_questions`);

    console.log('\n=== user data tied to simulados pages ===');
    const att = await db`SELECT count(*)::int n FROM quiz_attempts a JOIN pages p ON p.id=a.page_id WHERE p.view='simulados'`;
    console.log(`  quiz_attempts on simulados pages: ${att[0].n}`);

    console.log('\n=== simulado_sections table ===');
    try {
      for (const r of await db`SELECT id, key, label, icon_slug FROM simulado_sections ORDER BY id`)
        console.log(`  #${r.id}  key=${r.key}  label="${r.label}"  icon=${r.icon_slug ?? '-'}`);
    } catch (e) { console.log(`  (table missing or different columns: ${e.message})`); }

    console.log('\n=== study_types (quiz + simulados rows) ===');
    try {
      for (const r of await db`SELECT id, key, label, description FROM study_types WHERE key IN ('quiz','simulados') ORDER BY id`)
        console.log(`  #${r.id}  key=${r.key}  label="${r.label}"  desc="${r.description}"`);
    } catch (e) { console.log(`  (table missing or different columns: ${e.message})`); }

    console.log('\n=== nav_items count sourced from view=simulados hubs ===');
    const navc = await db`SELECT count(*)::int n FROM nav_items n WHERE n.source_page_id IN (SELECT id FROM pages WHERE view='simulados' AND type='blurb-nav-hub')`;
    console.log(`  ${navc[0].n} nav cards on simulados hubs`);
  } finally {
    await db.end();
  }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
