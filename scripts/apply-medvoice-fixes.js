#!/usr/bin/env node
'use strict';

// Reads scratch/fix-medvoice-audio-urls.sql, fetches the current audio_url for
// each target row (writes a rollback SQL file), then PATCHes each row via the
// Supabase REST API. The service-role key bypasses RLS.
//
// Exits non-zero if any row fails to update.

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sqlPath = path.join(__dirname, '..', 'scratch', 'fix-medvoice-audio-urls.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

// Parse UPDATE lessons SET audio_url = '...' WHERE id = N;
const re = /UPDATE\s+lessons\s+SET\s+audio_url\s*=\s*'([^']+)'\s+WHERE\s+id\s*=\s*(\d+)\s*;/gi;
const updates = [...sql.matchAll(re)].map((m) => ({ id: Number(m[2]), newUrl: m[1] }));
console.log(`Parsed ${updates.length} UPDATE statements`);

async function rest(method, p, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

(async () => {
  const ids = updates.map((u) => u.id);
  const current = await rest('GET', `lessons?select=id,audio_url&id=in.(${ids.join(',')})`);
  const currentById = new Map(current.map((c) => [c.id, c.audio_url]));

  const rollbackLines = updates.map((u) => {
    const old = currentById.get(u.id);
    return `UPDATE lessons SET audio_url = '${old.replace(/'/g, "''")}' WHERE id = ${u.id};`;
  });
  const rollbackPath = path.join(__dirname, '..', 'scratch', 'rollback-medvoice-audio-urls.sql');
  fs.writeFileSync(
    rollbackPath,
    `-- Rollback for fix-medvoice-audio-urls.sql\n-- Generated ${new Date().toISOString()}\n\nBEGIN;\n${rollbackLines.join('\n')}\n\nCOMMIT;\n`,
  );
  console.log(`Wrote rollback to ${rollbackPath}`);

  let ok = 0;
  const failed = [];
  for (const u of updates) {
    try {
      await rest('PATCH', `lessons?id=eq.${u.id}`, { audio_url: u.newUrl });
      ok++;
    } catch (e) {
      failed.push({ id: u.id, err: e.message });
    }
  }
  console.log(`\nApplied: ${ok} / ${updates.length}`);
  if (failed.length) {
    console.log('Failures:');
    for (const f of failed) console.log(`  id=${f.id}: ${f.err}`);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
