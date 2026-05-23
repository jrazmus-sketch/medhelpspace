#!/usr/bin/env node
'use strict';

// Reads scripts/bunny-medvoice-listing.json (real Bunny files) and the
// broken-DB-row list (lessons with audio_url that 404), then proposes a
// replacement filename for each broken row using three strategies:
//   1. Exact match (already failed by definition — skipped)
//   2. Levenshtein distance ≤ threshold (handles typos like bradiarritmias↔bradiarrtimias)
//   3. Acronym candidate (handles sca-m.mp3 ← "Síndrome Coronariana Aguda")
//
// Output:
//   - SQL UPDATE statements for high-confidence matches → stdout + scratch/
//   - Table of unmatched rows for manual review
// No DB writes from this script — it only prints.

const fs = require('fs');
const path = require('path');

// ── env ────────────────────────────────────────────────────────────────────
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
const CDN_BASE = 'https://medhelpspace.b-cdn.net';

async function rest(p) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Levenshtein ────────────────────────────────────────────────────────────
function lev(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

// ── Helpers ────────────────────────────────────────────────────────────────
function dirOf(url) {
  // strip CDN_BASE prefix → "MedVoice-Audio/.../folder/file.mp3"
  const rel = url.replace(/^https?:\/\/[^/]+\//, '');
  const parts = rel.split('/');
  parts.pop();
  return parts.join('/');
}
function basenameOf(url) {
  return url.split('/').pop();
}

// Build acronym from a slug like "sindrome-coronariana-aguda" → "sca"
function acronymOf(slug) {
  return slug.split('-').filter(Boolean).map((w) => w[0]).join('');
}

// Strip the "-m.mp3" suffix to get the slug part, if present
function slugPart(basename) {
  return basename.replace(/-m\.mp3$/, '').replace(/\.mp3$/, '');
}

(async () => {
  // 1) Load real Bunny listing, group by folder
  const listing = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'bunny-medvoice-listing.json'), 'utf8'),
  );
  const byFolder = new Map();
  for (const f of listing) {
    if (!f.path.endsWith('.mp3')) continue; // ignore .docx and other non-audio
    const folder = f.path.split('/').slice(0, -1).join('/');
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(f.path.split('/').pop());
  }

  // 2) Fetch all lessons w/ audio_url, HEAD-check, find broken
  console.log('Fetching lessons + HEAD-checking URLs...');
  let lessons = [];
  let from = 0;
  for (;;) {
    const batch = await rest(
      `lessons?select=id,title,audio_url&audio_url=not.is.null&order=id.asc&limit=1000&offset=${from}`,
    );
    lessons = lessons.concat(batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  const broken = [];
  await Promise.all(
    lessons.map(async (l) => {
      try {
        const r = await fetch(l.audio_url, { method: 'HEAD' });
        if (r.status !== 200) broken.push({ ...l, status: r.status });
      } catch {
        broken.push({ ...l, status: 0 });
      }
    }),
  );
  console.log(`Broken: ${broken.length} of ${lessons.length}\n`);

  // 3) For each broken row, propose a match
  const proposals = [];
  for (const b of broken) {
    const folder = dirOf(b.audio_url);
    const expected = basenameOf(b.audio_url);
    const expectedSlug = slugPart(expected);
    const realFiles = byFolder.get(folder) || [];

    if (realFiles.length === 0) {
      proposals.push({ ...b, expected, folder, candidate: null, confidence: 'none', reason: 'folder missing on Bunny' });
      continue;
    }

    // Strategy A: Levenshtein on the full basename
    let best = null;
    for (const real of realFiles) {
      const d = lev(expected, real);
      if (best === null || d < best.d) best = { real, d };
    }

    // Strategy B: acronym match
    const acronym = acronymOf(expectedSlug);
    const acronymCandidate = acronym.length >= 2 ? realFiles.find((f) => slugPart(f) === acronym) : null;

    // Strategy C: substring (real slug is a long substring of expected, or vice versa)
    let substringCandidate = null;
    for (const real of realFiles) {
      const realSlug = slugPart(real);
      if (realSlug.length < 4) continue;
      if (expectedSlug.includes(realSlug) || realSlug.includes(expectedSlug)) {
        substringCandidate = real;
        break;
      }
    }

    // Pick best with confidence
    // - Lev ≤ 2: high (typos)
    // - Lev ≤ max(3, floor(len/6)): medium
    // - acronym exact match: high
    // - substring: medium
    let candidate = null;
    let confidence = 'none';
    let reason = '';

    const lenForThreshold = Math.max(expected.length, best?.real?.length || 0);
    const medThreshold = Math.max(3, Math.floor(lenForThreshold / 6));

    if (acronymCandidate) {
      candidate = acronymCandidate;
      confidence = 'high';
      reason = `acronym "${acronym}" of "${expectedSlug}"`;
    } else if (best && best.d <= 2) {
      candidate = best.real;
      confidence = 'high';
      reason = `lev=${best.d} typo`;
    } else if (best && best.d <= medThreshold) {
      candidate = best.real;
      confidence = 'medium';
      reason = `lev=${best.d} (threshold=${medThreshold})`;
    } else if (substringCandidate) {
      candidate = substringCandidate;
      confidence = 'medium';
      reason = 'substring overlap';
    } else if (best) {
      candidate = best.real;
      confidence = 'low';
      reason = `closest=lev=${best.d} (none of the strategies converged)`;
    }

    proposals.push({ ...b, expected, folder, candidate, confidence, reason, best });
  }

  // 4) Group + print
  const groups = { high: [], medium: [], low: [], none: [] };
  for (const p of proposals) groups[p.confidence].push(p);

  console.log(`Confidence breakdown: high=${groups.high.length}  medium=${groups.medium.length}  low=${groups.low.length}  none=${groups.none.length}\n`);

  function printGroup(label, items) {
    if (items.length === 0) return;
    console.log(`── ${label.toUpperCase()} (${items.length}) ──────────────────────────────`);
    for (const p of items) {
      console.log(`  id=${p.id}  "${p.title}"`);
      console.log(`    folder:   ${p.folder}`);
      console.log(`    expected: ${p.expected}`);
      console.log(`    candidate: ${p.candidate || '(none)'}  [${p.reason}]`);
    }
    console.log('');
  }
  printGroup('high', groups.high);
  printGroup('medium', groups.medium);
  printGroup('low', groups.low);
  printGroup('none', groups.none);

  // 5) Emit SQL for high+medium confidence matches
  // URL-encode each path segment so chars like ( ) : , in real filenames work.
  // The folder segments themselves are already URL-safe (kebab-case ASCII).
  const candidates = [...groups.high, ...groups.medium].filter((p) => p.candidate);
  console.log(`\nVerifying ${candidates.length} proposed URLs resolve (HEAD-check)...`);
  await Promise.all(
    candidates.map(async (p) => {
      const encodedFile = encodeURIComponent(p.candidate).replace(/'/g, "%27");
      p.newUrl = `${CDN_BASE}/${p.folder}/${encodedFile}`;
      try {
        const r = await fetch(p.newUrl, { method: 'HEAD' });
        p.verified = r.status === 200;
        p.verifyStatus = r.status;
      } catch (e) {
        p.verified = false;
        p.verifyStatus = `err: ${e.message}`;
      }
    }),
  );

  const verified = candidates.filter((p) => p.verified);
  const unverified = candidates.filter((p) => !p.verified);
  console.log(`  verified=${verified.length}  unverified=${unverified.length}`);
  if (unverified.length) {
    console.log('\nUNVERIFIED candidates (will NOT be in the SQL):');
    for (const p of unverified) {
      console.log(`  id=${p.id}  "${p.title}"  status=${p.verifyStatus}`);
      console.log(`    tried: ${p.newUrl}`);
    }
  }

  const updates = verified.map(
    (p) =>
      `UPDATE lessons SET audio_url = '${p.newUrl}' WHERE id = ${p.id}; -- ${p.confidence}: "${p.title.replace(/'/g, "''")}"`,
  );

  const scratchDir = path.join(__dirname, '..', 'scratch');
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
  const sqlPath = path.join(scratchDir, 'fix-medvoice-audio-urls.sql');
  const header = `-- Auto-generated by scripts/bunny-reconcile-medvoice.js
-- High + medium confidence reconciliations against real Bunny CDN files.
-- Review before applying. Low/none-confidence rows are NOT included here.

BEGIN;
`;
  fs.writeFileSync(sqlPath, header + updates.join('\n') + '\n\nCOMMIT;\n');
  console.log(`Wrote ${updates.length} UPDATE statements to ${sqlPath}`);

  // Manual-review list
  const reviewItems = [...groups.low, ...groups.none];
  if (reviewItems.length) {
    const reviewPath = path.join(scratchDir, 'medvoice-audio-needs-review.txt');
    const lines = reviewItems.map(
      (p) =>
        `id=${p.id}  "${p.title}"\n  folder:    ${p.folder}\n  expected:  ${p.expected}\n  closest:   ${p.candidate || '(none)'}  [${p.reason}]\n`,
    );
    fs.writeFileSync(reviewPath, lines.join('\n'));
    console.log(`Wrote ${reviewItems.length} items needing manual review to ${reviewPath}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
