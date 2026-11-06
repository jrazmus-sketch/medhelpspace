#!/usr/bin/env node
'use strict';

/**
 * AudioCards v2 — Karina 2026-11-04, "Substituição completa dos AudioCards e atualização
 * da estrutura de transcrição". Replaces EVERY AudioCard (transcript + audio) with her
 * delivery; nothing old may remain, nothing may be duplicated.
 *
 * The delivery (Drive zip) is `flashcards/<folder…>/<file>.md.docx` + `<file>_A.mp3`, one
 * pair per theme. The transcript format changed: no more **Pergunta:** / **Resposta:**
 * markers. Each card is now
 *
 *   ## Card N          ← a Word heading (or a literal "## Card N" line)
 *   Texto da pergunta. ← first block  = question
 *   Texto da resposta. ← second block = answer
 *
 * and the file opens with "===FILE: x.md===" + "specialty: X subject: Y" header lines.
 *
 * The specialty is the FOLDER (as with Revalida Up / Resumos v2): `clinica-medica/<spec>/`
 * or a top-level `<spec>/`, onto the `<spec>-audiocards` page. Two MP3s sit in the wrong
 * folder (byte-identical copies of another theme's audio, see MISFILED_AUDIO) — they are
 * never attached to anything. A theme without its own MP3 imports text-only (audio_url
 * NULL) until she sends it: an old recording must never play under a new transcript.
 *
 * Lessons are replaced IN PLACE (same lesson id → `?s=<id>` links and the dashboard
 * playlist keep working): matched by the old recording's file name, then by title.
 * Unmatched old lessons are deleted; new themes are inserted. lesson_progress (resume
 * position) is cleared for every lesson of these pages, because the audio changed.
 * The `audiocards` hub page (its 6 lessons are the specialty link menus) is not touched.
 *
 * Modes (all read the delivery with --dir <folder that contains flashcards/>):
 *   node scripts/import-audiocards-v2.js --dir <d>              → report + parsed/audiocards-v2-import.sql
 *   node scripts/import-audiocards-v2.js --dir <d> --upload     → also PUT the MP3s to Bunny (v2 path)
 *   node scripts/import-audiocards-v2.js --snapshot <label>     → parsed/audiocards-rollback-<label>.sql
 *       (run BEFORE applying, once per database: DATABASE_URL=… for local)
 * Then apply with scripts/run-sql.js parsed/audiocards-v2-import.sql (prod, then local).
 *
 * Reads prod (app/.env.local) to name themes after their flashcard deck labels — the
 * Flashcards already carry this delivery's text — and to plan the in-place matches.
 */

const fs = require('fs');
const path = require('path');
const { unzipSync, strFromU8 } = require(path.join(__dirname, '..', 'app', 'node_modules', 'fflate'));

const envPath = path.join(__dirname, '..', 'app', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('='); if (eq === -1) continue;
  const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  if (!(k in process.env)) process.env[k] = v;
}

const OUT_SQL = path.join(__dirname, '..', 'parsed', 'audiocards-v2-import.sql');
const OUT_MANIFEST = path.join(__dirname, '..', 'parsed', 'audiocards-v2-manifest.json');
const CDN = (process.env.BUNNY_CDN_BASE || 'https://medhelpspace.b-cdn.net').replace(/\/$/, '');
// New folder, not the old paths: the CDN must never serve a cached old recording.
const BUNNY_DIR = 'AudioCards-Audio/v2';

// Copies of another theme's recording in the wrong folder (md5-identical, checked
// 2026-11-04). The theme of that folder has no recording of its own yet.
const MISFILED_AUDIO = new Set([
  'clinica-medica/nefrologia/disturbios-da-hemostasia-primaria_A.mp3',   // = hematologia's
  'clinica-medica/infectologia/ulcera-peptica-e-helicobacter-pylori_A.mp3', // = gastroenterologia's
]);

const AUDIOCARDS_HUB = 'audiocards';

// Header subjects that are a file name rather than a title → the Flashcards deck label.
const TITLE_OVERRIDES = {
  'neurologia|coluna-vertebral-trauma-raquimedular': 'Coluna Vertebral e Trauma Raquimedular',
};

// ── helpers ───────────────────────────────────────────────────────────────────
const sqlStr = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const htmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const normKey = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const xmlDecode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');

// "cirurgia-geral__trauma-de-torax.md.docx" → "trauma-de-torax"; "lupus_A.mp3" → "lupus"
function fileSlug(name) {
  const b = path.basename(name).replace(/\.md\.docx$/i, '').replace(/\.mp3$/i, '').replace(/[-._ ]a$/i, '');
  const i = b.indexOf('__');
  return (i >= 0 ? b.slice(i + 2) : b).trim().toLowerCase();
}

function dbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
  return `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`;
}
function connect(url) {
  return require('postgres')(url, { max: 1, connect_timeout: 15, ssl: /127\.0\.0\.1|localhost/.test(url) ? false : 'require' });
}

// ── .docx → [{heading, text}] ────────────────────────────────────────────────────
function docxBlocks(file) {
  const xml = strFromU8(unzipSync(fs.readFileSync(file))['word/document.xml']);
  const out = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
    const style = (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
    const text = xmlDecode(
      p.replace(/<w:tab\/>|<w:br\/>/g, '<w:t> </w:t>')
        .match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g)?.map((t) => t.replace(/<[^>]+>/g, '')).join('') ?? '',
    ).replace(/\s+/g, ' ').trim();
    out.push({ heading: /^Heading\d|^Ttulo\d|^Title/i.test(style), text });
  }
  return out;
}

// ── one transcript → { header, cards, issues } ──────────────────────────────────
function parseTranscript(file) {
  const issues = [];
  let subject = null;
  let headerSpecialty = null;
  const cards = [];
  let cur = null;
  for (const { heading, text } of docxBlocks(file)) {
    if (!text) continue;
    const md = text.replace(/^#{1,6}\s*/, '').replace(/^\*\*(.*)\*\*$/, '$1').trim();
    if (/^={2,}\s*FILE:/i.test(md)) continue;
    const hdr = md.match(/^specialty:\s*(.+?)\s+subject:\s*(.+)$/i);
    if (hdr) { headerSpecialty = hdr[1].trim(); subject = hdr[2].trim(); continue; }
    const card = md.match(/^Card\s+(\d+)\s*:?$/i);
    // A "Card N" line opens a card whether Word kept it as a heading or as "## Card N" text.
    if (card) {
      if (!heading && !/^#/.test(text)) issues.push(`"${text}" is plain text, read as a card heading`);
      cur = { n: Number(card[1]), blocks: [] };
      cards.push(cur);
      continue;
    }
    if (!cur) { issues.push(`text before the first card: "${md.slice(0, 60)}"`); continue; }
    if (/\*\*(Pergunta|Resposta)\s*:?\*\*/i.test(text)) issues.push(`card ${cur.n}: old Pergunta/Resposta marker`);
    cur.blocks.push(md);
  }
  cards.forEach((c, i) => {
    if (c.n !== i + 1) issues.push(`card numbering: found Card ${c.n} at position ${i + 1}`);
    if (c.blocks.length < 2) issues.push(`card ${c.n}: ${c.blocks.length} block(s) — needs a question and an answer`);
    if (c.blocks.length > 2) issues.push(`card ${c.n}: ${c.blocks.length} blocks — answer kept as ${c.blocks.length - 1} paragraphs`);
  });
  if (!subject) issues.push('no "specialty: … subject: …" header');
  if (!cards.length) issues.push('no cards');
  return { subject, headerSpecialty, cards, issues };
}

function transcriptHtml(cards) {
  return cards.map((c, i) => {
    const [q, ...a] = c.blocks;
    return `<h3 class="ac-card">Card ${i + 1}</h3>` +
      `<p class="ac-q">${htmlEsc(q ?? '')}</p>` +
      a.map((x) => `<p class="ac-a">${htmlEsc(x)}</p>`).join('');
  }).join('');
}

const SMALL = new Set(['a', 'o', 'as', 'os', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos', 'por', 'com', 'para', 'à', 'ao']);
function titleCase(s) {
  return s.split(/\s+/).map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
}

function walk(d, root, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, root, out);
    else out.push(path.relative(root, p).split(path.sep).join('/'));
  }
  return out;
}

// ── snapshot (rollback) ─────────────────────────────────────────────────────────
async function snapshot(label) {
  const db = connect(dbUrl());
  const pages = await db`SELECT id, slug FROM pages WHERE track_id = 2 AND slug <> ${AUDIOCARDS_HUB} ORDER BY slug`;
  const ids = pages.map((p) => p.id);
  const lessons = await db`SELECT id, page_id, position, title, body_html, audio_url, audio_added_at, created_at
                           FROM lessons WHERE page_id = ANY(${ids}) ORDER BY page_id, position`;
  const progress = await db`SELECT lp.* FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id WHERE l.page_id = ANY(${ids})`;
  await db.end();
  const ts = (d) => (d ? sqlStr(new Date(d).toISOString()) : 'NULL');
  let sql = `-- AudioCards rollback snapshot (${label}), ${new Date().toISOString()}\n` +
    `-- ${lessons.length} lessons on ${pages.length} pages, ${progress.length} lesson_progress rows.\n` +
    `-- Restores the AudioCards lessons exactly (same ids). Apply with scripts/run-sql.js.\n\n` +
    `DELETE FROM lessons WHERE page_id IN (SELECT id FROM pages WHERE track_id = 2 AND slug <> '${AUDIOCARDS_HUB}');\n`;
  for (const l of lessons) {
    sql += `INSERT INTO lessons (id, page_id, position, title, body_html, audio_url, audio_added_at, created_at) VALUES (` +
      `${l.id}, ${l.page_id}, ${l.position}, ${sqlStr(l.title)}, ${sqlStr(l.body_html)}, ${sqlStr(l.audio_url)}, ${ts(l.audio_added_at)}, ${ts(l.created_at)});\n`;
  }
  for (const p of progress) {
    sql += `INSERT INTO lesson_progress (user_id, lesson_id, position_seconds, updated_at) VALUES (` +
      `${sqlStr(p.user_id)}, ${p.lesson_id}, ${p.position_seconds}, ${ts(p.updated_at)}) ON CONFLICT DO NOTHING;\n`;
  }
  const out = path.join(__dirname, '..', 'parsed', `audiocards-rollback-${label}.sql`);
  fs.writeFileSync(out, sql, 'utf8');
  console.log(`Wrote ${out} (${lessons.length} lessons, ${progress.length} progress rows)`);
}

// The parser is reused by scripts/apply-audiocards-missing-audio.js (2026-11-05).
module.exports = { parseTranscript, transcriptHtml, fileSlug, BUNNY_DIR, CDN };

// ── main ────────────────────────────────────────────────────────────────────────
if (require.main === module) (async () => {
  const args = process.argv.slice(2);
  if (args.includes('--snapshot')) return snapshot(args[args.indexOf('--snapshot') + 1] || 'snapshot');

  const dirArg = args.includes('--dir') ? path.resolve(args[args.indexOf('--dir') + 1]) : null;
  if (!dirArg || !fs.existsSync(dirArg)) { console.error('Pass --dir <folder that contains flashcards/>'); process.exit(1); }
  const root = fs.existsSync(path.join(dirArg, 'flashcards')) ? path.join(dirArg, 'flashcards') : dirArg;
  const upload = args.includes('--upload');

  // Group the files into themes by folder + slug.
  const themes = new Map();
  for (const rel of walk(root, root)) {
    const parts = rel.split('/');
    const folder = parts.slice(0, -1).join('/');
    const spec = parts.length >= 3 ? parts[parts.length - 2] : parts[0]; // clinica-medica/<spec>/… or <spec>/…
    const key = `${folder}|${fileSlug(rel)}`;
    if (!themes.has(key)) themes.set(key, { folder, spec, slug: fileSlug(rel) });
    const t = themes.get(key);
    if (/\.md\.docx$/i.test(rel)) t.docx = rel;
    else if (/\.mp3$/i.test(rel)) { if (MISFILED_AUDIO.has(rel)) t.misfiled = rel; else t.mp3 = rel; }
    else console.warn(`? ignored file ${rel}`);
  }

  // Prod: the AudioCards pages, their current lessons, and the flashcard deck labels.
  const db = connect(dbUrl());
  const pages = await db`SELECT id, slug FROM pages WHERE track_id = 2 AND slug <> ${AUDIOCARDS_HUB}`;
  const pageBySpec = new Map(pages.map((p) => [p.slug.replace(/-audiocards$/, ''), p]));
  const oldLessons = await db`SELECT l.id, l.title, l.audio_url, p.slug AS page_slug FROM lessons l
                              JOIN pages p ON p.id = l.page_id WHERE p.track_id = 2 AND p.slug <> ${AUDIOCARDS_HUB}`;
  const fcLabels = await db`SELECT DISTINCT p.slug AS page_slug, fi.group_label FROM flashcard_items fi
                            JOIN pages p ON p.id = fi.page_id WHERE p.track_id = 3 AND fi.group_label IS NOT NULL`;
  await db.end();
  const labelsBySpec = new Map();
  for (const r of fcLabels) {
    const spec = r.page_slug.replace(/-flashcards$/, '');
    if (!labelsBySpec.has(spec)) labelsBySpec.set(spec, []);
    labelsBySpec.get(spec).push(r.group_label.trim());
  }

  const problems = [];
  const rows = [];
  for (const t of [...themes.values()].sort((a, b) => a.folder.localeCompare(b.folder) || a.slug.localeCompare(b.slug))) {
    const page = pageBySpec.get(t.spec);
    if (!page) { problems.push(`${t.folder}/${t.slug}: no ${t.spec}-audiocards page`); continue; }
    if (!t.docx) { problems.push(`${t.folder}/${t.slug}: audio without a transcript (${t.mp3 || t.misfiled}) — not imported`); continue; }
    const parsed = parseTranscript(path.join(root, t.docx));
    for (const i of parsed.issues) problems.push(`${t.docx}: ${i}`);
    if (parsed.headerSpecialty && normKey(parsed.headerSpecialty) !== normKey(t.spec)) {
      problems.push(`${t.docx}: header says specialty "${parsed.headerSpecialty}", folder is ${t.spec} — FOLDER wins`);
    }
    // Title: the Flashcards deck label of the same theme (same text, same delivery), else the header.
    const labels = labelsBySpec.get(t.spec) || [];
    const subjKey = normKey(parsed.subject || t.slug);
    const label = TITLE_OVERRIDES[`${t.spec}|${t.slug}`]
      || labels.find((l) => normKey(l) === subjKey) || labels.find((l) => normKey(l) === normKey(t.slug));
    const title = label || titleCase(parsed.subject || t.slug.replace(/-/g, ' '));
    // The old lesson this one replaces: its recording had the same file slug, else the same title.
    const pageOld = oldLessons.filter((l) => l.page_slug === page.slug);
    const old = pageOld.find((l) => l.audio_url && fileSlug(l.audio_url) === t.slug)
      || pageOld.find((l) => normKey(l.title) === normKey(title));
    rows.push({
      page_slug: page.slug, spec: t.spec, slug: t.slug, title, title_source: label ? 'flashcards' : 'header',
      match_title: old?.title ?? null, cards: parsed.cards.length,
      body_html: transcriptHtml(parsed.cards),
      mp3: t.mp3 ?? null,
      bunny_path: t.mp3 ? `${BUNNY_DIR}/${t.spec}/${t.slug}-A.mp3` : null,
      misfiled: t.misfiled ?? null,
    });
  }

  // Positions: alphabetical (pt) per page — the order the Flashcards decks use.
  const byPage = new Map();
  for (const r of rows) { if (!byPage.has(r.page_slug)) byPage.set(r.page_slug, []); byPage.get(r.page_slug).push(r); }
  for (const list of byPage.values()) {
    list.sort((a, b) => a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' }));
    list.forEach((r, i) => { r.position = i + 1; });
    const seen = new Set();
    for (const r of list) {
      if (seen.has(normKey(r.title))) problems.push(`${r.page_slug}: duplicate theme "${r.title}"`);
      seen.add(normKey(r.title));
    }
  }
  for (const p of pages) if (!byPage.has(p.slug)) problems.push(`${p.slug}: no theme in the delivery — its old AudioCards would stay (page left untouched)`);
  const matchCount = new Map();
  for (const r of rows) if (r.match_title) {
    const k = `${r.page_slug}|${r.match_title}`;
    matchCount.set(k, (matchCount.get(k) || 0) + 1);
  }
  for (const [k, n] of matchCount) if (n > 1) problems.push(`${k}: ${n} new themes claim the same old lesson`);
  for (const r of rows) if (r.match_title && matchCount.get(`${r.page_slug}|${r.match_title}`) > 1) r.match_title = null;

  // ── report ──
  const retired = oldLessons.filter((l) => !rows.some((r) => r.page_slug === l.page_slug && r.match_title === l.title));
  console.log(`Themes: ${rows.length} on ${byPage.size} pages · ${rows.reduce((n, r) => n + r.cards, 0)} cards`);
  console.log(`  with audio: ${rows.filter((r) => r.mp3).length} · text-only (no recording in the delivery): ${rows.filter((r) => !r.mp3).length}`);
  console.log(`  replace in place: ${rows.filter((r) => r.match_title).length} · new: ${rows.filter((r) => !r.match_title).length} · old lessons removed: ${retired.length}`);
  console.log(`  titles from the Flashcards deck: ${rows.filter((r) => r.title_source === 'flashcards').length} · from the file header: ${rows.filter((r) => r.title_source === 'header').length}`);
  for (const r of rows.filter((x) => !x.mp3)) console.log(`  TEXT-ONLY ${r.page_slug} / ${r.title}${r.misfiled ? ` (folder holds ${r.misfiled}, another theme's recording)` : ''}`);
  for (const r of rows.filter((x) => !x.match_title)) console.log(`  NEW       ${r.page_slug} / ${r.title}`);
  for (const r of rows.filter((x) => x.match_title && x.match_title !== x.title)) console.log(`  RENAMED   ${r.page_slug} / ${r.match_title} → ${r.title}`);
  for (const l of retired) console.log(`  REMOVED   ${l.page_slug} / ${l.title}`);
  for (const r of rows.filter((x) => x.title_source === 'header')) console.log(`  TITLE?    ${r.page_slug} / ${r.title} (no matching flashcard deck label)`);
  if (problems.length) { console.log(`\n${problems.length} note(s):`); for (const p of problems) console.log(`  - ${p}`); }

  // ── upload ──
  if (upload) {
    const HOST = process.env.BUNNY_STORAGE_HOSTNAME;
    const ZONE = process.env.BUNNY_STORAGE_ZONE;
    const KEY = process.env.BUNNY_API_KEY; // the read-WRITE key (BUNNY_STORAGE_PASSWORD is read-only)
    if (!HOST || !ZONE || !KEY) throw new Error('Missing BUNNY_STORAGE_HOSTNAME / BUNNY_STORAGE_ZONE / BUNNY_API_KEY');
    let ok = 0;
    for (const r of rows.filter((x) => x.mp3)) {
      const res = await fetch(`https://${HOST}/${ZONE}/${r.bunny_path}`, {
        method: 'PUT', headers: { AccessKey: KEY, 'Content-Type': 'application/octet-stream' },
        body: fs.readFileSync(path.join(root, r.mp3)),
      });
      if (!res.ok) throw new Error(`PUT ${r.bunny_path}: ${res.status} ${res.statusText}`);
      ok++; process.stdout.write('.');
    }
    console.log(`\nUploaded ${ok} recordings to ${BUNNY_DIR}/`);
  }

  // ── SQL ──
  const slugs = [...byPage.keys()].sort();
  const values = rows.map((r) => `  (${sqlStr(r.page_slug)}, ${sqlStr(r.title)}, ${sqlStr(r.match_title)}, ${r.position}, ` +
    `${sqlStr(r.body_html)}, ${r.bunny_path ? sqlStr(`${CDN}/${r.bunny_path}`) : 'NULL'})`).join(',\n');
  const expected = slugs.map((s) => `(${sqlStr(s)}, ${byPage.get(s).length})`).join(', ');
  const sql = `-- AudioCards v2 (Karina 2026-11-04) — generated by scripts/import-audiocards-v2.js. Do not edit.
-- ${rows.length} themes on ${slugs.length} pages. Replaces every AudioCards lesson IN PLACE (same id when
-- the theme existed), deletes the rest, inserts new themes; clears lesson_progress (the audio changed).
-- Snapshot first: node scripts/import-audiocards-v2.js --snapshot <label>
-- Apply: node scripts/run-sql.js parsed/audiocards-v2-import.sql   (prod, then local with DATABASE_URL)

CREATE TEMP TABLE ac_v2 (page_slug text, title text, match_title text, position int, body_html text, audio_url text) ON COMMIT DROP;
INSERT INTO ac_v2 VALUES
${values};

DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(DISTINCT n.page_slug, ', ') INTO missing FROM ac_v2 n LEFT JOIN pages p ON p.slug = n.page_slug WHERE p.id IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'AudioCards pages missing: %', missing; END IF;
END $$;

CREATE TEMP TABLE ac_pages ON COMMIT DROP AS SELECT id FROM pages WHERE slug IN (${slugs.map(sqlStr).join(', ')});

DELETE FROM lesson_progress WHERE lesson_id IN (SELECT id FROM lessons WHERE page_id IN (SELECT id FROM ac_pages));

-- park every position out of the way of (page_id, position) uniqueness
UPDATE lessons SET position = position + 10000 WHERE page_id IN (SELECT id FROM ac_pages);

CREATE TEMP TABLE ac_kept (lesson_id bigint, page_slug text, title text) ON COMMIT DROP;
WITH upd AS (
  UPDATE lessons l
     SET title = n.title, position = n.position, body_html = n.body_html, audio_url = n.audio_url,
         audio_added_at = CASE WHEN n.audio_url IS NULL THEN NULL ELSE now() END
    FROM ac_v2 n JOIN pages p ON p.slug = n.page_slug
   WHERE l.page_id = p.id AND n.match_title IS NOT NULL AND l.title = n.match_title
  RETURNING l.id, n.page_slug, n.title
)
INSERT INTO ac_kept SELECT * FROM upd;

DELETE FROM lessons WHERE page_id IN (SELECT id FROM ac_pages) AND id NOT IN (SELECT lesson_id FROM ac_kept);

INSERT INTO lessons (page_id, position, title, body_html, audio_url, audio_added_at)
SELECT p.id, n.position, n.title, n.body_html, n.audio_url, CASE WHEN n.audio_url IS NULL THEN NULL ELSE now() END
  FROM ac_v2 n JOIN pages p ON p.slug = n.page_slug
 WHERE NOT EXISTS (SELECT 1 FROM ac_kept k WHERE k.page_slug = n.page_slug AND k.title = n.title);

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(e.slug || ' ' || coalesce(c.n, 0) || '/' || e.n, ', ') INTO bad
    FROM (VALUES ${expected}) AS e(slug, n)
    LEFT JOIN (SELECT p.slug, count(*) n FROM lessons l JOIN pages p ON p.id = l.page_id GROUP BY p.slug) c ON c.slug = e.slug
   WHERE coalesce(c.n, 0) <> e.n;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'AudioCards counts off: %', bad; END IF;
  IF (SELECT count(*) FROM lessons WHERE page_id IN (SELECT id FROM ac_pages)) <> ${rows.length} THEN
    RAISE EXCEPTION 'AudioCards total is not ${rows.length}';
  END IF;
  IF EXISTS (SELECT 1 FROM lessons WHERE page_id IN (SELECT id FROM ac_pages) AND (position > 10000 OR body_html LIKE '%Pergunta:</strong>%')) THEN
    RAISE EXCEPTION 'an old AudioCard survived';
  END IF;
END $$;
`;
  fs.writeFileSync(OUT_SQL, sql, 'utf8');
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify(rows.map(({ body_html, ...r }) => r), null, 2), 'utf8');
  console.log(`\nWrote ${path.relative(process.cwd(), OUT_SQL)} and ${path.relative(process.cwd(), OUT_MANIFEST)}`);
})().catch((e) => { console.error(e); process.exit(1); });
