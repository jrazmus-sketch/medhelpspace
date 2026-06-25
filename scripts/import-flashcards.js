#!/usr/bin/env node
'use strict';

/**
 * Flashcard bulk importer (full-replace, Drive-authoritative).
 *
 * Reads the raw flashcard source files pulled from Google Drive into
 *   scratch/flashcards-src/<specialty-slug>/<subject>.txt
 * parses them into clean cards, diffs against the current DB, prints a
 * dry-run report, and (unless --report-only) writes parsed/flashcards-import.sql.
 *
 * It NEVER touches the DB to write — apply with:  node scripts/run-sql.js parsed/flashcards-import.sql
 * (run-sql wraps the file in a single transaction.)
 *
 * Source format (Google Docs exported via the connector). Header + numbered cards:
 *   ## \===FILE: cardiologia\_\_bradiarritmias.md===        <- artifact, ignored
 *   ## specialty: cardiologia subject: Bradiarritmias        <- subject = group_label
 *   ## Card 1
 *   Pergunta: ...?  Resposta: ...                            <- inline OR split across lines
 *   ## Card 2
 *   ...
 *
 * Flags:
 *   --report-only        parse + report, do NOT write SQL
 *   --specialty <slug>   restrict to one specialty dir (for validation)
 *   --src <dir>          override source dir (default scratch/flashcards-src)
 */

const fs = require('fs');
const path = require('path');

// ── env / connection (mirrors run-sql.js) ───────────────────────────────────────
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', 'app', '.env.local');
  let raw;
  try { raw = fs.readFileSync(envPath, 'utf8'); } catch { return; }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
function buildConnectionUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const pw = process.env.SUPABASE_DB_PASSWORD;
  if (!url || !pw) return null;
  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!ref) return null;
  return `postgresql://postgres:${encodeURIComponent(pw)}@db.${ref}.supabase.co:5432/postgres`;
}

// ── text cleanup ─────────────────────────────────────────────────────────────────
const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#8217;': '’', '&#8220;': '“', '&#8221;': '”', '&hellip;': '…' };
function htmlDecode(s) {
  return s.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&#8217;|&#8220;|&#8221;|&hellip;/g, (m) => ENTITIES[m] ?? m);
}
// Google Docs markdown export backslash-escapes punctuation (\_ \= \- \( \. \# ...).
// Medical Portuguese never uses a literal backslash, so unescape backslash+punct.
function unescapeMd(s) { return s.replace(/\\([^0-9A-Za-zÀ-ÿ\s])/g, '$1'); }
// Strip markdown emphasis markers and stray HTML, collapse whitespace.
function cleanInline(s) {
  return htmlDecode(unescapeMd(s))
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*/g, '')
    .replace(/^\s*[*_]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function cleanLabel(s) {
  return htmlDecode(unescapeMd(s)).replace(/<[^>]+>/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}
// Normalize for set-matching (diff only): accent-strip + lowercase.
function normKey(s) {
  return cleanLabel(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function sqlStr(s) { return `'${String(s).replace(/'/g, "''")}'`; }
function htmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// "cirurgia-geral__trauma-de-torax.txt" -> "trauma-de-torax" (the audio slug Karina used)
function fileSlug(fileLabel) { const b = fileLabel.replace(/\.txt$/i, ''); const i = b.indexOf('__'); return i >= 0 ? b.slice(i + 2) : b; }

// ── parse one source file ─────────────────────────────────────────────────────────
function parseFile(raw, fileLabel) {
  const issues = [];
  const text = raw.replace(/\r\n/g, '\n');

  // subject from "specialty: X subject: Y" header (Y may run to EOL)
  let subject = null, headerSpecialty = null;
  const hdr = text.match(/specialty:\s*(.+?)\s+subject:\s*([^\n]+)/i);
  if (hdr) { headerSpecialty = cleanLabel(hdr[1]); subject = cleanLabel(hdr[2]); }
  else {
    const sm = text.match(/subject:\s*([^\n]+)/i);
    if (sm) subject = cleanLabel(sm[1]);
    const sp = text.match(/specialty:\s*([^\n]+)/i);
    if (sp) headerSpecialty = cleanLabel(sp[1]);
  }
  if (!subject) issues.push('no subject header');

  // split on "Card N" markers (tolerate leading #'s and bold)
  const parts = text.split(/^\s*#{0,6}\s*\*{0,2}\s*Card\s+\d+\s*\*{0,2}\s*$/im);
  // parts[0] is the preamble (header); cards are parts[1..]
  const rawCards = parts.slice(1);
  const cards = [];
  rawCards.forEach((body, i) => {
    const cardNo = i + 1;
    // strip a trailing "===FILE..." or stray header artifacts inside body
    const b = body.replace(/^#{0,6}\s*\\?={2,}FILE:[^\n]*\n/i, '').trim();
    const m = b.match(/Pergunta:\s*([\s\S]*?)\s*Resposta:\s*([\s\S]*)$/i);
    if (!m) { issues.push(`card ${cardNo}: missing Pergunta/Resposta`); return; }
    const pergunta = cleanInline(m[1]);
    const resposta = cleanInline(m[2]);
    if (!pergunta) issues.push(`card ${cardNo}: empty Pergunta`);
    if (!resposta) issues.push(`card ${cardNo}: empty Resposta`);
    if (!pergunta || !resposta) return;
    cards.push({ pergunta, resposta });
  });
  if (cards.length === 0) issues.push('zero parseable cards');
  return { fileLabel, subject, headerSpecialty, cards, issues };
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const reportOnly = args.includes('--report-only');
  const onlySpec = args.includes('--specialty') ? args[args.indexOf('--specialty') + 1] : null;
  const srcDir = args.includes('--src') ? path.resolve(args[args.indexOf('--src') + 1])
    : path.join(__dirname, '..', 'scratch', 'flashcards-src');

  if (!fs.existsSync(srcDir)) { console.error(`Source dir not found: ${srcDir}`); process.exit(1); }

  // 1) current DB state (read-only)
  const conn = buildConnectionUrl();
  let dbPages = new Map();   // specialtySlug -> {page_id, slug}
  let dbGroups = new Map();  // specialtySlug -> [{label, cards}]
  let acPages = new Map();   // specialtySlug -> audiocards page_id
  let db = null;
  if (conn) {
    const postgres = require('postgres');
    db = postgres(conn, { max: 1, connect_timeout: 15, idle_timeout: 0 });
    const pages = await db`SELECT id, slug FROM pages WHERE slug LIKE '%-flashcards'`;
    for (const p of pages) dbPages.set(p.slug.replace(/-flashcards$/, ''), { page_id: Number(p.id), slug: p.slug });
    const acRows = await db`SELECT id, slug FROM pages WHERE slug LIKE '%-audiocards'`;
    for (const p of acRows) acPages.set(p.slug.replace(/-audiocards$/, ''), Number(p.id));
    const grp = await db`
      SELECT p.slug AS page_slug, fi.group_label, COUNT(*)::int AS cards
      FROM flashcard_items fi JOIN pages p ON p.id = fi.page_id
      GROUP BY p.slug, fi.group_label ORDER BY p.slug`;
    for (const g of grp) {
      const spec = g.page_slug.replace(/-flashcards$/, '');
      if (!dbGroups.has(spec)) dbGroups.set(spec, []);
      dbGroups.get(spec).push({ label: cleanLabel(g.group_label || ''), cards: g.cards });
    }
  } else {
    console.warn('WARN: no DB connection (DATABASE_URL / SUPABASE_DB_PASSWORD) — diff vs current DB skipped.\n');
  }

  // 2) parse all specialty dirs
  let specDirs = fs.readdirSync(srcDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  if (onlySpec) specDirs = specDirs.filter((s) => s === onlySpec);
  specDirs.sort();

  const sqlBlocks = [];
  const acSqlBlocks = [];
  const acManifest = [];
  const report = [];
  let grandCards = 0, grandSubjects = 0;

  for (const spec of specDirs) {
    const dir = path.join(srcDir, spec);
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.txt'));
    const parsed = files.map((f) => parseFile(fs.readFileSync(path.join(dir, f), 'utf8'), f))
      .filter((p) => p.subject); // drop files with no subject header
    // collapse to subjects; flag duplicate subject keys within a specialty
    const byKey = new Map();
    const dupes = [];
    for (const p of parsed) {
      const k = normKey(p.subject);
      if (byKey.has(k)) dupes.push(p.subject);
      else byKey.set(k, p);
    }
    // subjects sorted alphabetically (pt locale) -> group_position
    const subjects = [...byKey.values()].sort((a, b) => a.subject.localeCompare(b.subject, 'pt', { sensitivity: 'base' }));
    const totalCards = subjects.reduce((n, s) => n + s.cards.length, 0);
    grandSubjects += subjects.length; grandCards += totalCards;

    const page = dbPages.get(spec);
    const fileIssues = parsed.flatMap((p) => p.issues.length ? [`${p.fileLabel}: ${p.issues.join('; ')}`] : []);

    // diff vs DB
    const driveKeys = new Set(subjects.map((s) => normKey(s.subject)));
    const dbList = dbGroups.get(spec) || [];
    const dbKeys = new Set(dbList.map((g) => normKey(g.label)));
    const added = subjects.filter((s) => !dbKeys.has(normKey(s.subject))).map((s) => s.subject);
    const removed = dbList.filter((g) => !driveKeys.has(normKey(g.label))).map((g) => g.label);
    const dbCardTotal = dbList.reduce((n, g) => n + g.cards, 0);
    // Surface likely-sloppy casing (all-lowercase labels) for human review — we do
    // NOT auto-title-case (would mangle acronyms like ACLS/HIV/DPOC).
    const lowercaseLabels = subjects.map((s) => s.subject)
      .filter((l) => /[a-zà-ÿ]/.test(l) && l === l.toLowerCase());
    // Cards outside the typical 20–32 band are worth a glance.
    const oddCounts = subjects.filter((s) => s.cards.length < 15 || s.cards.length > 40)
      .map((s) => `${s.subject} (${s.cards.length})`);

    report.push({ spec, page_id: page?.page_id ?? null, subjects: subjects.length, cards: totalCards,
      dbSubjects: dbList.length, dbCards: dbCardTotal, added, removed, dupes, fileIssues,
      lowercaseLabels, oddCounts,
      perSubject: subjects.map((s) => ({ subject: s.subject, cards: s.cards.length })) });

    // 3a) AudioCards: one lesson per subject on the matching -audiocards page.
    // body_html = the same Q/A as a read-along transcript; audio_url is left NULL
    // (set later by populate-audiocards-audio.js once the MP3s are on Bunny).
    const acPage = acPages.get(spec);
    if (acPage && totalCards > 0) {
      const acLines = [`-- ${spec} audiocards (page_id ${acPage}): ${subjects.length} subjects`];
      acLines.push(`DELETE FROM lessons WHERE page_id = ${acPage};`);
      const acVals = [];
      subjects.forEach((s, gi) => {
        const body = s.cards.map((c) =>
          `<p class="ac-q"><strong>Pergunta:</strong> ${htmlEsc(c.pergunta)}</p>` +
          `<p class="ac-a"><strong>Resposta:</strong> ${htmlEsc(c.resposta)}</p>`).join('');
        acVals.push(`(${acPage}, ${gi + 1}, ${sqlStr(s.subject)}, ${sqlStr(body)})`);
        acManifest.push({ specialty: spec, audiocards_page_id: acPage, position: gi + 1,
          subject: s.subject, drive_mp3: `${s.fileLabel.replace(/\.txt$/i, '')}-A.mp3`,
          bunny_path: `AudioCards-Audio/${spec}/${fileSlug(s.fileLabel)}-A.mp3` });
      });
      acLines.push(`INSERT INTO lessons (page_id, position, title, body_html) VALUES\n` + acVals.join(',\n') + ';');
      acSqlBlocks.push(acLines.join('\n'));
    }

    // 3) SQL — SAFETY GUARD: never wipe a deck to empty
    if (!page) { continue; }
    if (totalCards === 0) { continue; } // guarded; reported as warning below
    const lines = [`-- ${spec} (page_id ${page.page_id}): ${subjects.length} subjects, ${totalCards} cards`];
    lines.push(`DELETE FROM flashcard_items WHERE page_id = ${page.page_id};`);
    const values = [];
    subjects.forEach((s, gi) => {
      const gp = gi + 1;
      s.cards.forEach((c, ci) => {
        values.push(`(${page.page_id}, ${gp}, ${sqlStr(s.subject)}, ${ci + 1}, ${sqlStr(c.pergunta)}, ${sqlStr(c.resposta)})`);
      });
    });
    lines.push(
      `INSERT INTO flashcard_items (page_id, group_position, group_label, position, text, answer) VALUES\n` +
      values.join(',\n') + ';');
    sqlBlocks.push(lines.join('\n'));
  }

  if (db) await db.end();

  // 4) report
  console.log('================ FLASHCARD IMPORT — DRY RUN ================\n');
  for (const r of report) {
    console.log(`### ${r.spec}  (page_id ${r.page_id ?? 'MISSING!'})`);
    console.log(`   Drive: ${r.subjects} subjects / ${r.cards} cards   |   DB now: ${r.dbSubjects} subjects / ${r.dbCards} cards`);
    if (r.page_id == null) console.log('   ⚠️  NO matching <specialty>-flashcards page in DB — will be SKIPPED.');
    if (r.cards === 0) console.log('   ⚠️  ZERO parsed cards — DELETE SKIPPED (deck left untouched to avoid wiping it empty).');
    if (r.added.length) console.log(`   + NEW subjects (${r.added.length}): ${r.added.join(' · ')}`);
    if (r.removed.length) console.log(`   - DROPPED (in DB, not in Drive) (${r.removed.length}): ${r.removed.join(' · ')}`);
    if (r.dupes.length) console.log(`   ⚠️  DUPLICATE subject in Drive: ${r.dupes.join(' · ')}`);
    if (r.lowercaseLabels.length) console.log(`   ⚠️  lowercase label(s) (casing review): ${r.lowercaseLabels.join(' · ')}`);
    if (r.oddCounts.length) console.log(`   ⚠️  unusual card count: ${r.oddCounts.join(' · ')}`);
    if (r.fileIssues.length) { console.log('   ⚠️  PARSE ISSUES:'); r.fileIssues.forEach((x) => console.log(`        - ${x}`)); }
    console.log('');
  }
  console.log('------------------------------------------------------------');
  console.log(`TOTAL: ${grandSubjects} subjects / ${grandCards} cards across ${report.length} specialties.`);

  // 5) emit SQL
  if (!reportOnly) {
    const outDir = path.join(__dirname, '..', 'parsed');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'flashcards-import.sql');
    const header = `-- Flashcard full-replace import (Drive-authoritative). Generated by scripts/import-flashcards.js.\n` +
      `-- Apply with: node scripts/run-sql.js parsed/flashcards-import.sql  (wrapped in one transaction)\n` +
      `-- ${grandSubjects} subjects / ${grandCards} cards across ${sqlBlocks.length} decks.\n` +
      `-- NOTE: run parsed/flashcards-backup.sql FIRST (snapshots flashcard_items + review_schedule + attempts).\n\n`;
    // flashcard_attempts cascade-deletes with their cards; review_schedule has no FK,
    // so the new card ids orphan its flashcard rows — clean them in the same transaction.
    const footer = `\n\n-- Clean SM-2 review rows orphaned by the card-id churn (flashcard_attempts cascade automatically).\n` +
      `DELETE FROM review_schedule WHERE item_type = 'flashcard' AND item_id NOT IN (SELECT id FROM flashcard_items);\n`;
    fs.writeFileSync(outPath, header + sqlBlocks.join('\n\n') + footer, 'utf8');
    console.log(`\nSQL written: ${path.relative(path.join(__dirname, '..'), outPath)}  (${sqlBlocks.length} decks)`);

    // AudioCards transcript lessons (Q/A) for the -audiocards pages, plus the
    // subject -> MP3 mapping the upload + audio-url scripts consume.
    const acPath = path.join(outDir, 'audiocards-lessons.sql');
    const acHeader = `-- AudioCards transcript lessons (Q/A). Generated by scripts/import-flashcards.js.\n` +
      `-- Apply with: node scripts/run-sql.js parsed/audiocards-lessons.sql\n` +
      `-- audio_url is set separately by scripts/populate-audiocards-audio.js once MP3s are on Bunny.\n\n`;
    fs.writeFileSync(acPath, acHeader + acSqlBlocks.join('\n\n') + '\n', 'utf8');
    fs.writeFileSync(path.join(outDir, 'audiocards-manifest.json'), JSON.stringify(acManifest, null, 2), 'utf8');
    console.log(`AudioCards: ${acSqlBlocks.length} decks -> parsed/audiocards-lessons.sql; manifest ${acManifest.length} subjects -> parsed/audiocards-manifest.json`);
  } else {
    console.log('\n(--report-only: no SQL written)');
  }
}

main().catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1); });
