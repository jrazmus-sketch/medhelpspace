'use strict';
/**
 * apply-mini-simulados.js — replaces the mini simulados with Karina's rewritten bank
 * (e-mail "Atualizações dos mini simulados", 2026-09-21, + her answers 2026-09-22).
 *
 *   node scripts/apply-mini-simulados.js                   # DRY RUN — plan + checks, no writes (PROD via app/.env.local)
 *   node scripts/apply-mini-simulados.js --upload-images   # PUT the figures to Bunny (idempotent), then exit
 *   node scripts/apply-mini-simulados.js --apply           # execute in ONE transaction
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/apply-mini-simulados.js --apply   # local
 *
 * Input: parsed/mini-simulados-parsed.json (scripts/parse-mini-simulados.py) and the
 * figures in parsed/mini-simulados-media/<slug>-q<n>.png.
 *
 * Identity = (simulado slug, question position). Her delivery is a COMPLETE rewrite — no
 * stem matches the question in the same slot — so there is nothing to merge by content:
 *   matched slot → UPDATE in place: stem, answers, explanation AND media_url (a figure
 *                  belongs to the old question, so it is replaced or cleared). The row id
 *                  survives, so a simulado's attempt history keeps counting towards it.
 *   new slot     → INSERT (cirurgia-geral-simulado-9 goes 24 → 25).
 *   live slot beyond the delivery → validation problem; never deleted silently.
 * review_schedule rows on a rewritten question are DELETED: that SM-2 state was earned
 * on a different question, and item_id has no FK, so nothing else would clean it.
 *
 * Emergência (Karina 2026-09-22): she made no mini simulados for it — its themes are in
 * the Geral ones — and the 5 live ones are to be DELETED, "não é para deixar arquivados".
 * Their hub is UNPUBLISHED (draft), or Simulados → Por área would list an empty Emergência
 * tile (getViewHubGroups lists every published hub). It is not deleted: it is the WP
 * parent (pages.parent_id, no ON DELETE) of 4 legacy draft pages she never mentioned.
 * Deleting cascades quiz_questions, quiz_attempts and simulado_review_flags; the hub's
 * cards to them are removed first and review rows are cleaned here.
 *
 * NEVER touches the 60D Simulado 100Q (simulado-100q-N, content_module_id = 1) — every
 * page this script writes is asserted to have content_module_id IS NULL.
 * A delivered simulado with no page (local drift) is created, with a card on its hub.
 *
 * Backups <table>_bk_minisim_20260922 are created ONCE (first apply), RLS on, revoked from
 * anon/authenticated. scripts/rollback-mini-simulados.sql restores from them.
 */
const fs = require('fs');
const path = require('path');

const BK = '20260922';
const PARSED = path.join(__dirname, '..', 'parsed', 'mini-simulados-parsed.json');
const MEDIA_DIR = path.join(__dirname, '..', 'parsed', 'mini-simulados-media');
const CDN_BASE = 'https://medhelpspace.b-cdn.net';
// Versioned so a later delivery can never overwrite a figure a live question still shows.
const REMOTE_DIR = 'images/mini-simulados/2026-09';
const DELETE_SLUGS = ['emergencia-simulado-1', 'emergencia-simulado-2', 'emergencia-simulado-3', 'emergencia-simulado-4', 'emergencia-simulado-5'];
const DELETE_HUB = 'emergencia-simulados';

function loadEnvLocal() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

const cdnUrl = (file) => `${CDN_BASE}/${REMOTE_DIR}/${file}`;

async function uploadImages(files) {
  const endpoint = `https://${process.env.BUNNY_STORAGE_HOSTNAME}`.replace(/\/$/, '');
  const zone = process.env.BUNNY_STORAGE_ZONE; const key = process.env.BUNNY_API_KEY;
  if (!process.env.BUNNY_STORAGE_HOSTNAME || !zone || !key) { console.error('✗ Missing BUNNY_STORAGE_HOSTNAME / BUNNY_STORAGE_ZONE / BUNNY_API_KEY'); process.exit(1); }
  for (const f of files) {
    const res = await fetch(`${endpoint}/${zone}/${REMOTE_DIR}/${f}`, {
      method: 'PUT', headers: { AccessKey: key, 'Content-Type': 'image/png' }, body: fs.readFileSync(path.join(MEDIA_DIR, f)),
    });
    if (!res.ok) { console.error(`✗ ${f}: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
    console.log(`  ↑ ${REMOTE_DIR}/${f}`);
  }
  console.log(`✓ ${files.length} figure(s) uploaded.`);
}

(async () => {
  loadEnvLocal();
  const apply = process.argv.includes('--apply');
  const allowMissingImages = process.argv.includes('--allow-missing-images');
  const parsed = JSON.parse(fs.readFileSync(PARSED, 'utf8'));

  // ── figures ──
  const figs = []; // {slug, pos, file}
  for (const s of parsed) for (const q of s.questions) {
    const imgs = q.images || [];
    if (imgs.length > 1) { console.error(`✗ ${s.slug} Q${q.number}: ${imgs.length} figures, media_url holds one`); process.exit(1); }
    if (imgs.length) {
      if (!fs.existsSync(path.join(MEDIA_DIR, imgs[0]))) { console.error(`✗ missing local figure ${imgs[0]}`); process.exit(1); }
      figs.push({ slug: s.slug, pos: +q.position, file: imgs[0] });
    }
  }
  if (process.argv.includes('--upload-images')) { await uploadImages(figs.map((f) => f.file)); return; }
  const figAt = new Map(figs.map((f) => [`${f.slug}#${f.pos}`, cdnUrl(f.file)]));
  // Sequential with retries: 25 parallel HEADs get the odd refusal from the CDN edge,
  // which would read as a missing figure.
  const figsMissing = [];
  for (const f of figs) {
    let status = 'error';
    for (let attempt = 0; attempt < 3; attempt++) {
      try { const r = await fetch(cdnUrl(f.file), { method: 'HEAD' }); status = r.status; if (r.ok) break; } catch (e) { status = e.message; }
      await new Promise((res) => setTimeout(res, 800));
    }
    if (status !== 200) figsMissing.push(`${f.file} (${status})`);
  }

  const postgres = require('postgres');
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL missing (app/.env.local or environment).'); process.exit(1); }
  const target = url.includes('127.0.0.1') ? 'LOCAL' : 'PROD';
  const db = postgres(url, { max: 1, prepare: false, ssl: target === 'LOCAL' ? false : 'require', onnotice: () => {} });

  try {
    // ── lookups (read-only) ──
    const pages = await db`SELECT id, slug, title, status, type, specialty_id, content_module_id FROM pages WHERE view = 'simulados'`;
    const bySlug = new Map(pages.map((p) => [p.slug, p]));
    const specId = Object.fromEntries((await db`SELECT id, slug FROM specialties`).map((s) => [s.slug, s.id]));
    const hubBySpec = new Map(pages.filter((p) => p.type === 'blurb-nav-hub' && p.status === 'publish' && p.specialty_id != null).map((p) => [p.specialty_id, p]));
    const [{ max: maxPageId }] = await db`SELECT COALESCE(MAX(id), 0)::int AS max FROM pages`;

    const problems = [];
    const plan = []; // {s, page|null, ops:[{kind, liveId?, pos, q}]}
    const tot = { update: 0, unchanged: 0, insert: 0, create: 0, reviewRows: 0, titles: 0 };
    const titleDiffs = [];

    const touchedPageIds = [];
    for (const s of parsed) {
      if (/^simulado-100q-/.test(s.slug)) { problems.push(`${s.slug}: a 60D Simulado 100Q slug in the delivery`); continue; }
      if (s.questions.length !== 25) problems.push(`${s.slug}: ${s.questions.length} questions (expected 25)`);
      const page = bySlug.get(s.slug);
      if (page) {
        if (page.content_module_id != null) { problems.push(`${s.slug}: page ${page.id} has content_module_id=${page.content_module_id} — refusing`); continue; }
        if (page.type !== 'h5p-quiz') { problems.push(`${s.slug}: page ${page.id} is type '${page.type}'`); continue; }
        if (page.status !== 'publish') problems.push(`${s.slug}: page ${page.id} is '${page.status}' (expected publish)`);
        if (page.title !== s.title) { tot.titles++; titleDiffs.push(`${s.slug}: live "${page.title}" vs file "${s.title}" (live kept)`); }
        touchedPageIds.push(page.id);
      } else {
        if (s.group !== 'por-area' || !specId[s.specSlug]) { problems.push(`${s.slug}: no live page, and only por-área simulados can be created`); continue; }
        if (!hubBySpec.get(specId[s.specSlug])) { problems.push(`${s.slug}: no live page and no published simulados hub for '${s.specSlug}'`); continue; }
        tot.create++;
      }
      plan.push({ s, page, ops: [] });
    }

    const liveRows = touchedPageIds.length
      ? await db`SELECT id, page_id, position, question, answers, explanation_html, media_url FROM quiz_questions WHERE page_id IN ${db(touchedPageIds)} ORDER BY page_id, position`
      : [];
    const liveByPage = new Map();
    for (const q of liveRows) { const k = String(q.page_id); if (!liveByPage.has(k)) liveByPage.set(k, []); liveByPage.get(k).push(q); }

    const rewrittenIds = [];
    for (const p of plan) {
      const live = p.page ? (liveByPage.get(String(p.page.id)) || []) : [];
      const livePos = new Map(live.map((q) => [q.position, q]));
      const delivered = new Set(p.s.questions.map((q) => +q.position));
      for (const lq of live) if (!delivered.has(lq.position)) problems.push(`${p.s.slug}: live Q at position ${lq.position} (row ${lq.id}) has no delivered replacement`);
      for (const q of p.s.questions) {
        const pos = +q.position;
        const media = figAt.get(`${p.s.slug}#${pos}`) || null;
        const lq = livePos.get(pos);
        if (lq) {
          const same = lq.question === q.question && JSON.stringify(lq.answers) === JSON.stringify(q.answers)
            && (lq.explanation_html || null) === (q.explanation_html || null) && (lq.media_url || null) === media;
          p.ops.push({ kind: same ? 'unchanged' : 'update', liveId: lq.id, pos, q, media });
          tot[same ? 'unchanged' : 'update']++;
          if (!same && lq.question !== q.question) rewrittenIds.push(lq.id);
        } else {
          p.ops.push({ kind: 'insert', pos, q, media });
          tot.insert++;
        }
      }
    }

    // Emergência
    const delPages = DELETE_SLUGS.map((s) => bySlug.get(s)).filter(Boolean);
    const hub = bySlug.get(DELETE_HUB) || null;
    for (const d of delPages) if (d.content_module_id != null || d.type !== 'h5p-quiz') problems.push(`${d.slug}: unexpected page shape — refusing to delete`);
    if (hub && hub.type !== 'blurb-nav-hub') problems.push(`${DELETE_HUB}: not a hub — refusing to unpublish`);
    if (parsed.some((s) => DELETE_SLUGS.includes(s.slug))) problems.push('an Emergência simulado is in the delivery — the delete list is stale');
    const delIds = delPages.map((d) => d.id);
    const delQids = delIds.length ? (await db`SELECT id FROM quiz_questions WHERE page_id IN ${db(delIds)}`).map((r) => r.id) : [];
    const delAttempts = delIds.length ? (await db`SELECT count(*)::int n FROM quiz_attempts WHERE page_id IN ${db(delIds)}`)[0].n : 0;
    if (hub) {
      const [{ m }] = await db`SELECT count(*)::int m FROM nav_items WHERE source_page_id = ${hub.id} AND target_page_id IS NOT NULL AND target_page_id <> ALL(${delIds.length ? delIds : [0]})`;
      if (m) problems.push(`${DELETE_HUB}: hub holds ${m} card(s) to pages outside the delete list — unpublishing it would hide them`);
    }
    // Cards on OTHER pages that link to an Emergência simulado would be removed with it.
    const foreignCards = delIds.length
      ? await db`SELECT n.id, s.slug FROM nav_items n JOIN pages s ON s.id = n.source_page_id
                 WHERE n.target_page_id IN ${db(delIds)} AND s.slug <> ${DELETE_HUB}`
      : [];
    const reviewIds = [...rewrittenIds, ...delQids];
    tot.reviewRows = reviewIds.length ? (await db`SELECT count(*)::int n FROM review_schedule WHERE item_type = 'quiz_question' AND item_id IN ${db(reviewIds)}`)[0].n : 0;
    const [{ n: attemptsOnRewritten }] = rewrittenIds.length ? await db`SELECT count(*)::int n FROM quiz_attempts WHERE question_id IN ${db(rewrittenIds)}` : [{ n: 0 }];

    // ── report ──
    const qAfter = plan.reduce((n, p) => n + p.s.questions.length, 0);
    console.log(`\n=== apply-mini-simulados  [target: ${target}]  ${apply ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`  delivery: ${parsed.length} simulados / ${parsed.reduce((n, s) => n + s.questions.length, 0)} questions / ${figs.length} figures`);
    console.log(`  existing simulados: ${plan.length - tot.create}   live questions on them: ${liveRows.length}`);
    console.log(`    UPDATE in place : ${tot.update}   (already identical: ${tot.unchanged})`);
    console.log(`    INSERT new slot : ${tot.insert}`);
    console.log(`  CREATE simulado pages (no live page): ${tot.create}${tot.create ? ' — ' + plan.filter((p) => !p.page).map((p) => p.s.slug).join(', ') : ''}`);
    console.log(`  DELETE Emergência: ${delPages.length} simulados (${delQids.length} questions, ${delAttempts} attempts cascade)${hub ? `; hub '${DELETE_HUB}' (page ${hub.id}) → draft` : ''}`);
    if (foreignCards.length) console.log(`  ! ${foreignCards.length} card(s) outside the hub link to an Emergência simulado and go with it: ${foreignCards.map((c) => `${c.slug}#${c.id}`).join(', ')}`);
    console.log(`  review_schedule rows removed (rewritten + deleted questions): ${tot.reviewRows}`);
    console.log(`  attempts kept on rewritten questions (row ids survive): ${attemptsOnRewritten}`);
    console.log(`  figures on the CDN: ${figs.length - figsMissing.length}/${figs.length}${figsMissing.length ? `  (missing: ${figsMissing.join(', ')} — run --upload-images first)` : ''}`);
    console.log(`  → after apply: ${qAfter} questions on ${plan.length} mini simulados`);
    if (titleDiffs.length) console.log(`  titles that differ (live kept):\n    ${titleDiffs.join('\n    ')}`);
    if (figsMissing.length && !allowMissingImages) problems.push(`${figsMissing.length} figure(s) not on the CDN — run --upload-images (or --allow-missing-images for a local test)`);
    if (problems.length) { console.log(`\n  ✗ ${problems.length} VALIDATION PROBLEM(S):`); problems.forEach((p) => console.log(`    - ${p}`)); process.exit(1); }
    console.log('  ✓ validation clean');
    if (!apply) { console.log('\n  DRY RUN — re-run with --apply to execute.'); return; }

    // ── apply (one transaction) ──
    let pid = maxPageId;
    await db.begin(async (sql) => {
      // 0. backups — created once; a later re-apply keeps the true "before" state
      const scope = `SELECT id FROM pages WHERE view = 'simulados' AND content_module_id IS NULL`;
      const qscope = `SELECT id FROM quiz_questions WHERE page_id IN (${scope})`;
      for (const [t, q] of [
        ['pages', `SELECT * FROM pages WHERE id IN (${scope})`],
        ['quiz_questions', `SELECT * FROM quiz_questions WHERE page_id IN (${scope})`],
        ['nav_items', `SELECT * FROM nav_items WHERE source_page_id IN (${scope}) OR target_page_id IN (${scope})`],
        ['quiz_attempts', `SELECT * FROM quiz_attempts WHERE page_id IN (${scope})`],
        ['review_schedule', `SELECT * FROM review_schedule WHERE item_type = 'quiz_question' AND item_id IN (${qscope})`],
        ['simulado_review_flags', `SELECT * FROM simulado_review_flags WHERE question_id IN (${qscope})`],
      ]) {
        const name = `${t}_bk_minisim_${BK}`;
        const [{ exists }] = await sql`SELECT to_regclass(${'public.' + name}) IS NOT NULL AS exists`;
        if (exists) continue;
        await sql.unsafe(`CREATE TABLE ${name} AS ${q}`);
        await sql.unsafe(`ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY`);
        await sql.unsafe(`REVOKE ALL ON ${name} FROM anon, authenticated`);
      }

      // 1. review state earned on questions that no longer exist in that form
      if (reviewIds.length) await sql`DELETE FROM review_schedule WHERE item_type = 'quiz_question' AND item_id IN ${sql(reviewIds)}`;

      // 2. existing simulados — slots are 1..25 on both sides, so no position shuffle
      for (const p of plan.filter((x) => x.page)) {
        for (const o of p.ops) {
          if (o.kind === 'update') {
            await sql`UPDATE quiz_questions SET question = ${o.q.question}, answers = ${sql.json(o.q.answers)},
                        explanation_html = ${o.q.explanation_html}, media_url = ${o.media}, h5p_sub_id = NULL
                      WHERE id = ${o.liveId}`;
          } else if (o.kind === 'insert') {
            await sql`INSERT INTO quiz_questions (page_id, position, question, answers, media_url, explanation_html)
                      VALUES (${p.page.id}, ${o.pos}, ${o.q.question}, ${sql.json(o.q.answers)}, ${o.media}, ${o.q.explanation_html})`;
          }
        }
        await sql`UPDATE pages SET updated_at = now() WHERE id = ${p.page.id}`;
      }

      // 3. simulados with no page (local drift) → page + card on the specialty hub
      for (const p of plan.filter((x) => !x.page)) {
        const id = ++pid;
        const sid = specId[p.s.specSlug];
        await sql`INSERT INTO pages (id, slug, title, type, status, view, content_module_id, specialty_id, wp_created_at, wp_modified_at)
                  VALUES (${id}, ${p.s.slug}, ${p.s.title}, ${'h5p-quiz'}::page_type, 'publish', ${'simulados'}::page_view, ${null}, ${sid}, now(), now())`;
        for (const o of p.ops) {
          await sql`INSERT INTO quiz_questions (page_id, position, question, answers, media_url, explanation_html)
                    VALUES (${id}, ${o.pos}, ${o.q.question}, ${sql.json(o.q.answers)}, ${o.media}, ${o.q.explanation_html})`;
        }
        const h = hubBySpec.get(sid);
        const [{ m }] = await sql`SELECT COALESCE(MAX(position), 0)::int m FROM nav_items WHERE source_page_id = ${h.id}`;
        await sql`INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout) VALUES (${h.id}, ${id}, ${m + 1}, ${p.s.title}, 'cards')`;
      }

      // 4. Emergência — the cards pointing at the simulados first (nav_items.target_page_id
      //    has no ON DELETE), then the simulados, then the hub
      if (delIds.length) {
        await sql`DELETE FROM nav_items WHERE target_page_id IN ${sql(delIds)}`;
        await sql`DELETE FROM pages WHERE id IN ${sql(delIds)} AND view = 'simulados' AND content_module_id IS NULL`;
      }
      if (hub) {
        await sql`UPDATE pages SET status = 'draft', updated_at = now(),
                    notes = concat_ws(' | ', notes, ${`despublicado ${BK}: sem mini simulados de Emergência (Karina)`}::text)
                  WHERE id = ${hub.id} AND type = 'blurb-nav-hub'`;
      }

      // 5. invariants — fail the whole transaction rather than commit something odd
      // now() is the transaction's start time, so this matches only rows written above.
      const [{ n: touched100q }] = await sql`SELECT count(*)::int n FROM pages WHERE slug LIKE 'simulado-100q-%' AND updated_at = now()`;
      if (touched100q) throw new Error('a Simulado 100Q page was touched');
      const bad = await sql`SELECT p.slug, count(q.id)::int n, max(q.position)::int mx FROM pages p LEFT JOIN quiz_questions q ON q.page_id = p.id
                            WHERE p.slug IN ${sql(parsed.map((s) => s.slug))} GROUP BY p.slug HAVING count(q.id) <> 25 OR max(q.position) <> 25`;
      if (bad.length) throw new Error(`not 25 contiguous questions: ${bad.map((b) => `${b.slug}(${b.n})`).join(', ')}`);
      const [{ n: left }] = await sql`SELECT count(*)::int n FROM pages WHERE slug IN ${sql(DELETE_SLUGS)}`;
      if (left) throw new Error(`${left} Emergência simulado(s) still present`);
      const [{ n: hubLive }] = await sql`SELECT count(*)::int n FROM pages WHERE slug = ${DELETE_HUB} AND status = 'publish'`;
      if (hubLive) throw new Error(`${DELETE_HUB} is still published`);
    });

    // ── verify ──
    const [{ tp, qn, med }] = await db`
      SELECT count(DISTINCT p.id)::int tp, count(q.id)::int qn, count(q.media_url)::int med
      FROM pages p JOIN quiz_questions q ON q.page_id = p.id
      WHERE p.view = 'simulados' AND p.type = 'h5p-quiz' AND p.status = 'publish' AND p.content_module_id IS NULL`;
    console.log(`\n  ✓ APPLIED to ${target}: ${tp} mini simulados, ${qn} questions, ${med} with a figure.`);
    console.log(`    backups: *_bk_minisim_${BK} (RLS on, anon/authenticated revoked) — rollback: scripts/rollback-mini-simulados.sql`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
