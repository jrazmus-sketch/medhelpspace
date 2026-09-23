'use strict';
/**
 * import-memorecards.js — loads MemoreCards v2 into memorecard_items.
 *
 *   node scripts/import-memorecards.js              # DRY RUN — plan + checks (PROD via app/.env.local)
 *   node scripts/import-memorecards.js --upload     # PUT the WebP cards to Bunny (idempotent), then exit
 *   node scripts/import-memorecards.js --apply      # write the rows, ONE transaction
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/import-memorecards.js --apply
 *
 * Input: parsed/memorecards-manifest.json + parsed/memorecards-webp/ from
 * scripts/prepare-memorecards.py.
 *
 * Every theme folder is matched to its REVALIDA UP topic page by slug
 * (`<tema>-revalida-up`): Karina's rule is that the MemoreCards structure IS the
 * Revalida Up structure, so no second taxonomy is kept. A folder with no matching
 * topic is a validation problem, never a guess.
 *
 * Per theme that came in the delivery, the rows are REPLACED (the new set is the
 * set). Themes that did not come are left exactly as they are — the delivery is
 * explicitly incomplete ("não interprete a ausência de uma pasta… como ausência
 * daquele tema"), so absence must never delete anything. Nothing keys on a card
 * row: Revisão tracks a theme by its topic page id, so replacing a theme's rows
 * loses no history.
 *
 * Remote path images/memorecards/v1/<especialidade>/<tema>/<n>.webp — versioned, so a
 * later redo of a card can go to v2 without a cached copy of v1 lingering.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const MANIFEST = path.join(REPO, 'parsed', 'memorecards-manifest.json');
const CDN_BASE = 'https://medhelpspace.b-cdn.net';
const REMOTE_DIR = 'images/memorecards/v1';

function loadEnvLocal() {
  const raw = fs.readFileSync(path.join(REPO, 'app', '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

const remoteOf = (c) => `${REMOTE_DIR}/${c.spec}/${c.topic}/${c.position}.webp`;
const cdnOf = (c) => `${CDN_BASE}/${remoteOf(c)}`;

// A clean 404 is an answer (not uploaded yet) and is NOT retried — retrying every
// missing card three times made a pre-upload dry run take minutes. Only a network
// error or an edge refusal (5xx/429) earns a retry.
async function headOk(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok) return true;
      if (r.status === 404 || r.status === 403) return false;
    } catch { /* network — retry */ }
    await new Promise((res) => setTimeout(res, 700));
  }
  return false;
}

// Bounded parallelism: a few at a time is fast without tripping the CDN edge.
async function checkAll(cards, concurrency = 6) {
  const missing = []; let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < cards.length) { const c = cards[i++]; if (!(await headOk(cdnOf(c)))) missing.push(remoteOf(c)); }
  }));
  return missing;
}

async function upload(cards) {
  const endpoint = `https://${process.env.BUNNY_STORAGE_HOSTNAME}`.replace(/\/$/, '');
  const zone = process.env.BUNNY_STORAGE_ZONE; const key = process.env.BUNNY_API_KEY;
  if (!process.env.BUNNY_STORAGE_HOSTNAME || !zone || !key) { console.error('✗ Missing BUNNY_STORAGE_HOSTNAME / BUNNY_STORAGE_ZONE / BUNNY_API_KEY'); process.exit(1); }
  let done = 0;
  for (const c of cards) {
    const res = await fetch(`${endpoint}/${zone}/${remoteOf(c)}`, {
      method: 'PUT', headers: { AccessKey: key, 'Content-Type': 'image/webp' },
      body: fs.readFileSync(path.join(REPO, c.file)),
    });
    if (!res.ok) { console.error(`✗ ${remoteOf(c)}: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
    if (++done % 25 === 0) console.log(`  ↑ ${done}/${cards.length}`);
  }
  console.log(`✓ ${cards.length} card(s) uploaded to ${REMOTE_DIR}/`);
}

(async () => {
  loadEnvLocal();
  const apply = process.argv.includes('--apply');
  const cards = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  for (const c of cards) {
    if (!fs.existsSync(path.join(REPO, c.file))) { console.error(`✗ missing local file ${c.file}`); process.exit(1); }
  }
  if (process.argv.includes('--upload')) { await upload(cards); return; }

  const themes = new Map(); // "spec/topic" -> cards
  for (const c of cards) {
    const k = `${c.spec}/${c.topic}`;
    if (!themes.has(k)) themes.set(k, []);
    themes.get(k).push(c);
  }

  const postgres = require('postgres');
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL missing'); process.exit(1); }
  const target = url.includes('127.0.0.1') ? 'LOCAL' : 'PROD';
  const db = postgres(url, { max: 1, prepare: false, ssl: target === 'LOCAL' ? false : 'require', onnotice: () => {} });

  try {
    const topics = await db`
      SELECT p.id, p.slug, p.status, s.slug AS spec
      FROM pages p JOIN specialties s ON s.id = p.specialty_id
      WHERE p.view = 'revalida-up'`;
    const topicBySlug = new Map(topics.map((t) => [t.slug, t]));

    const problems = []; const warnings = []; const plan = [];
    for (const [k, list] of themes) {
      const { spec, topic } = list[0];
      const page = topicBySlug.get(`${topic}-revalida-up`);
      if (!page) { problems.push(`${k}: no Revalida Up topic '${topic}-revalida-up'`); continue; }
      if (page.status !== 'publish') warnings.push(`${k}: its Revalida Up topic is '${page.status}' — cards load but stay hidden`);
      if (page.spec !== spec) warnings.push(`${k}: filed under '${spec}' in the folder, but the topic lives in '${page.spec}' — it will show under ${page.spec}`);
      const positions = list.map((c) => c.position).sort((a, b) => a - b);
      if (positions.some((p, i) => p !== i + 1)) problems.push(`${k}: positions ${positions.join(',')} are not 1..${list.length}`);
      plan.push({ key: k, page, cards: list });
    }

    const missing = await checkAll(cards);

    const existing = await db`SELECT topic_page_id, count(*)::int n FROM memorecard_items GROUP BY 1`;
    const existingBy = new Map(existing.map((r) => [String(r.topic_page_id), r.n]));
    const replacing = plan.filter((p) => existingBy.has(String(p.page.id))).length;
    const untouched = existing.filter((r) => !plan.some((p) => String(p.page.id) === String(r.topic_page_id)));

    console.log(`\n=== import-memorecards  [target: ${target}]  ${apply ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`  delivery: ${cards.length} cards in ${themes.size} themes`);
    const bySpec = {};
    for (const p of plan) { bySpec[p.page.spec] ??= [0, 0]; bySpec[p.page.spec][0]++; bySpec[p.page.spec][1] += p.cards.length; }
    for (const [s, [t, n]] of Object.entries(bySpec).sort()) console.log(`    ${s.padEnd(20)} ${String(t).padStart(2)} temas  ${String(n).padStart(3)} cards`);
    console.log(`  themes replaced: ${replacing}   new: ${plan.length - replacing}   left untouched (not in this delivery): ${untouched.length}`);
    console.log(`  cards on the CDN: ${cards.length - missing.length}/${cards.length}${missing.length ? '  (run --upload first)' : ''}`);
    warnings.forEach((w) => console.log(`  ! ${w}`));
    if (missing.length) problems.push(`${missing.length} card(s) not on the CDN, e.g. ${missing[0]}`);
    if (problems.length) { console.log(`\n  ✗ ${problems.length} PROBLEM(S):`); problems.forEach((p) => console.log(`    - ${p}`)); process.exit(1); }
    console.log('  ✓ validation clean');
    if (!apply) { console.log('\n  DRY RUN — re-run with --apply.'); return; }

    await db.begin(async (sql) => {
      const [{ ok }] = await sql`SELECT pg_try_advisory_xact_lock(hashtext('import-memorecards')) AS ok`;
      if (!ok) throw new Error('another import-memorecards run is in progress');
      for (const p of plan) {
        await sql`DELETE FROM memorecard_items WHERE topic_page_id = ${p.page.id}`;
        const rows = p.cards.map((c) => ({
          topic_page_id: p.page.id, position: c.position, image_url: cdnOf(c), width: c.width, height: c.height,
        }));
        const r = await sql`
          INSERT INTO memorecard_items (topic_page_id, position, image_url, width, height)
          SELECT v.topic_page_id, v.position, v.image_url, v.width, v.height
          FROM jsonb_to_recordset(${sql.json(rows)}::jsonb)
               AS v(topic_page_id bigint, position smallint, image_url text, width smallint, height smallint)`;
        if (r.count !== rows.length) throw new Error(`${p.key}: inserted ${r.count} of ${rows.length}`);
      }
    });

    const [{ n, t }] = await db`SELECT count(*)::int n, count(DISTINCT topic_page_id)::int t FROM memorecard_items`;
    console.log(`\n  ✓ APPLIED to ${target}: memorecard_items now holds ${n} cards in ${t} themes.`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
