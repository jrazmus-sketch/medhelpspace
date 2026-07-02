'use strict';
/**
 * apply-simulados-new.js — imports Karina's new Simulados-new content, replacing
 * the legacy per-topic simulados. Reads parsed/simulados-new-parsed.json.
 *
 *   node scripts/apply-simulados-new.js            # DRY RUN (default) — validates, no writes
 *   node scripts/apply-simulados-new.js --apply    # execute in ONE transaction
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/apply-simulados-new.js --apply  # local
 *
 * In a single atomic transaction:
 *   0. Backup every view='simulados' page + its quiz_questions/nav_items/quiz_attempts
 *      into *_bk_simnew tables (created+filled ONCE — guards re-apply).
 *   1. RETIRE legacy: every publish view='simulados' NON-hub page → status='draft';
 *      wipe all nav cards on the 17 per-specialty simulados hubs.
 *   2. CREATE new h5p-quiz pages (content_module_id=NULL) + quiz_questions:
 *        - Por área: specialty_id set, slug '<spec>-simulado-<n>', + nav card on the
 *          specialty's existing simulados hub (label 'Simulado <n>', position n).
 *        - Geral: specialty_id=NULL, slug 'simulado-geral-<n>' (no hub; the Geral
 *          grid queries these pages directly).
 *   3. Verify.
 *
 * Reversible: DROP the *_bk_simnew tables + re-publish drafts to roll back.
 * NEVER sets content_module_id (would route to MemorecardsRenderer + skip review).
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
  const apply = process.argv.includes('--apply');
  const parsed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parsed', 'simulados-new-parsed.json'), 'utf8'));

  const postgres = require('postgres');
  const db = postgres(connUrl(), { max: 1 });
  const target = (process.env.DATABASE_URL || connUrl()).includes('127.0.0.1') ? 'LOCAL' : 'PROD';

  try {
    // ── lookups ──
    const specs = await db`SELECT id, slug FROM specialties`;
    const specId = Object.fromEntries(specs.map((s) => [s.slug, s.id]));
    const hubs = await db`SELECT id, specialty_id FROM pages WHERE view='simulados' AND type='blurb-nav-hub' AND status='publish' AND specialty_id IS NOT NULL`;
    const hubBySpecId = Object.fromEntries(hubs.map((h) => [h.specialty_id, h.id]));
    const [{ max: maxPageId }] = await db`SELECT COALESCE(MAX(id),0)::int AS max FROM pages`;
    const existingSlugs = new Set((await db`SELECT slug FROM pages`).map((r) => r.slug));

    // ── build the create plan ──
    const plan = parsed.map((f) => {
      const isGeral = f.group === 'geral';
      const slug = isGeral ? `simulado-geral-${f.num}` : `${f.specSlug}-simulado-${f.num}`;
      return {
        isGeral, num: f.num, specSlug: f.specSlug, slug,
        title: `Simulado ${f.num}`, specialty_id: isGeral ? null : specId[f.specSlug],
        hubId: isGeral ? null : hubBySpecId[specId[f.specSlug]],
        questions: f.questions,
      };
    });

    // ── validations ──
    const problems = [];
    for (const p of plan) {
      if (!p.isGeral && !p.specialty_id) problems.push(`${p.specSlug} Simulado ${p.num}: unknown specialty`);
      if (!p.isGeral && !p.hubId) problems.push(`${p.specSlug} Simulado ${p.num}: no simulados hub for specialty`);
      if (existingSlugs.has(p.slug)) problems.push(`slug collision: ${p.slug} already exists`);
      if (!p.questions.length) problems.push(`${p.slug}: 0 questions`);
    }
    // duplicate slug within plan
    const seen = new Set();
    for (const p of plan) { if (seen.has(p.slug)) problems.push(`duplicate slug in plan: ${p.slug}`); seen.add(p.slug); }

    const [{ n: legacyCount }] = await db`SELECT count(*)::int n FROM pages WHERE view='simulados' AND type<>'blurb-nav-hub' AND status='publish'`;
    const [{ n: hubNavCount }] = await db`SELECT count(*)::int n FROM nav_items WHERE source_page_id IN (SELECT id FROM pages WHERE view='simulados' AND type='blurb-nav-hub')`;
    const qTotal = plan.reduce((s, p) => s + p.questions.length, 0);
    const geralN = plan.filter((p) => p.isGeral).length;
    const porAreaN = plan.length - geralN;

    console.log(`\n=== apply-simulados-new  [target: ${target}]  ${apply ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`  hubs found:              ${hubs.length}`);
    console.log(`  NEW pages:               ${plan.length}  (geral ${geralN}, por-área ${porAreaN})  — ${qTotal} questions`);
    console.log(`  legacy pages to retire:  ${legacyCount}`);
    console.log(`  legacy hub nav cards to wipe: ${hubNavCount}`);
    if (problems.length) { console.log(`\n  ✗ ${problems.length} PROBLEM(S):`); problems.forEach((p) => console.log(`    - ${p}`)); process.exit(1); }
    console.log(`  ✓ validation clean`);

    if (!apply) {
      console.log(`\n  DRY RUN — re-run with --apply to execute. Sample new slugs:`);
      plan.slice(0, 6).forEach((p) => console.log(`    + ${p.slug}  "${p.title}"  spec=${p.specSlug ?? 'GERAL'}  hub=${p.hubId ?? '-'}  (${p.questions.length}q)`));
      const g = plan.find((p) => p.isGeral); if (g) console.log(`    + ${g.slug}  (geral example)`);
      await db.end();
      return;
    }

    // ── guard against double-apply ──
    const [{ exists }] = await db`SELECT to_regclass('public.pages_bk_simnew') IS NOT NULL AS exists`;
    if (exists) { console.error('\n  ✗ pages_bk_simnew already exists → already applied. Drop *_bk_simnew to re-run.'); process.exit(1); }

    let pid = maxPageId;

    await db.begin(async (sql) => {
      // 0. backups (once)
      await sql`CREATE TABLE pages_bk_simnew          AS SELECT * FROM pages         WHERE view='simulados'`;
      await sql`CREATE TABLE quiz_questions_bk_simnew AS SELECT q.* FROM quiz_questions q JOIN pages p ON p.id=q.page_id WHERE p.view='simulados'`;
      await sql`CREATE TABLE nav_items_bk_simnew      AS SELECT n.* FROM nav_items n WHERE n.source_page_id IN (SELECT id FROM pages WHERE view='simulados') OR n.target_page_id IN (SELECT id FROM pages WHERE view='simulados')`;
      await sql`CREATE TABLE quiz_attempts_bk_simnew  AS SELECT a.* FROM quiz_attempts a WHERE a.page_id IN (SELECT id FROM pages WHERE view='simulados')`;

      // 1. retire legacy: draft every non-hub publish simulados page; wipe hub nav cards
      await sql`UPDATE pages SET status='draft', updated_at=now() WHERE view='simulados' AND type<>'blurb-nav-hub' AND status='publish'`;
      await sql`DELETE FROM nav_items WHERE source_page_id IN (SELECT id FROM pages WHERE view='simulados' AND type='blurb-nav-hub')`;

      // 2. create new pages + questions (+ nav card for por-área)
      for (const p of plan) {
        const id = ++pid;
        await sql`INSERT INTO pages (id, slug, title, type, status, view, content_module_id, specialty_id, wp_created_at, wp_modified_at)
                  VALUES (${id}, ${p.slug}, ${p.title}, ${'h5p-quiz'}::page_type, 'publish', ${'simulados'}::page_view, ${null}, ${p.specialty_id}, now(), now())`;
        for (const q of p.questions) {
          await sql`INSERT INTO quiz_questions (page_id, position, question, answers, media_url, explanation_html)
                    VALUES (${id}, ${q.position}, ${q.question}, ${sql.json(q.answers)}, ${null}, ${q.explanation_html})`;
        }
        if (!p.isGeral) {
          await sql`INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
                    VALUES (${p.hubId}, ${id}, ${p.num}, ${p.title}, 'cards')`;
        }
      }
    });

    // ── verify ──
    const [{ tp }] = await db`SELECT count(*)::int tp FROM pages WHERE view='simulados' AND type='h5p-quiz' AND status='publish' AND content_module_id IS NULL`;
    const [{ qn }] = await db`SELECT count(*)::int qn FROM quiz_questions q JOIN pages p ON p.id=q.page_id WHERE p.view='simulados' AND p.status='publish'`;
    const [{ geral }] = await db`SELECT count(*)::int geral FROM pages WHERE view='simulados' AND type='h5p-quiz' AND status='publish' AND specialty_id IS NULL`;
    const [{ dr }] = await db`SELECT count(*)::int dr FROM pages WHERE view='simulados' AND status='draft'`;
    const [{ nav }] = await db`SELECT count(*)::int nav FROM nav_items WHERE source_page_id IN (SELECT id FROM pages WHERE view='simulados' AND type='blurb-nav-hub')`;
    console.log(`\n  ✓ APPLIED to ${target}.`);
    console.log(`    new publish simulados pages: ${tp}  (geral ${geral})   quiz_questions: ${qn}`);
    console.log(`    new hub nav cards: ${nav}   drafts(retired legacy): ${dr}`);
    console.log(`    backups: pages_bk_simnew, quiz_questions_bk_simnew, nav_items_bk_simnew, quiz_attempts_bk_simnew`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    await db.end();
  }
})();
