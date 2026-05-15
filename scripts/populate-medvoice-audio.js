#!/usr/bin/env node
'use strict';

/**
 * Populates lessons.audio_url for all MedVoice lessons using the Bunny CDN
 * file structure: MedVoice-Audio/{specialty-slug}-feito/{title-slug}-m.mp3
 *
 * Usage:
 *   node scripts/populate-medvoice-audio.js           # dry run (shows what would change)
 *   node scripts/populate-medvoice-audio.js --apply   # commit updates to DB
 */

const path = require('path');
const fs = require('fs');

// ── Env + connection ───────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', 'app', '.env.local');
  let raw;
  try { raw = fs.readFileSync(envPath, 'utf8'); }
  catch { return; }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

function buildConnectionUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set. Add it to app/.env.local');
  if (!password) throw new Error('SUPABASE_DB_PASSWORD is not set. Add it to app/.env.local');
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) throw new Error(`Cannot extract project ref from: ${supabaseUrl}`);
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${match[1]}.supabase.co:5432/postgres`;
}

// ── URL construction ───────────────────────────────────────────────────────────

const CDN_BASE = 'https://medhelpspace.b-cdn.net/MedVoice-Audio';

// Maps page slug → full subfolder path under CDN_BASE (no trailing slash).
// Original 7 specialties sit at the top level ({specialty}-feito/).
// The 10 newer specialties are nested under clinica-medica-feito/.
const PAGE_TO_SUBFOLDER = {
  // Top-level specialties (original structure)
  'cirurgia-geral-medvoice':         'cirurgia-geral-feito',
  'clinica-medica-medvoice':         'clinica-medica-feito',
  'ginecologia-medvoice':            'ginecologia-feito',
  'medicina-de-emergencia-medvoice': 'medicina-de-emergencia-feito',
  'emergencia-medvoice':             'medicina-de-emergencia-feito', // DB slug differs from Bunny folder
  'obstetricia-medvoice':            'obstetricia-feito',
  'pediatria-medvoice':              'pediatria-feito',
  'saude-coletiva-medvoice':         'saude-coletiva-feito',

  // Nested under clinica-medica-feito/ (Bunny folder structure)
  'cardiologia-medvoice':            'clinica-medica-feito/cardio-feito',
  'dermatologia-medvoice':           'clinica-medica-feito/dermato-feito',
  'endocrinologia-medvoice':         'clinica-medica-feito/endocrino-feito',
  'gastroenterologia-medvoice':      'clinica-medica-feito/gastro-feito',
  'hematologia-medvoice':            'clinica-medica-feito/hemato-feito',
  'infectologia-medvoice':           'clinica-medica-feito/infecto-feito',
  'nefrologia-medvoice':             'clinica-medica-feito/nefro-feito',
  'neurologia-medvoice':             'clinica-medica-feito/neuro-feito',
  'pneumologia-medvoice':            'clinica-medica-feito/pneumo-feito',
  'psiquiatria-medvoice':            'clinica-medica-feito/psiquiatria-feito',
  'reumatologia-medvoice':           'clinica-medica-feito/reumato-feito',
};

function slugify(title) {
  return title
    .normalize('NFD')                  // decompose accents: ã → a + combining tilde
    .replace(/[̀-ͯ]/g, '')   // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')     // remove remaining non-alphanumeric
    .trim()
    .replace(/\s+/g, '-')             // spaces → hyphens
    .replace(/-+/g, '-');             // collapse double hyphens
}

function buildUrl(subfolder, lessonTitle) {
  return `${CDN_BASE}/${subfolder}/${slugify(lessonTitle)}-m.mp3`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  loadEnvLocal();

  const apply = process.argv.includes('--apply');

  let postgres;
  try {
    postgres = require('postgres');
  } catch {
    console.error("Package 'postgres' not found.\n  Run: npm install  (from medhelpspace/)");
    process.exit(1);
  }

  const db = postgres(buildConnectionUrl(), { max: 1, connect_timeout: 15, idle_timeout: 0 });

  console.log('Querying MedVoice lessons...\n');

  const rows = await db`
    SELECT
      l.id          AS lesson_id,
      l.title       AS lesson_title,
      l.audio_url   AS current_audio_url,
      p.slug        AS page_slug
    FROM lessons l
    JOIN pages p ON l.page_id = p.id
    JOIN tracks t ON p.track_id = t.id
    WHERE t.slug = 'medvoice'
    ORDER BY p.slug, l.position
  `;

  console.log(`Found ${rows.length} MedVoice lessons.\n`);

  const updates = [];
  const skipped = [];

  for (const row of rows) {
    const folder = PAGE_TO_SUBFOLDER[row.page_slug];
    if (!folder) {
      skipped.push(row);
      continue;
    }

    const newUrl = buildUrl(folder, row.lesson_title);
    const already = row.current_audio_url === newUrl;

    if (!already) {
      updates.push({ id: row.lesson_id, url: newUrl });
    }

    const tag = already ? 'SAME  ' : 'UPDATE';
    console.log(`  ${tag}  [${row.page_slug}] ${row.lesson_title}`);
    if (!already) console.log(`         ${newUrl}`);
  }

  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length} lessons (no Bunny folder for this page):`);
    for (const r of skipped) {
      console.log(`  - lesson ${r.lesson_id}: "${r.lesson_title}" (page: ${r.page_slug})`);
    }
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`${updates.length} lessons to update, ${rows.length - updates.length - skipped.length} already correct, ${skipped.length} skipped.`);

  if (updates.length === 0) {
    console.log('Nothing to do.');
    await db.end();
    return;
  }

  if (!apply) {
    console.log('\nDry run — rerun with --apply to commit.');
    await db.end();
    return;
  }

  console.log('\nApplying...');
  for (const { id, url } of updates) {
    await db`UPDATE lessons SET audio_url = ${url} WHERE id = ${id}`;
  }
  console.log(`Done. ${updates.length} rows updated.`);

  await db.end();
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
