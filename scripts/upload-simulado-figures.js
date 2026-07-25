#!/usr/bin/env node
'use strict';

/**
 * Uploads the simulado-100 question figures to Bunny CDN.
 *
 * The free 100-question simulado (/simulado-revalida) is built from Karina's two
 * source PDFs. Seven questions carry an embedded figure (growth chart, chest X-ray,
 * ECG, skin lesions, epidemic-channel graph, retinography, mammography) that must be
 * hosted before the set can be imported — the enunciado is unanswerable without it.
 *
 * Figures are extracted from the PDF separately (see docs/simulado-100-import.md) and
 * dropped into a local folder as q008.png, q014.png, ... The remote path embeds the
 * set version so a future question-set swap cannot collide with these files.
 *
 * Usage:
 *   node scripts/upload-simulado-figures.js --dir <folder>            # dry run
 *   node scripts/upload-simulado-figures.js --dir <folder> --apply    # upload
 *
 * Writes figure-urls.json into <folder>, mapping question number -> CDN url, which
 * the importer reads.
 */

const fs = require('fs');
const path = require('path');

const SET_VERSION = 2;
const CDN_SERVE_BASE = 'https://medhelpspace.b-cdn.net';

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

const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

function remotePathFor(questionNumber, ext) {
  return `images/simulado-100/v${SET_VERSION}/q${String(questionNumber).padStart(3, '0')}${ext}`;
}

// NOTE: BUNNY_STORAGE_ENDPOINT in app/.env.local already includes the storage zone
// ("https://br.storage.bunnycdn.com/revalida"). Appending the zone unconditionally
// uploads to /revalida/revalida/... — the PUT succeeds but nothing serves from the
// pull zone. Only append when the endpoint doesn't already end with it.
function storageBase(endpoint, zone) {
  const base = endpoint.replace(/\/+$/, '');
  return base.endsWith(`/${zone}`) ? base : `${base}/${zone}`;
}

async function uploadToBunny(zone, apiKey, endpoint, remotePath, buffer, contentType) {
  const url = `${storageBase(endpoint, zone)}/${remotePath}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { AccessKey: apiKey, 'Content-Type': contentType },
    body: buffer,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bunny upload failed (${res.status}): ${body}`);
  }
}

async function main() {
  loadEnvLocal();

  const apply = process.argv.includes('--apply');
  const dirIdx = process.argv.indexOf('--dir');
  if (dirIdx === -1 || !process.argv[dirIdx + 1]) {
    console.error('Usage: node scripts/upload-simulado-figures.js --dir <folder> [--apply]');
    process.exit(1);
  }
  const dir = path.resolve(process.argv[dirIdx + 1]);

  const files = fs
    .readdirSync(dir)
    .filter((f) => /^q\d{3}\.(webp|png|jpe?g)$/.test(f))
    .sort();
  if (files.length === 0) {
    console.error(`No qNNN.{webp,png,jpg} files found in ${dir}`);
    process.exit(1);
  }

  const zone = process.env.BUNNY_STORAGE_ZONE;
  const apiKey = process.env.BUNNY_API_KEY;
  const endpoint = process.env.BUNNY_STORAGE_ENDPOINT || 'https://storage.bunnycdn.com';

  if (apply && (!zone || !apiKey)) {
    console.error(
      '\nMissing Bunny credentials. Add to app/.env.local:\n' +
        '  BUNNY_STORAGE_ZONE=...\n  BUNNY_API_KEY=...\n',
    );
    process.exit(1);
  }

  console.log(`${apply ? 'UPLOADING' : 'DRY RUN'} — ${files.length} figure(s) from ${dir}\n`);

  const map = {};
  for (const file of files) {
    const num = Number(file.slice(1, 4));
    const ext = path.extname(file).toLowerCase();
    const buffer = fs.readFileSync(path.join(dir, file));
    const remote = remotePathFor(num, ext);
    const cdnUrl = `${CDN_SERVE_BASE}/${remote}`;

    if (apply) {
      await uploadToBunny(zone, apiKey, endpoint, remote, buffer, MIME[ext] || 'application/octet-stream');
    }
    map[num] = cdnUrl;
    console.log(
      `  Q${String(num).padStart(3, ' ')}  ${(buffer.length / 1024).toFixed(0).padStart(5)} KB  ->  ${cdnUrl}`,
    );
  }

  const outPath = path.join(dir, 'figure-urls.json');
  fs.writeFileSync(outPath, JSON.stringify(map, null, 1), 'utf8');
  console.log(`\nWrote ${outPath}`);
  if (!apply) console.log('Dry run — nothing uploaded. Re-run with --apply.');
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
