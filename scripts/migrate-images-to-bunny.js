#!/usr/bin/env node
'use strict';

/**
 * Migrates quiz_questions.media_url values from medhelpspace.com.br to Bunny CDN.
 *
 * Before running, add to app/.env.local:
 *   BUNNY_STORAGE_ZONE=your-storage-zone-name
 *   BUNNY_API_KEY=your-storage-zone-api-key
 *   BUNNY_STORAGE_ENDPOINT=https://storage.bunnycdn.com   (EU default; see note below)
 *
 * Region endpoints:
 *   EU (default) : https://storage.bunnycdn.com
 *   US East      : https://ny.storage.bunnycdn.com
 *   US West      : https://la.storage.bunnycdn.com
 *   Singapore    : https://sg.storage.bunnycdn.com
 *   UK           : https://uk.storage.bunnycdn.com
 *   Stockholm    : https://se.storage.bunnycdn.com
 *
 * Usage:
 *   node scripts/migrate-images-to-bunny.js           # dry run
 *   node scripts/migrate-images-to-bunny.js --apply   # upload + update DB
 */

const path = require('path');
const fs   = require('fs');

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
  const password    = process.env.SUPABASE_DB_PASSWORD;
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set. Add it to app/.env.local');
  if (!password)    throw new Error('SUPABASE_DB_PASSWORD is not set. Add it to app/.env.local');
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) throw new Error(`Cannot extract project ref from: ${supabaseUrl}`);
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${match[1]}.supabase.co:5432/postgres`;
}

// ── Bunny helpers ──────────────────────────────────────────────────────────────

const CDN_SERVE_BASE = 'https://medhelpspace.b-cdn.net';

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MedHelpSpace-ImageMigrator/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

async function uploadToBunny(storageZone, apiKey, endpoint, remotePath, buffer, contentType) {
  const url = `${endpoint.replace(/\/$/, '')}/${storageZone}/${remotePath}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'AccessKey': apiKey,
      'Content-Type': contentType || 'application/octet-stream',
    },
    body: buffer,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bunny upload failed (${res.status}): ${body}`);
  }
}

function buildRemotePath(specialtySlug, originalUrl) {
  const filename = path.basename(new URL(originalUrl).pathname);
  return `images/quizzes/${specialtySlug}/${filename}`;
}

function buildCdnUrl(remotePath) {
  return `${CDN_SERVE_BASE}/${remotePath}`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  loadEnvLocal();

  const apply           = process.argv.includes('--apply');
  const storageZone     = process.env.BUNNY_STORAGE_ZONE;
  const apiKey          = process.env.BUNNY_API_KEY;
  const storageEndpoint = process.env.BUNNY_STORAGE_ENDPOINT || 'https://storage.bunnycdn.com';

  if (apply && (!storageZone || !apiKey)) {
    console.error(
      '\nMissing Bunny CDN credentials. Add to app/.env.local:\n' +
      '  BUNNY_STORAGE_ZONE=your-storage-zone-name\n' +
      '  BUNNY_API_KEY=your-storage-zone-api-key\n' +
      '\nGet these from: Bunny Dashboard → Storage → {zone} → FTP & API Access\n',
    );
    process.exit(1);
  }

  let postgres;
  try {
    postgres = require('postgres');
  } catch {
    console.error("Package 'postgres' not found.\n  Run: npm install  (from medhelpspace/)");
    process.exit(1);
  }

  const db = postgres(buildConnectionUrl(), { max: 1, connect_timeout: 15, idle_timeout: 0 });

  console.log('Querying quiz images pointing to medhelpspace.com.br...\n');

  const rows = await db`
    SELECT
      qq.id                                     AS question_id,
      qq.media_url                              AS current_url,
      COALESCE(s.slug, 'uncategorized')         AS specialty_slug
    FROM quiz_questions qq
    JOIN  pages       p ON qq.page_id      = p.id
    LEFT JOIN specialties s ON p.specialty_id  = s.id
    WHERE qq.media_url LIKE '%medhelpspace.com.br%'
      AND qq.media_url IS NOT NULL
    ORDER BY qq.id
  `;

  if (rows.length === 0) {
    console.log('No images to migrate — all media_url values already point elsewhere.');
    await db.end();
    return;
  }

  console.log(`Found ${rows.length} image(s) to migrate.\n`);

  const results = { ok: [], skipped: [], failed: [] };

  for (const row of rows) {
    const remotePath = buildRemotePath(row.specialty_slug, row.current_url);
    const newUrl     = buildCdnUrl(remotePath);

    console.log(`  [${row.question_id}] ${row.current_url}`);
    console.log(`        → ${newUrl}`);

    if (!apply) {
      results.ok.push(row.question_id);
      continue;
    }

    try {
      const { buffer, contentType } = await downloadImage(row.current_url);
      await uploadToBunny(storageZone, apiKey, storageEndpoint, remotePath, buffer, contentType);
      await db`
        UPDATE quiz_questions
        SET media_url = ${newUrl}
        WHERE id = ${row.question_id}
      `;
      console.log(`        ✓ uploaded (${(buffer.length / 1024).toFixed(1)} KB)`);
      results.ok.push(row.question_id);
    } catch (err) {
      console.error(`        ✗ FAILED: ${err.message}`);
      results.failed.push({ id: row.question_id, err: err.message });
    }
  }

  console.log('\n─────────────────────────────────────────────────────────');

  if (!apply) {
    console.log(`Dry run complete. ${rows.length} image(s) would be migrated.`);
    console.log('Rerun with --apply to execute.\n');
  } else {
    console.log(`Done: ${results.ok.length} migrated, ${results.failed.length} failed.`);
    if (results.failed.length) {
      console.log('\nFailed IDs (retry manually):');
      for (const { id, err } of results.failed) {
        console.log(`  question ${id}: ${err}`);
      }
    }
  }

  await db.end();
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
