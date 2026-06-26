'use strict';
/**
 * apply-questoes.js — applies the Questões refresh from the reconciliation plan.
 *
 *   node scripts/apply-questoes.js            # DRY RUN (default) — validates, no writes
 *   node scripts/apply-questoes.js --apply    # execute in ONE transaction
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/apply-questoes.js --apply   # local test DB
 *
 * Inputs: parsed/questoes-reconciliation.json + parsed/questoes-parsed.json.
 *
 * Does, in a single transaction (atomic):
 *   0. Backup every view='quiz' page + its quiz_questions/nav_items/quiz_attempts
 *      into *_bk_questoes tables (created+filled ONCE — guards re-apply).
 *   1. REFRESH/RENAME/MOVED (174): delete old quiz_questions, insert new, update
 *      title (+ specialty_id & nav move for MOVED), update nav label. Keeps slug,
 *      page id, and existing nav links → URLs + (negligible) progress preserved.
 *   2. NEW (non-outros): create page + quiz_questions + a nav card on the
 *      specialty's quiz hub.
 *   3. RETIRE (8): status -> 'draft' + drop the nav card (rows backed up).
 *
 * NEVER touches flashcards (track_id), memorecards (content_module_id), or
 * simulados (view='simulados'). 'outros' topics are deferred to a follow-up.
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
  const recon = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parsed', 'questoes-reconciliation.json'), 'utf8'));
  const parsed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parsed', 'questoes-parsed.json'), 'utf8'));
  const qMap = new Map(parsed.map((p) => [`${p.spec}::${p.topicSlug}`, p.questions]));
  const Q = (spec, slug) => qMap.get(`${spec}::${slug}`) || [];

  const inPlace = [...recon.refresh, ...recon.rename, ...recon.moved]; // 174, all carry liveId
  const creates = recon.create.filter((c) => c.spec !== 'outros');
  const outrosDeferred = recon.create.filter((c) => c.spec === 'outros');
  const retire = recon.retire;

  const postgres = require('postgres');
  const db = postgres(connUrl(), { max: 1 });
  const target = (process.env.DATABASE_URL || connUrl()).includes('127.0.0.1') ? 'LOCAL' : 'PROD';

  try {
    // ── lookups (read-only) ──
    const specs = await db`SELECT id, slug FROM specialties`;
    const specId = Object.fromEntries(specs.map((s) => [s.slug, s.id]));
    const hubs = await db`SELECT id, specialty_id FROM pages WHERE view='quiz' AND type='blurb-nav-hub' AND status='publish' AND specialty_id IS NOT NULL`;
    const hubBySpecId = Object.fromEntries(hubs.map((h) => [h.specialty_id, h.id]));
    const [{ max: maxPageId }] = await db`SELECT COALESCE(MAX(id),0)::int AS max FROM pages`;
    const navMax = await db`SELECT source_page_id, MAX(position)::int AS m FROM nav_items GROUP BY source_page_id`;
    const navPos = Object.fromEntries(navMax.map((r) => [r.source_page_id, r.m]));
    const existingSlugs = new Set((await db`SELECT slug FROM pages`).map((r) => r.slug));

    // ── validations ──
    const problems = [];
    for (const r of inPlace) if (Q(r.spec, r.localSlug).length === 0) problems.push(`no parsed questions for ${r.spec}/${r.localSlug} (liveId ${r.liveId})`);
    for (const c of creates) {
      if (Q(c.spec, c.localSlug).length === 0) problems.push(`no parsed questions for NEW ${c.spec}/${c.localSlug}`);
      if (!specId[c.spec]) problems.push(`NEW ${c.spec}/${c.localSlug}: unknown specialty`);
      if (!hubBySpecId[specId[c.spec]]) problems.push(`NEW ${c.spec}/${c.localSlug}: no quiz hub for specialty`);
    }
    for (const r of recon.moved) if (!hubBySpecId[specId[r.spec]]) problems.push(`MOVED ${r.localSlug}: no quiz hub for target specialty ${r.spec}`);

    const qTotalInPlace = inPlace.reduce((n, r) => n + Q(r.spec, r.localSlug).length, 0);
    const qTotalNew = creates.reduce((n, c) => n + Q(c.spec, c.localSlug).length, 0);

    console.log(`\n=== apply-questoes  [target: ${target}]  ${apply ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`  in-place refresh/rename/moved: ${inPlace.length} topics (${qTotalInPlace} questions)`);
    console.log(`  NEW pages (non-outros):        ${creates.length} topics (${qTotalNew} questions)`);
    console.log(`  RETIRE:                        ${retire.length} topics`);
    console.log(`  outros DEFERRED:               ${outrosDeferred.length} topics (${outrosDeferred.map((o) => o.localSlug).join(', ')})`);
    if (problems.length) { console.log(`\n  ✗ ${problems.length} VALIDATION PROBLEM(S):`); problems.forEach((p) => console.log(`    - ${p}`)); process.exit(1); }
    console.log(`  ✓ validation clean`);

    if (!apply) {
      console.log(`\n  DRY RUN — re-run with --apply to execute. Sample NEW slugs:`);
      creates.slice(0, 8).forEach((c) => console.log(`    + ${c.spec}/${c.localSlug} (${Q(c.spec, c.localSlug).length}q)`));
      await db.end();
      return;
    }

    // ── guard against double-apply ──
    const [{ exists }] = await db`SELECT to_regclass('public.pages_bk_questoes') IS NOT NULL AS exists`;
    if (exists) { console.error('\n  ✗ pages_bk_questoes already exists on this DB → already applied. Aborting (drop *_bk_questoes to re-run).'); process.exit(1); }

    let pid = maxPageId;
    const nextNav = (hubId) => (navPos[hubId] = (navPos[hubId] ?? 0) + 1);
    const pickSlug = (slug) => { let s = slug; if (existingSlugs.has(s)) s = `${slug}-quiz`; if (existingSlugs.has(s)) s = `${slug}-questoes`; existingSlugs.add(s); return s; };

    await db.begin(async (sql) => {
      // 0. backups (created+filled once)
      await sql`CREATE TABLE pages_bk_questoes        AS SELECT * FROM pages         WHERE view='quiz'`;
      await sql`CREATE TABLE quiz_questions_bk_questoes AS SELECT q.* FROM quiz_questions q JOIN pages p ON p.id=q.page_id WHERE p.view='quiz'`;
      await sql`CREATE TABLE nav_items_bk_questoes    AS SELECT n.* FROM nav_items n WHERE n.source_page_id IN (SELECT id FROM pages WHERE view='quiz') OR n.target_page_id IN (SELECT id FROM pages WHERE view='quiz')`;
      await sql`CREATE TABLE quiz_attempts_bk_questoes AS SELECT a.* FROM quiz_attempts a WHERE a.page_id IN (SELECT id FROM pages WHERE view='quiz')`;

      // 1. in-place refresh/rename/moved
      for (const r of inPlace) {
        const qs = Q(r.spec, r.localSlug);
        await sql`DELETE FROM quiz_questions WHERE page_id = ${r.liveId}`;
        for (const q of qs) {
          await sql`INSERT INTO quiz_questions (page_id, position, question, answers, media_url, explanation_html)
                    VALUES (${r.liveId}, ${q.position}, ${q.question}, ${sql.json(q.answers)}, ${null}, ${q.explanation_html})`;
        }
        const movedSpec = r.liveSpec && r.liveSpec !== r.spec;
        if (movedSpec) await sql`UPDATE pages SET title=${r.localTitle}, specialty_id=${specId[r.spec]}, updated_at=now() WHERE id=${r.liveId}`;
        else await sql`UPDATE pages SET title=${r.localTitle}, updated_at=now() WHERE id=${r.liveId}`;
        // nav label refresh; for MOVED, relocate the card to the new specialty's hub
        if (movedSpec) {
          const hub = hubBySpecId[specId[r.spec]];
          await sql`DELETE FROM nav_items WHERE target_page_id=${r.liveId}`;
          await sql`INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
                    VALUES (${hub}, ${r.liveId}, ${nextNav(hub)}, ${r.localTitle}, 'cards')`;
        } else {
          await sql`UPDATE nav_items SET label=${r.localTitle} WHERE target_page_id=${r.liveId}`;
        }
      }

      // 2. NEW pages (+nav card)
      for (const c of creates) {
        const slug = pickSlug(c.localSlug);
        const id = ++pid;
        await sql`INSERT INTO pages (id, slug, title, type, status, view, content_module_id, specialty_id, wp_created_at, wp_modified_at)
                  VALUES (${id}, ${slug}, ${c.localTitle}, ${'h5p-quiz'}::page_type, 'publish', ${'quiz'}::page_view, ${null}, ${specId[c.spec]}, now(), now())`;
        for (const q of Q(c.spec, c.localSlug)) {
          await sql`INSERT INTO quiz_questions (page_id, position, question, answers, media_url, explanation_html)
                    VALUES (${id}, ${q.position}, ${q.question}, ${sql.json(q.answers)}, ${null}, ${q.explanation_html})`;
        }
        const hub = hubBySpecId[specId[c.spec]];
        await sql`INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
                  VALUES (${hub}, ${id}, ${nextNav(hub)}, ${c.localTitle}, 'cards')`;
      }

      // 3. RETIRE
      for (const r of retire) {
        await sql`UPDATE pages SET status='draft', updated_at=now() WHERE id=${r.liveId}`;
        await sql`DELETE FROM nav_items WHERE target_page_id=${r.liveId}`;
      }
    });

    // ── verify ──
    const [{ qn }] = await db`SELECT count(*)::int qn FROM quiz_questions q JOIN pages p ON p.id=q.page_id WHERE p.view='quiz' AND p.status='publish' AND p.track_id IS NULL AND p.content_module_id IS NULL`;
    const [{ tp }] = await db`SELECT count(*)::int tp FROM pages WHERE view='quiz' AND type='h5p-quiz' AND status='publish' AND track_id IS NULL AND content_module_id IS NULL`;
    const [{ dr }] = await db`SELECT count(*)::int dr FROM pages WHERE view='quiz' AND status='draft'`;
    console.log(`\n  ✓ APPLIED to ${target}.`);
    console.log(`    live quiz topic pages (publish): ${tp}   their quiz_questions: ${qn}   drafts(retired): ${dr}`);
    console.log(`    backups: pages_bk_questoes, quiz_questions_bk_questoes, nav_items_bk_questoes, quiz_attempts_bk_questoes`);
    console.log(`    NEXT: outros (${outrosDeferred.length}) + images + frontend.`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    await db.end();
  }
})();
