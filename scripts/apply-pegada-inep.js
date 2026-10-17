'use strict';
/**
 * apply-pegada-inep.js — adds Karina's 38 "Questões Pegada INEP" mini simulados
 * (e-mail "Atualização dos Simulados Revalida | MedHelpSpace", 2026-10-17) as the second
 * collection inside Simulados → GERAL (lib/simulado-collections.ts).
 *
 *   python -I scripts/parse-pegada-inep.py "<folder>"     # → parsed/pegada-inep-parsed.json + media
 *   node scripts/apply-pegada-inep.js                      # DRY RUN — plan + checks (PROD via app/.env.local)
 *   node scripts/apply-pegada-inep.js --upload-images      # PUT the figures to Bunny (idempotent), then exit
 *   node scripts/apply-pegada-inep.js --apply              # execute in ONE transaction
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/apply-pegada-inep.js --apply   # local
 *
 * Each simulado = one page  slug 'pegada-inep-<n>', title 'Simulado <n>', view 'simulados',
 * type 'h5p-quiz', specialty_id NULL, content_module_id NULL — the same shape as the 20
 * 'simulado-geral-<n>' (Simulados Gerais); the slug prefix is what puts it in its
 * collection. No nav_items: Geral simulados have no hub; their collection page lists them.
 *
 * Re-run safe. A page that already exists is matched by slug and its questions by
 * position: identical → untouched, different → UPDATE in place (row id survives, so
 * attempts keep counting), missing → INSERT. A live question with no delivered
 * counterpart is a validation problem — never deleted silently. review_schedule rows on a
 * question whose STEM changed are deleted (item_id has no FK; that SM-2 state was earned on
 * a different question).
 *
 * Figures are INLINE in the question HTML (parse-pegada-inep.py explains why), at
 * images/simulados/pegada-inep/2026-10/ — the dry run HEADs every one.
 *
 * Also seeds the site_content rows that make the two GERAL cards' title/description
 * inline-editable (simcol.*) — ON CONFLICT DO NOTHING, so an admin's edit is never
 * overwritten. Fallback text = lib/simulado-collections.ts.
 *
 * NEVER touches the 60D Simulado 100Q (simulado-100q-N, content_module_id = 1) or any
 * page outside 'pegada-inep-%'. Rollback: scripts/rollback-pegada-inep.sql.
 */
const fs = require('fs');
const path = require('path');

const PARSED = path.join(__dirname, '..', 'parsed', 'pegada-inep-parsed.json');
const MEDIA_DIR = path.join(__dirname, '..', 'parsed', 'pegada-inep-media');
const CDN_BASE = 'https://medhelpspace.b-cdn.net';
const REMOTE_DIR = 'images/simulados/pegada-inep/2026-10'; // == CDN_DIR in parse-pegada-inep.py
const SLUG_RE = /^pegada-inep-\d+$/;
const NOTE = 'Questões Pegada INEP (Karina 2026-10-17) — coleção GERAL';
// Fallbacks in lib/simulado-collections.ts — keep in sync.
const SITE_CONTENT = [
  ['simcol.gerais.title', 'Simulados Gerais'],
  ['simcol.gerais.desc', 'Questões elaboradas no estilo de cobrança do Revalida.'],
  ['simcol.pegada-inep.title', 'Questões Pegada INEP'],
  ['simcol.pegada-inep.desc', 'Questões selecionadas de provas de outras instituições.'],
];

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
  let n = 0;
  for (const f of files) {
    const res = await fetch(`${endpoint}/${zone}/${REMOTE_DIR}/${f}`, {
      method: 'PUT', headers: { AccessKey: key, 'Content-Type': 'image/png' }, body: fs.readFileSync(path.join(MEDIA_DIR, f)),
    });
    if (!res.ok) { console.error(`✗ ${f}: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
    if (++n % 20 === 0 || n === files.length) console.log(`  ↑ ${n}/${files.length}  (${REMOTE_DIR}/${f})`);
  }
  console.log(`✓ ${files.length} figure(s) uploaded.`);
}

(async () => {
  loadEnvLocal();
  const apply = process.argv.includes('--apply');
  const allowMissingImages = process.argv.includes('--allow-missing-images');
  const parsed = JSON.parse(fs.readFileSync(PARSED, 'utf8'));

  // ── figures ──
  const figs = [];
  for (const s of parsed) for (const q of s.questions) for (const f of q.images || []) {
    if (!fs.existsSync(path.join(MEDIA_DIR, f))) { console.error(`✗ missing local figure ${f} — re-run the parser`); process.exit(1); }
    if (!q.question.includes(cdnUrl(f))) { console.error(`✗ ${s.slug} Q${q.number}: HTML does not reference ${cdnUrl(f)} — parser/apply CDN path drift`); process.exit(1); }
    figs.push(f);
  }
  if (process.argv.includes('--upload-images')) { await uploadImages(figs); return; }
  // Sequential with retries: parallel HEADs get the odd refusal from the CDN edge.
  const figsMissing = [];
  for (const f of figs) {
    let status = 'error';
    for (let attempt = 0; attempt < 3; attempt++) {
      try { const r = await fetch(cdnUrl(f), { method: 'HEAD' }); status = r.status; if (r.ok) break; } catch (e) { status = e.message; }
      await new Promise((res) => setTimeout(res, 600));
    }
    if (status !== 200) figsMissing.push(`${f} (${status})`);
  }

  const postgres = require('postgres');
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL missing (app/.env.local or environment).'); process.exit(1); }
  const target = url.includes('127.0.0.1') ? 'LOCAL' : 'PROD';
  const db = postgres(url, { max: 1, prepare: false, ssl: target === 'LOCAL' ? false : 'require', onnotice: () => {} });

  try {
    // ── lookups (read-only) ──
    const problems = [];
    const slugs = parsed.map((s) => s.slug);
    for (const s of parsed) {
      if (!SLUG_RE.test(s.slug)) problems.push(`${s.slug}: not a pegada-inep slug`);
      if (s.questions.length !== 25) problems.push(`${s.slug}: ${s.questions.length} questions (expected 25)`);
      s.questions.forEach((q, i) => { if (+q.position !== i + 1) problems.push(`${s.slug}: position ${q.position} at index ${i}`); });
    }
    if (new Set(slugs).size !== slugs.length) problems.push('duplicate slugs in the delivery');

    const existing = await db`SELECT id, slug, title, status, type, view, specialty_id, content_module_id FROM pages WHERE slug IN ${db(slugs)}`;
    const bySlug = new Map(existing.map((p) => [p.slug, p]));
    for (const p of existing) {
      if (p.view !== 'simulados' || p.type !== 'h5p-quiz' || p.specialty_id != null || p.content_module_id != null) {
        problems.push(`${p.slug}: page ${p.id} exists with another shape (view=${p.view}, type=${p.type}, specialty=${p.specialty_id}, module=${p.content_module_id}) — refusing`);
      }
    }
    const [{ max: maxPageId }] = await db`SELECT COALESCE(MAX(id), 0)::bigint AS max FROM pages`;

    const liveRows = existing.length
      ? await db`SELECT id, page_id, position, question, answers, explanation_html, media_url FROM quiz_questions WHERE page_id IN ${db(existing.map((p) => p.id))} ORDER BY page_id, position`
      : [];
    const liveByPage = new Map();
    for (const q of liveRows) { const k = String(q.page_id); if (!liveByPage.has(k)) liveByPage.set(k, []); liveByPage.get(k).push(q); }

    const tot = { create: 0, update: 0, unchanged: 0, insert: 0 };
    const plan = []; // {s, page|null, ops}
    const rewrittenIds = [];
    for (const s of parsed) {
      const page = bySlug.get(s.slug) || null;
      if (!page) tot.create++;
      const live = page ? (liveByPage.get(String(page.id)) || []) : [];
      const livePos = new Map(live.map((q) => [q.position, q]));
      const delivered = new Set(s.questions.map((q) => +q.position));
      for (const lq of live) if (!delivered.has(lq.position)) problems.push(`${s.slug}: live Q at position ${lq.position} (row ${lq.id}) has no delivered replacement`);
      const ops = [];
      for (const q of s.questions) {
        const lq = livePos.get(+q.position);
        if (!lq) { ops.push({ kind: 'insert', q }); tot.insert++; continue; }
        const same = lq.question === q.question && JSON.stringify(lq.answers) === JSON.stringify(q.answers)
          && (lq.explanation_html || null) === (q.explanation_html || null) && lq.media_url == null;
        ops.push({ kind: same ? 'unchanged' : 'update', liveId: lq.id, q });
        tot[same ? 'unchanged' : 'update']++;
        if (!same && lq.question !== q.question) rewrittenIds.push(lq.id);
      }
      plan.push({ s, page, ops });
    }
    const [{ n: reviewRows }] = rewrittenIds.length
      ? await db`SELECT count(*)::int n FROM review_schedule WHERE item_type = 'quiz_question' AND item_id IN ${db(rewrittenIds)}`
      : [{ n: 0 }];
    const seeded = await db`SELECT key FROM site_content WHERE key IN ${db(SITE_CONTENT.map(([k]) => k))}`;
    const [{ n: publishedQ }] = await db`SELECT count(*)::int n FROM quiz_questions q JOIN pages p ON p.id = q.page_id WHERE p.status = 'publish'`;

    // ── report ──
    const nQ = parsed.reduce((n, s) => n + s.questions.length, 0);
    console.log(`\n=== apply-pegada-inep  [target: ${target}]  ${apply ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`  delivery: ${parsed.length} simulados / ${nQ} questions / ${figs.length} figures`);
    console.log(`  CREATE pages: ${tot.create}   existing: ${existing.length}`);
    console.log(`  questions: INSERT ${tot.insert}   UPDATE ${tot.update}   identical ${tot.unchanged}`);
    console.log(`  review_schedule rows removed (rewritten stems): ${reviewRows}`);
    console.log(`  site_content rows to seed: ${SITE_CONTENT.length - seeded.length} (already there: ${seeded.length})`);
    console.log(`  figures on the CDN: ${figs.length - figsMissing.length}/${figs.length}${figsMissing.length ? `  (missing: ${figsMissing.slice(0, 5).join(', ')}${figsMissing.length > 5 ? ' …' : ''} — run --upload-images first)` : ''}`);
    console.log(`  published questions on the platform: ${publishedQ} → ${publishedQ + tot.insert} after apply (sales-page counter)`);
    if (figsMissing.length && !allowMissingImages) problems.push(`${figsMissing.length} figure(s) not on the CDN — run --upload-images (or --allow-missing-images for a local test)`);
    if (problems.length) { console.log(`\n  ✗ ${problems.length} VALIDATION PROBLEM(S):`); problems.forEach((p) => console.log(`    - ${p}`)); process.exit(1); }
    console.log('  ✓ validation clean');
    if (!apply) { console.log('\n  DRY RUN — re-run with --apply to execute.'); return; }

    // ── apply (one transaction) ──
    const t0 = Date.now();
    const step = (msg) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
    await db.begin(async (sql) => {
      const [{ ok }] = await sql`SELECT pg_try_advisory_xact_lock(hashtext('apply-pegada-inep')) AS ok`;
      if (!ok) throw new Error('another apply-pegada-inep run is in progress — wait for it to finish, then re-run');

      // 1. pages that do not exist yet (ids continue after the current max, like every import)
      let pid = BigInt(maxPageId);
      const pageId = new Map(existing.map((p) => [p.slug, p.id]));
      const newPages = plan.filter((p) => !p.page).map((p) => {
        pid += 1n;
        pageId.set(p.s.slug, pid.toString());
        return { id: pid.toString(), slug: p.s.slug, title: p.s.title };
      });
      if (newPages.length) {
        const r = await sql`
          INSERT INTO pages (id, slug, title, type, status, view, specialty_id, content_module_id, notes, wp_created_at, wp_modified_at)
          SELECT v.id, v.slug, v.title, 'h5p-quiz'::page_type, 'publish', 'simulados'::page_view, NULL, NULL, ${NOTE}, now(), now()
          FROM jsonb_to_recordset(${sql.json(newPages)}::jsonb) AS v(id bigint, slug text, title text)`;
        if (r.count !== newPages.length) throw new Error(`pages: ${r.count} of ${newPages.length} rows`);
        step(`created ${newPages.length} page(s)`);
      }

      // 2. review state earned on stems that changed
      if (rewrittenIds.length) await sql`DELETE FROM review_schedule WHERE item_type = 'quiz_question' AND item_id IN ${sql(rewrittenIds)}`;

      // 3. questions — batched (row by row through the prod pooler is minutes of silence)
      const CHUNK = 300;
      const updates = []; const inserts = [];
      for (const p of plan) for (const o of p.ops) {
        const row = { question: o.q.question, answers: o.q.answers, explanation_html: o.q.explanation_html };
        if (o.kind === 'update') updates.push({ id: o.liveId, ...row });
        else if (o.kind === 'insert') inserts.push({ page_id: pageId.get(p.s.slug), position: +o.q.position, ...row });
      }
      for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        const r = await sql`
          UPDATE quiz_questions q
          SET question = v.question, answers = v.answers, explanation_html = v.explanation_html, media_url = NULL, h5p_sub_id = NULL
          FROM jsonb_to_recordset(${sql.json(chunk)}::jsonb) AS v(id bigint, question text, answers jsonb, explanation_html text)
          WHERE q.id = v.id`;
        if (r.count !== chunk.length) throw new Error(`update chunk at ${i}: ${r.count} of ${chunk.length} rows`);
        step(`updated ${Math.min(i + CHUNK, updates.length)}/${updates.length} questions`);
      }
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const chunk = inserts.slice(i, i + CHUNK);
        const r = await sql`
          INSERT INTO quiz_questions (page_id, position, question, answers, media_url, explanation_html)
          SELECT v.page_id, v.position, v.question, v.answers, NULL, v.explanation_html
          FROM jsonb_to_recordset(${sql.json(chunk)}::jsonb) AS v(page_id bigint, position int, question text, answers jsonb, explanation_html text)`;
        if (r.count !== chunk.length) throw new Error(`insert chunk at ${i}: ${r.count} of ${chunk.length} rows`);
        step(`inserted ${Math.min(i + CHUNK, inserts.length)}/${inserts.length} questions`);
      }
      const touched = plan.filter((p) => p.page && p.ops.some((o) => o.kind !== 'unchanged')).map((p) => p.page.id);
      if (touched.length) await sql`UPDATE pages SET updated_at = now() WHERE id IN ${sql(touched)}`;

      // 4. editable copy for the two GERAL cards — never overwrites an admin's edit
      for (const [key, value] of SITE_CONTENT) {
        await sql`INSERT INTO site_content (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO NOTHING`;
      }

      // 5. invariants — fail the whole transaction rather than commit something odd
      const bad = await sql`
        SELECT p.slug, count(q.id)::int n, max(q.position)::int mx, min(q.position)::int mn
        FROM pages p LEFT JOIN quiz_questions q ON q.page_id = p.id
        WHERE p.slug IN ${sql(slugs)} GROUP BY p.slug
        HAVING count(q.id) <> 25 OR max(q.position) <> 25 OR min(q.position) <> 1`;
      if (bad.length) throw new Error(`not 25 contiguous questions: ${bad.map((b) => `${b.slug}(${b.n})`).join(', ')}`);
      const [{ n: shape }] = await sql`
        SELECT count(*)::int n FROM pages WHERE slug IN ${sql(slugs)}
          AND view = 'simulados' AND type = 'h5p-quiz' AND status = 'publish' AND specialty_id IS NULL AND content_module_id IS NULL`;
      if (shape !== slugs.length) throw new Error(`${slugs.length - shape} page(s) without the Geral shape`);
      const [{ n: touched100q }] = await sql`SELECT count(*)::int n FROM pages WHERE slug LIKE 'simulado-100q-%' AND updated_at = now()`;
      if (touched100q) throw new Error('a Simulado 100Q page was touched');
      step('invariants passed — committing');
    });

    // ── verify ──
    const [{ tp, qn, img }] = await db`
      SELECT count(DISTINCT p.id)::int tp, count(q.id)::int qn, count(*) FILTER (WHERE q.question LIKE '%quiz-figure%')::int img
      FROM pages p JOIN quiz_questions q ON q.page_id = p.id
      WHERE p.slug LIKE 'pegada-inep-%' AND p.status = 'publish'`;
    const [{ n: after }] = await db`SELECT count(*)::int n FROM quiz_questions q JOIN pages p ON p.id = q.page_id WHERE p.status = 'publish'`;
    console.log(`\n  ✓ APPLIED to ${target}: ${tp} Questões Pegada INEP simulados, ${qn} questions, ${img} with a figure.`);
    console.log(`    published questions on the platform now: ${after}`);
    console.log('    rollback: scripts/rollback-pegada-inep.sql');
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
