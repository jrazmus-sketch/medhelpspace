#!/usr/bin/env node
'use strict';

/**
 * Upload AudioCards MP3s to Bunny storage, named/placed per parsed/audiocards-manifest.json.
 *
 * Why local files: the Drive connector returns file bytes as base64 into the assistant's
 * context — fine for small text, but the audio is ~1 GB total, so it can't be streamed
 * through the assistant. Download the Drive "Audiocards e Flashcards" folder locally
 * (a zip), unzip it, and point --dir at it. The walker finds the MP3s recursively and
 * matches them to subjects by filename, so the two-tier folder layout doesn't matter.
 *
 * Usage:
 *   node scripts/upload-audiocards-bunny.js --dir "C:/path/to/unzipped-folder" [--dry-run]
 *
 * Writes parsed/audiocards-uploaded.json (the bunny_paths uploaded) for the populate step.
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
// Writes need the read-WRITE storage key. In this project's .env.local that is
// BUNNY_API_KEY; BUNNY_STORAGE_PASSWORD is read-only (verified: PUT -> 401 vs 201).
const KEY = process.env.BUNNY_API_KEY || process.env.BUNNY_STORAGE_PASSWORD;
if (!HOST || !ZONE || !KEY) { console.error('Missing BUNNY_STORAGE_HOSTNAME / BUNNY_STORAGE_ZONE / BUNNY_API_KEY in app/.env.local'); process.exit(1); }

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dir = args.includes('--dir') ? path.resolve(args[args.indexOf('--dir') + 1]) : null;
if (!dir || !fs.existsSync(dir)) { console.error('Pass --dir <folder with the MP3s> (downloaded from Drive)'); process.exit(1); }

const manifest = require(path.join(__dirname, '..', 'parsed', 'audiocards-manifest.json'));
// Match on the "{spec}__{slug}" core, tolerating the audio-suffix separator
// (Karina's files use -A / .A / _A inconsistently before .mp3).
const audioCore = (fn) => path.basename(fn).toLowerCase().replace(/\.mp3$/, '').replace(/[-._ ]a$/, '');
const byCore = new Map(manifest.map((m) => [audioCore(m.drive_mp3), m]));

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.toLowerCase().endsWith('.mp3')) out.push(p);
  }
  return out;
}

(async () => {
  const localMp3s = walk(dir);
  const matched = [];
  const unmatchedLocal = [];
  const matchedCores = new Set();
  for (const f of localMp3s) {
    const m = byCore.get(audioCore(f));
    if (m) { matched.push({ file: f, m }); matchedCores.add(audioCore(f)); }
    else unmatchedLocal.push(path.basename(f));
  }
  const missing = manifest.filter((m) => !matchedCores.has(audioCore(m.drive_mp3)));

  console.log(`Local MP3s: ${localMp3s.length} | matched to subjects: ${matched.length} | unmatched local files: ${unmatchedLocal.length}`);
  if (missing.length) {
    console.log(`\n${missing.length} subjects have NO local MP3 yet (no audio until Karina records them):`);
    for (const m of missing) console.log(`  - ${m.specialty} / ${m.subject}`);
  }
  if (unmatchedLocal.length) {
    console.log(`\n${unmatchedLocal.length} local MP3s did not match any subject (name mismatch — check these):`);
    for (const n of unmatchedLocal.slice(0, 40)) console.log(`  ? ${n}`);
  }

  if (dryRun) { console.log('\n(--dry-run: nothing uploaded)'); return; }

  const uploaded = [];
  let fail = 0;
  for (const { file, m } of matched) {
    const url = `https://${HOST}/${ZONE}/${m.bunny_path}`;
    const body = fs.readFileSync(file);
    const r = await fetch(url, { method: 'PUT', headers: { AccessKey: KEY, 'Content-Type': 'application/octet-stream' }, body });
    if (r.ok) { uploaded.push(m.bunny_path); process.stdout.write('.'); }
    else { fail++; console.error(`\nFAIL ${m.bunny_path}: ${r.status} ${r.statusText}`); }
  }
  process.stdout.write('\n');
  fs.writeFileSync(path.join(__dirname, '..', 'parsed', 'audiocards-uploaded.json'), JSON.stringify(uploaded, null, 2));
  console.log(`Uploaded ${uploaded.length} files${fail ? `, ${fail} failed` : ''}. Wrote parsed/audiocards-uploaded.json`);
  console.log('Next: node scripts/populate-audiocards-audio.js --apply  (sets lessons.audio_url)');
})().catch((e) => { console.error(e); process.exit(1); });
