#!/usr/bin/env node
'use strict';

/**
 * Set lessons.audio_url for AudioCards subjects whose MP3 is on Bunny.
 *
 * Lists AudioCards-Audio/ on the Bunny storage zone (source of truth for what's
 * actually uploaded), then for each subject in parsed/audiocards-manifest.json
 * whose bunny_path exists, sets the matching lesson's audio_url. Idempotent and
 * re-runnable (run it again after each upload / re-import).
 *
 * Dry-run by default; pass --apply to write. Targets prod (app/.env.local) unless
 * DATABASE_URL is set (e.g. the local mirror).
 *
 * Usage:
 *   node scripts/populate-audiocards-audio.js            # dry run
 *   node scripts/populate-audiocards-audio.js --apply
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'app', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('='); if (eq === -1) continue;
  const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  if (!(k in process.env)) process.env[k] = v;
}
const HOST = process.env.BUNNY_STORAGE_HOSTNAME;
const ZONE = process.env.BUNNY_STORAGE_ZONE;
const KEY = process.env.BUNNY_STORAGE_PASSWORD;
const CDN = (process.env.BUNNY_CDN_BASE || 'https://medhelpspace.b-cdn.net').replace(/\/$/, '');
if (!HOST || !ZONE || !KEY) { console.error('Missing BUNNY_STORAGE_* in app/.env.local'); process.exit(1); }

function dbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
  return `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`;
}

async function listBunny(relPath, out) {
  const url = `https://${HOST}/${ZONE}/${relPath}${relPath.endsWith('/') ? '' : '/'}`;
  let entries;
  try {
    const r = await fetch(url, { headers: { AccessKey: KEY, Accept: 'application/json' } });
    if (r.status === 404) return out;            // folder not created yet
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    entries = await r.json();
  } catch (e) { console.error(`  list ${relPath}: ${e.message}`); return out; }
  for (const e of entries) {
    const child = `${relPath}/${e.ObjectName}`.replace(/\/+/g, '/');
    if (e.IsDirectory) await listBunny(child, out);
    else out.add(child);
  }
  return out;
}

(async () => {
  const apply = process.argv.includes('--apply');
  const manifest = require(path.join(__dirname, '..', 'parsed', 'audiocards-manifest.json'));

  const onBunny = await listBunny('AudioCards-Audio', new Set());
  console.log(`Bunny has ${onBunny.size} file(s) under AudioCards-Audio/.`);

  const toSet = manifest.filter((m) => onBunny.has(m.bunny_path));
  const missing = manifest.filter((m) => !onBunny.has(m.bunny_path));
  console.log(`${toSet.length}/${manifest.length} subjects have audio on Bunny; ${missing.length} still missing.`);

  if (!apply) {
    console.log('\n(dry run) would set audio_url for, e.g.:');
    for (const m of toSet.slice(0, 5)) console.log(`  ${m.specialty} / ${m.subject} -> ${CDN}/${m.bunny_path}`);
    console.log('\nRun with --apply to write.');
    return;
  }

  const db = require('postgres')(dbUrl(), { max: 1, connect_timeout: 15 });
  let updated = 0;
  for (const m of toSet) {
    const audioUrl = `${CDN}/${m.bunny_path}`;
    const res = await db`UPDATE lessons SET audio_url = ${audioUrl}, audio_added_at = now()
                         WHERE page_id = ${m.audiocards_page_id} AND title = ${m.subject}`;
    updated += res.count;
  }
  await db.end();
  console.log(`Set audio_url on ${updated} lesson(s).`);
})().catch((e) => { console.error(e); process.exit(1); });
