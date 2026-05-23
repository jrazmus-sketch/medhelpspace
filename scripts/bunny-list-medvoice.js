#!/usr/bin/env node
'use strict';

// List every file under MedVoice-Audio/ in the Bunny storage zone and write
// the result to scripts/bunny-medvoice-listing.json. Recursive; one HTTP call
// per directory (Bunny's Storage API has no "list recursive" endpoint).

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'app', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  if (!(k in process.env)) process.env[k] = v;
}

const ZONE = process.env.BUNNY_STORAGE_ZONE;
const HOST = process.env.BUNNY_STORAGE_HOSTNAME;
const KEY = process.env.BUNNY_STORAGE_PASSWORD;

if (!ZONE || !HOST || !KEY) {
  console.error(
    'Missing BUNNY_STORAGE_ZONE / BUNNY_STORAGE_HOSTNAME / BUNNY_STORAGE_PASSWORD in app/.env.local',
  );
  process.exit(1);
}

async function listDir(relPath) {
  // Storage API: GET https://{host}/{zone}/{path}/ (trailing slash matters)
  const url = `https://${HOST}/${ZONE}/${relPath}${relPath.endsWith('/') ? '' : '/'}`;
  const r = await fetch(url, { headers: { AccessKey: KEY, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${relPath}: ${await r.text()}`);
  return r.json();
}

(async () => {
  const root = 'MedVoice-Audio';
  const allFiles = [];
  const queue = [root];
  let dirsWalked = 0;

  while (queue.length) {
    const dir = queue.shift();
    let entries;
    try {
      entries = await listDir(dir);
    } catch (e) {
      console.error(`  SKIP ${dir}: ${e.message}`);
      continue;
    }
    dirsWalked++;
    for (const e of entries) {
      const childPath = `${dir}/${e.ObjectName}`;
      if (e.IsDirectory) {
        queue.push(childPath);
      } else {
        allFiles.push({
          path: childPath,
          size: e.Length,
          lastChanged: e.LastChanged,
        });
      }
    }
    process.stdout.write(`\r  walked ${dirsWalked} dirs, ${allFiles.length} files`);
  }
  process.stdout.write('\n');

  const out = path.join(__dirname, 'bunny-medvoice-listing.json');
  fs.writeFileSync(out, JSON.stringify(allFiles, null, 2));
  console.log(`Wrote ${allFiles.length} files to ${out}`);

  // Quick summary by folder
  const byFolder = new Map();
  for (const f of allFiles) {
    const folder = f.path.split('/').slice(0, -1).join('/');
    byFolder.set(folder, (byFolder.get(folder) || 0) + 1);
  }
  console.log('\nFiles per folder:');
  for (const [folder, count] of [...byFolder.entries()].sort()) {
    console.log(`  ${count.toString().padStart(4)}  ${folder}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
