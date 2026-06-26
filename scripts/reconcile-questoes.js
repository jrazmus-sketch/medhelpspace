'use strict';
/**
 * reconcile-questoes.js — READ-ONLY. Diffs the parsed local Questões topics
 * (parsed/questoes-parsed.json) against the LIVE Questões section and produces a
 * reconciliation plan for human sign-off BEFORE any DB write.
 *
 * Live "Questões topic page" is strictly: view='quiz' AND type='h5p-quiz'
 *   AND track_id IS NULL (excludes Flashcards) AND content_module_id IS NULL
 *   (excludes Memorecards) AND status='publish'. Simulados are view='simulados'
 *   (already excluded by view).
 *
 * Buckets (per specialty):
 *   REFRESH  — exact/alias/normalized match  -> swap questions in place (keep page+nav)
 *   RENAME?  — strong fuzzy match            -> likely the same topic, slug changed
 *   NEW      — local topic with no live match -> create page + nav card
 *   RETIRE   — live topic with no local match -> archive + backup (Karina's list)
 *
 * Writes parsed/questoes-reconciliation.json and parsed/questoes-retire-list.txt.
 *   node scripts/reconcile-questoes.js
 */
const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
function connUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
  return `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`;
}

// ---- slug normalization for matching ----
const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'na', 'no', 'nos', 'nas', 'em', 'e', 'a', 'o', 'ao', 'aos', 'com', 'por', 'para']);
// Known non-trivial renames (local slug fragment -> canonical token) applied before tokenizing.
const ALIASES = [
  [/\bh-pylori\b/, 'helicobacter-pylori'],
  [/\btec\b/, 'traumatismo-cranioencefalico'],
  [/\btohchs\b/, 'torchs'],
  [/\bhiv\b/, 'hiv-aids'],
  [/faramacodermias/, 'farmacodermias'],
  [/medicina-do-trabalho/, 'saude-do-trabalhador'],
  [/gestacional/, 'gestacao'],
];
function applyAlias(slug) { let s = slug; for (const [re, to] of ALIASES) s = s.replace(re, to); return s; }
function tokenSet(slug) {
  return new Set(applyAlias(slug).split('-').filter((t) => t && !STOP.has(t)).map((t) => t.replace(/s$/, '')));
}
const normKey = (slug) => [...tokenSet(slug)].sort().join('-');
function jaccard(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 0;
}
function isSubset(a, b) { // is a's tokens ⊆ b's tokens (or vice-versa)
  const A = tokenSet(a), B = tokenSet(b);
  const sub = (x, y) => [...x].every((t) => y.has(t)) && x.size > 0;
  return sub(A, B) || sub(B, A);
}

(async () => {
  loadEnvLocal();
  const local = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parsed', 'questoes-parsed.json'), 'utf8'));
  const postgres = require('postgres');
  const db = postgres(connUrl(), { max: 1 });
  let live;
  try {
    live = await db`
      SELECT p.id, p.slug, p.title, s.slug AS spec,
             (SELECT count(*)::int FROM quiz_questions q WHERE q.page_id = p.id) AS qn
      FROM pages p JOIN specialties s ON s.id = p.specialty_id
      WHERE p.view = 'quiz' AND p.type = 'h5p-quiz'
        AND p.track_id IS NULL AND p.content_module_id IS NULL
        AND p.status = 'publish'`;
  } finally { await db.end(); }

  const localFlat = local.map((t) => ({ ...t, matched: false }));
  const liveFlat = live.map((r) => ({ ...r, used: false }));
  const liveBySpec = {};
  for (const r of liveFlat) (liveBySpec[r.spec] ||= []).push(r);

  const mkRec = (lt, m, kind) => ({
    spec: lt.spec, localSlug: lt.topicSlug, localTitle: lt.title, localQ: lt.questionCount,
    liveId: m.id, liveSlug: m.slug, liveTitle: m.title, liveQ: m.qn, liveSpec: m.spec, match: kind,
  });

  // Returns {live, kind} from candidates. allowFuzzy=false for the cross-specialty
  // pass (only exact/normalized are trustworthy across specialty boundaries).
  function tryMatch(lt, candidates, allowFuzzy) {
    let m = candidates.find((r) => !r.used && r.slug === lt.topicSlug);
    if (m) return { live: m, kind: 'exact' };
    m = candidates.find((r) => !r.used && normKey(r.slug) === normKey(lt.topicSlug));
    if (m) return { live: m, kind: 'normalized' };
    if (allowFuzzy) {
      const fz = candidates.filter((r) => !r.used && (isSubset(r.slug, lt.topicSlug) || jaccard(r.slug, lt.topicSlug) >= 0.5));
      if (fz.length === 1) return { live: fz[0], kind: 'fuzzy' };
    }
    return null;
  }

  const refresh = [], rename = [], moved = [], create = [];

  // Pass 0 — operator-approved manual renames (local topicSlug -> live slug).
  // These are real continuations the fuzzy matcher scored too low to auto-link.
  const MANUAL_RENAMES = {
    'coluna-vertebral-trauma-raquimedular': 'patologias-da-coluna-vertebral',
    'trauma-infeccoes-musculoesqueleticas': 'trauma-osteomielite',
  };
  for (const [localSlug, liveSlug] of Object.entries(MANUAL_RENAMES)) {
    const lt = localFlat.find((t) => t.topicSlug === localSlug && !t.matched);
    const lr = liveFlat.find((r) => r.slug === liveSlug && !r.used);
    if (lt && lr) { lr.used = true; lt.matched = true; rename.push(mkRec(lt, lr, 'manual')); }
  }

  // Pass 1 — within specialty (fuzzy allowed).
  for (const lt of localFlat) {
    const res = tryMatch(lt, liveBySpec[lt.spec] || [], true);
    if (res) { res.live.used = true; lt.matched = true; (res.kind === 'fuzzy' ? rename : refresh).push(mkRec(lt, res.live, res.kind)); }
  }
  // Pass 2 — cross specialty for still-unmatched local (exact/normalized only).
  for (const lt of localFlat) {
    if (lt.matched) continue;
    const res = tryMatch(lt, liveFlat, false);
    if (res) { res.live.used = true; lt.matched = true; moved.push(mkRec(lt, res.live, res.kind)); }
  }
  for (const lt of localFlat) if (!lt.matched) create.push({ spec: lt.spec, localSlug: lt.topicSlug, localTitle: lt.title, localQ: lt.questionCount });

  const retire = liveFlat.filter((r) => !r.used)
    .map((r) => ({ spec: r.spec, liveId: r.id, liveSlug: r.slug, liveTitle: r.title, liveQ: r.qn, hint: null }))
    .sort((a, b) => (a.spec + a.liveSlug).localeCompare(b.spec + b.liveSlug));
  // Hint: best remaining NEW candidate for each retire (helps spot hard renames).
  for (const r of retire) {
    let best = null, bestJ = 0;
    for (const c of create) { const j = jaccard(r.liveSlug, c.localSlug); if (j > bestJ) { bestJ = j; best = c; } }
    if (best && bestJ >= 0.3) r.hint = `maybe → NEW ${best.spec}/${best.localSlug} (j=${bestJ.toFixed(2)})`;
  }

  const out = {
    summary: {
      localTopics: local.length, liveTopics: live.length,
      refresh: refresh.length, rename: rename.length, moved: moved.length, create: create.length, retire: retire.length,
    },
    refresh, rename, moved, create, retire,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'parsed', 'questoes-reconciliation.json'), JSON.stringify(out, null, 2));

  // Karina handoff: the retire list (live topics with no equivalent in her new set)
  const retireTxt = ['TÓPICOS A APOSENTAR (sem equivalente no conjunto novo da Karina)',
    '— Estes tópicos estão hoje publicados em Questões mas NÃO têm correspondente nos arquivos novos.',
    '— Serão arquivados (com backup) a menos que a Karina confirme que devem permanecer ou enviar versão nova.', '',
    ...retire.map((r) => `  [${r.spec}] ${r.liveSlug}  (${r.liveQ} questões)  — "${r.liveTitle}"`)].join('\n');
  fs.writeFileSync(path.join(__dirname, '..', 'parsed', 'questoes-retire-list.txt'), retireTxt);

  // ---- console report ----
  const L = (n) => String(n).padStart(3);
  console.log(`\n=== Questões reconciliation (READ-ONLY, no DB writes) ===`);
  console.log(`  local topics: ${out.summary.localTopics}   live quiz topics (isolated): ${out.summary.liveTopics}`);
  console.log(`  REFRESH: ${L(out.summary.refresh)}   RENAME?: ${L(out.summary.rename)}   MOVED(spec): ${L(out.summary.moved)}   NEW: ${L(out.summary.create)}   RETIRE: ${L(out.summary.retire)}`);

  console.log(`\n--- RENAME? (in-specialty fuzzy — please verify these map correctly) ---`);
  for (const r of rename) console.log(`  [${r.spec}] ${r.localSlug}  (${r.localQ}q)  ==>  live "${r.liveSlug}" (${r.liveQ}q)`);

  console.log(`\n--- MOVED (same topic, specialty reclassified — refresh in place) ---`);
  for (const r of moved) console.log(`  [${r.liveSpec} → ${r.spec}] ${r.localSlug}  (${r.localQ}q)  ==> live "${r.liveSlug}" (${r.liveQ}q) [${r.match}]`);

  console.log(`\n--- NEW (no live equivalent — will be created + nav-linked) ---`);
  for (const r of create.sort((a, b) => (a.spec + a.localSlug).localeCompare(b.spec + b.localSlug))) console.log(`  + [${r.spec}] ${r.localSlug}  (${r.localQ}q)`);

  console.log(`\n--- RETIRE (live topics not in Karina's new set — backup + archive; Karina's list) ---`);
  for (const r of retire) console.log(`  - [${r.spec}] ${r.liveSlug}  (${r.liveQ}q)${r.hint ? '   ' + r.hint : ''}`);

  console.log(`\n  wrote parsed/questoes-reconciliation.json + parsed/questoes-retire-list.txt`);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
