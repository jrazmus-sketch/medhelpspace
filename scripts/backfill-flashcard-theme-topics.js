'use strict';
// Backfill scripts/flashcard_theme_topics: link each flashcard theme (group_label,
// per specialty) to its exam `topics` row, so getWeightedRevalidaDeck can rank by a
// FK instead of fuzzy string-matching at query time.
//
// Matching is done ONCE here, offline and reviewable:
//   1. exact  — normalized(group_label) === normalized(topic.name)  [safe]
//   2. alias  — curated map below for known wording gaps (plurals, abbreviations,
//               rewordings). Add entries as content evolves.
//   3. fuzzy  — token-subset SUGGESTIONS only; NEVER auto-applied. Printed so a
//               human can promote a good one into ALIASES and re-run.
//
// Usage:
//   node scripts/backfill-flashcard-theme-topics.js            # dry run (prints plan)
//   node scripts/backfill-flashcard-theme-topics.js --apply    # upsert into the table
//   DATABASE_URL=<local> node scripts/backfill-flashcard-theme-topics.js --apply   # local
//
// Idempotent: upserts on (specialty_id, group_label). Re-run after a flashcard
// regeneration to pick up new/renamed themes.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function loadEnv() {
  let raw;
  try { raw = fs.readFileSync(path.join(ROOT, 'app', '.env.local'), 'utf8'); } catch { return; }
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
function connUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, pw = process.env.SUPABASE_DB_PASSWORD;
  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
  return `postgresql://postgres:${encodeURIComponent(pw)}@db.${ref}.supabase.co:5432/postgres`;
}
// EXACT copy of the app's normThemeName (keep in sync with lib/magnet/flashcards.ts)
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ── Curated alias map: specialtySlug -> { normalized(group_label): topic.name } ──
// Fill from the dry-run "UNMATCHED" + "fuzzy suggestion" output. Value is the exact
// topic name (we resolve it to a topic_id via normalized lookup).
const ALIASES = {
  // ── The 6 high-yield deck specialties (correctness-critical) ──────────────────
  'cirurgia-geral': {
    'cancer colorretal': 'Câncer de Colorretal',
    'hernia': 'Hérnias',
    'traumatismo cranioencefalico': 'TCE',
    'feridas cirurgicas e traumaticas': 'Feridas Cirúrgicas',
  },
  'obstetricia': {
    'diabetes gestacional': 'Diabetes da Gestação',
  },
  'pediatria': {
    'maus tratos violencia e prevencao de acidentes na infancia': 'Maus Tratos e Prevenções de Acidentes na Infância',
    'crescimento e desenvolvimento': 'Distúrbios do Crescimento e Desenvolvimento',
    'alimentacao complementar': 'Alimentação Complementar do Lactente',
    'desnutricao e obesidade': 'Desnutrição e Obesidade na Infância',
  },
  'saude-coletiva': {
    'etica medica e medicina legal': 'Ética Médica / Medicina Legal',   // inc 14 — SC's #2 topic
    'saude do trabalhador': 'Medicina do Trabalho',
  },
  'infectologia': {
    'hiv e aids': 'HIV',
  },
  // ── Completeness (not in the current deck plan, but keeps the map correct) ─────
  'gastroenterologia': {
    'ulcera peptica e helicobacter pylori': 'Úlcera Péptica e H. pylori',
  },
  'hematologia': {
    'disturbios da hemostasia primaria': 'Distúrbio da Hemostasia Primária',
    'disturbios da hemostasia secundaria': 'Distúrbio da Hemostasia Secundária',
  },
  'nefrologia': {
    'disturbios hidroeletroliticos nefrologicos': 'Distúrbios Hidroeletrolíticos',
  },
};

const FLASHCARDS_TRACK_ID = 3;

function tokenSet(s) { return new Set(norm(s).split(' ').filter((w) => w.length > 2)); }
// Conservative fuzzy: shorter token set fully contained in the longer, sharing >=1 token.
function fuzzySuggest(label, topics) {
  const lt = tokenSet(label);
  let best = null;
  for (const t of topics) {
    const tt = tokenSet(t.name);
    if (lt.size === 0 || tt.size === 0) continue;
    const [small, big] = lt.size <= tt.size ? [lt, tt] : [tt, lt];
    let shared = 0; for (const w of small) if (big.has(w)) shared++;
    const contained = shared === small.size && shared >= 1;
    const jaccard = shared / (lt.size + tt.size - shared);
    if (contained || jaccard >= 0.5) {
      if (!best || jaccard > best.jaccard) best = { topic: t, jaccard, shared };
    }
  }
  return best;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const postgres = require(path.join(ROOT, 'node_modules', 'postgres'));
  const db = postgres(connUrl(), { max: 1, connect_timeout: 15, idle_timeout: 0 });
  try {
    console.log(`Mode: ${apply ? 'APPLY (writing rows)' : 'DRY RUN (no writes)'} — ${connUrl().replace(/:[^:@]+@/, ':****@')}\n`);

    const specs = await db`SELECT id, slug, name FROM specialties ORDER BY display_order, id`;
    const topics = await db`SELECT id, specialty_id, name, incidence_count FROM topics WHERE specialty_id IS NOT NULL`;
    const pages = await db`
      SELECT id, specialty_id FROM pages
      WHERE track_id=${FLASHCARDS_TRACK_ID} AND status='publish' AND specialty_id IS NOT NULL ORDER BY id`;
    const groups = await db`
      SELECT p.specialty_id, fi.group_label, count(*)::int AS n
      FROM flashcard_items fi JOIN pages p ON p.id = fi.page_id
      WHERE p.track_id=${FLASHCARDS_TRACK_ID} AND p.status='publish' AND fi.group_label IS NOT NULL
      GROUP BY p.specialty_id, fi.group_label`;

    const slugById = new Map(specs.map((s) => [s.id, s.slug]));
    const nameById = new Map(specs.map((s) => [s.id, s.name]));
    const topicsBySpec = new Map();          // specId -> [topics]
    const topicByNorm = new Map();           // `${specId}::${norm(name)}` -> topic
    for (const t of topics) {
      if (!topicsBySpec.has(t.specialty_id)) topicsBySpec.set(t.specialty_id, []);
      topicsBySpec.get(t.specialty_id).push(t);
      topicByNorm.set(`${t.specialty_id}::${norm(t.name)}`, t);
    }
    const groupsBySpec = new Map();           // specId -> [{group_label, n}]
    for (const g of groups) {
      if (!groupsBySpec.has(g.specialty_id)) groupsBySpec.set(g.specialty_id, []);
      groupsBySpec.get(g.specialty_id).push(g);
    }

    const toWrite = [];   // { specialty_id, group_label, topic_id }
    let totalGroups = 0, totalMatched = 0, totalAlias = 0, totalUnmatched = 0;

    for (const s of specs) {
      const gl = groupsBySpec.get(s.id) ?? [];
      if (gl.length === 0) continue;
      const specTopics = topicsBySpec.get(s.id) ?? [];
      const lines = [];
      const unmatched = [];
      for (const g of gl.sort((a, b) => b.n - a.n)) {
        totalGroups++;
        const nl = norm(g.group_label);
        let topic = topicByNorm.get(`${s.id}::${nl}`);
        let method = 'exact';
        if (!topic) {
          const aliasTarget = ALIASES[s.slug]?.[nl];
          if (aliasTarget) { topic = topicByNorm.get(`${s.id}::${norm(aliasTarget)}`); method = 'alias'; }
        }
        if (topic) {
          if (method === 'alias') totalAlias++; else totalMatched++;
          toWrite.push({ specialty_id: s.id, group_label: g.group_label, topic_id: topic.id });
          lines.push(`   [${method.padEnd(5)} inc=${String(topic.incidence_count).padStart(2)}] "${g.group_label}" (${g.n}c) -> topic "${topic.name}"`);
        } else {
          totalUnmatched++;
          const sug = fuzzySuggest(g.group_label, specTopics);
          unmatched.push(`   [UNMATCHED] "${g.group_label}" (${g.n}c)` + (sug ? `  ~ fuzzy? "${sug.topic.name}" (inc=${sug.topic.incidence_count}, j=${sug.jaccard.toFixed(2)})` : '  (no fuzzy candidate)'));
        }
      }
      console.log(`\n■ ${nameById.get(s.id)} [${s.slug}] — ${gl.length} themes`);
      for (const l of lines) console.log(l);
      for (const u of unmatched) console.log(u);
    }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Groups: ${totalGroups} | exact ${totalMatched} | alias ${totalAlias} | UNMATCHED ${totalUnmatched}`);
    console.log(`Rows to write: ${toWrite.length}`);

    if (apply && toWrite.length) {
      let n = 0;
      for (const r of toWrite) {
        await db`
          INSERT INTO flashcard_theme_topics (specialty_id, group_label, topic_id)
          VALUES (${r.specialty_id}, ${r.group_label}, ${r.topic_id})
          ON CONFLICT (specialty_id, group_label) DO UPDATE SET topic_id = EXCLUDED.topic_id, updated_at = now()`;
        n++;
      }
      console.log(`\n✅ Upserted ${n} rows into flashcard_theme_topics.`);
    } else if (!apply) {
      console.log(`\n(dry run — re-run with --apply to write)`);
    }
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
