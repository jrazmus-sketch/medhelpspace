'use strict';
/**
 * import-flashcards-v3.js — replaces EVERY flashcard with Karina's 2026-09-22 rewrite.
 *
 *   node scripts/import-flashcards-v3.js            # DRY RUN — plan + checks, no writes (PROD via app/.env.local)
 *   node scripts/import-flashcards-v3.js --apply    # execute in ONE transaction
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/import-flashcards-v3.js --apply
 *
 * Input: parsed/flashcards-2026-09-22-parsed.json (scripts/parse-flashcards-docx.js).
 *
 * FULL REPLACE per deck, not a merge. Her set is a complete rewrite: not one of the 4,860
 * cards in a subject that carries over repeats an old card, so matching by position would
 * move a card's review state onto a different question. She confirmed (2026-09-22) that
 * replacing everything is fine because there are no students on the platform yet, and that
 * the old cards must go, not sit alongside the new ones.
 *
 * Labels: 61 of her files carry the subject as a slug ("doencas-bolhosas"). A slug is
 * resolved to the live label with the same normalised form, else to LABEL_OVERRIDES — the
 * six names she wrote out — else it is a validation problem, never a guess shown to a student.
 *
 * AudioCards are NOT touched. They read these same texts aloud, and she is re-recording;
 * until the new audio lands, their lessons keep the old wording deliberately.
 *
 * New card ids mean the flashcard review queue, attempts and progress no longer point at
 * anything: those rows are removed here (review_schedule.item_id has no FK), so nothing
 * dangles. `leads.fc_progress` (the free funnel) is only reported — a prospect mid-deck
 * simply starts the deck over.
 *
 * Backups <table>_bk_fc_20260922 are created ONCE, RLS on, revoked from anon/authenticated.
 * After applying, re-run scripts/backfill-flashcard-theme-topics.js: the magnet deck ranks
 * themes through that table, and it is keyed by label.
 */
const fs = require('fs');
const path = require('path');

const BK = '20260922';
const PARSED = path.join(__dirname, '..', 'parsed', 'flashcards-2026-09-22-parsed.json');
const FLASHCARDS_TRACK_ID = 3;

// The six subjects whose slug has no live label. Karina's spelling, 2026-09-22.
const LABEL_OVERRIDES = {
  'doencas-das-paratireoides': 'Doenças das Paratireoides',
  'coluna-vertebral-trauma-raquimedular': 'Coluna Vertebral e Trauma Raquimedular',
  'psiquiatria-infantil': 'Psiquiatria Infantil',
  oftalmologia: 'Oftalmologia',
  otorrinolaringologia: 'Otorrinolaringologia',
  urologia: 'Urologia',
};

function loadEnvLocal() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

const normKey = (s) => String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

(async () => {
  loadEnvLocal();
  const apply = process.argv.includes('--apply');
  const parsed = JSON.parse(fs.readFileSync(PARSED, 'utf8'));

  const postgres = require('postgres');
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL missing (app/.env.local or environment).'); process.exit(1); }
  const target = url.includes('127.0.0.1') ? 'LOCAL' : 'PROD';
  const db = postgres(url, { max: 1, prepare: false, ssl: target === 'LOCAL' ? false : 'require', onnotice: () => {} });

  try {
    // ── lookups (read-only) ──
    const decks = await db`
      SELECT p.id, p.slug, p.status, s.slug AS spec
      FROM pages p LEFT JOIN specialties s ON s.id = p.specialty_id
      WHERE p.track_id = ${FLASHCARDS_TRACK_ID} AND s.slug IS NOT NULL`;
    const deckBySpec = new Map(decks.map((d) => [d.spec, d]));
    const specId = Object.fromEntries((await db`SELECT id, slug FROM specialties`).map((s) => [s.slug, s.id]));
    const [hub] = await db`SELECT id FROM pages WHERE slug = 'flashcards' AND track_id = ${FLASHCARDS_TRACK_ID}`;
    const liveCards = await db`
      SELECT f.id, f.page_id, f.group_label, s.slug AS spec
      FROM flashcard_items f JOIN pages p ON p.id = f.page_id JOIN specialties s ON s.id = p.specialty_id
      WHERE p.track_id = ${FLASHCARDS_TRACK_ID}`;
    const liveLabelByKey = new Map();          // normalised label -> the label as shown today
    const liveCountByDeck = new Map();
    for (const c of liveCards) {
      if (c.group_label && !liveLabelByKey.has(normKey(c.group_label))) liveLabelByKey.set(normKey(c.group_label), c.group_label.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
      liveCountByDeck.set(c.spec, (liveCountByDeck.get(c.spec) || 0) + 1);
    }

    // ── plan ──
    const problems = []; const warnings = [];
    const bySpec = new Map();
    for (const s of parsed) {
      let label = String(s.subject || '').trim();
      let source = 'file';
      if (s.subjectIsSlug) {
        const key = normKey(label);
        if (LABEL_OVERRIDES[key]) { label = LABEL_OVERRIDES[key]; source = 'Karina'; }
        else if (liveLabelByKey.has(key)) { label = liveLabelByKey.get(key); source = 'live label'; }
        else { problems.push(`${s.spec}/${s.subject}: subject is a slug with no live label and no override — add it to LABEL_OVERRIDES`); continue; }
      }
      if (!label) { problems.push(`${s.spec}/${s.file}: empty subject`); continue; }
      if (!s.cards.length) { problems.push(`${s.spec}/${label}: 0 cards`); continue; }
      for (const c of s.cards) if (!c.q || !c.a) problems.push(`${s.spec}/${label} card ${c.n}: empty question or answer`);
      if (!bySpec.has(s.spec)) bySpec.set(s.spec, []);
      const deck = bySpec.get(s.spec);
      if (deck.some((x) => normKey(x.label) === normKey(label))) { problems.push(`${s.spec}: duplicate subject '${label}'`); continue; }
      deck.push({ label, source, cards: s.cards, file: s.file });
    }

    const plan = []; let newCards = 0;
    for (const [spec, subjects] of [...bySpec.entries()].sort()) {
      subjects.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
      subjects.forEach((x, i) => { x.groupPosition = i + 1; });
      const deck = deckBySpec.get(spec) || null;
      if (!deck && !specId[spec]) { problems.push(`${spec}: unknown specialty`); continue; }
      if (deck && deck.status !== 'publish') warnings.push(`${spec}: deck page ${deck.id} is '${deck.status}'`);
      newCards += subjects.reduce((n, x) => n + x.cards.length, 0);
      plan.push({ spec, deck, subjects });
    }
    for (const d of decks) if (!bySpec.has(d.spec)) problems.push(`${d.spec}: live deck with NO file in the delivery (would be emptied) — refusing`);

    const [{ n: fcReview }] = await db`SELECT count(*)::int n FROM review_schedule WHERE item_type = 'flashcard'`;
    const [{ n: fcAttempts }] = await db`SELECT count(*)::int n FROM flashcard_attempts`;
    const [{ n: fcProgress }] = await db`SELECT count(*)::int n FROM flashcard_progress`;
    const [{ n: leadsWithProgress }] = await db`SELECT count(*)::int n FROM leads WHERE fc_progress IS NOT NULL AND fc_progress::text NOT IN ('null', '{}', '[]')`;
    const [{ n: themeRows }] = await db`SELECT count(*)::int n FROM flashcard_theme_topics`;

    const relabelled = plan.flatMap((p) => p.subjects.filter((s) => s.source !== 'file').map((s) => `${p.spec}/${s.label} (${s.source})`));
    console.log(`\n=== import-flashcards-v3  [target: ${target}]  ${apply ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`  delivery: ${parsed.length} subjects / ${parsed.reduce((n, s) => n + s.cards.length, 0)} cards in ${bySpec.size} decks`);
    console.log(`  live now: ${liveCards.length} cards in ${decks.length} decks`);
    for (const p of plan) {
      const before = liveCountByDeck.get(p.spec) || 0;
      const after = p.subjects.reduce((n, x) => n + x.cards.length, 0);
      console.log(`    ${p.spec.padEnd(20)} ${String(before).padStart(4)} → ${String(after).padStart(4)} cards, ${String(p.subjects.length).padStart(2)} subjects${p.deck ? '' : '   (deck page will be CREATED)'}`);
    }
    console.log(`  → after apply: ${newCards} cards`);
    console.log(`  labels taken from the live deck or from Karina's list: ${relabelled.length}`);
    if (process.argv.includes('--verbose')) relabelled.forEach((r) => console.log(`      ${r}`));
    console.log(`  history removed (new ids): ${fcReview} review rows, ${fcAttempts} attempts, ${fcProgress} progress rows`);
    console.log(`  leads holding free-deck progress (they restart the deck): ${leadsWithProgress}`);
    console.log(`  flashcard_theme_topics rows: ${themeRows} — re-run scripts/backfill-flashcard-theme-topics.js after this`);
    console.log(`  AudioCards: untouched (Karina is re-recording)`);
    if (warnings.length) { console.log(`  ⚠ ${warnings.length} warning(s):`); warnings.forEach((w) => console.log(`    - ${w}`)); }
    if (problems.length) { console.log(`\n  ✗ ${problems.length} VALIDATION PROBLEM(S):`); problems.slice(0, 40).forEach((p) => console.log(`    - ${p}`)); process.exit(1); }
    console.log('  ✓ validation clean');
    if (!apply) { console.log('\n  DRY RUN — re-run with --apply to execute (add --verbose for the label list).'); return; }

    // ── apply (one transaction) ──
    const t0 = Date.now();
    const step = (m) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
    await db.begin(async (sql) => {
      const [{ ok }] = await sql`SELECT pg_try_advisory_xact_lock(hashtext('import-flashcards-v3')) AS ok`;
      if (!ok) throw new Error('another import-flashcards-v3 run is in progress — wait for it to finish');

      const scope = `SELECT id FROM pages WHERE track_id = ${FLASHCARDS_TRACK_ID}`;
      for (const [t, q] of [
        ['flashcard_items', `SELECT * FROM flashcard_items WHERE page_id IN (${scope})`],
        ['flashcard_attempts', `SELECT * FROM flashcard_attempts`],
        ['flashcard_progress', `SELECT * FROM flashcard_progress`],
        ['review_schedule', `SELECT * FROM review_schedule WHERE item_type = 'flashcard'`],
        ['flashcard_theme_topics', `SELECT * FROM flashcard_theme_topics`],
      ]) {
        const name = `${t}_bk_fc_${BK}`;
        const [{ exists }] = await sql`SELECT to_regclass(${'public.' + name}) IS NOT NULL AS exists`;
        if (exists) continue;
        await sql.unsafe(`CREATE TABLE ${name} AS ${q}`);
        await sql.unsafe(`ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY`);
        await sql.unsafe(`REVOKE ALL ON ${name} FROM anon, authenticated`);
      }
      step('backups ready');

      for (const p of plan) {
        let pageId = p.deck ? p.deck.id : null;
        if (!pageId) { // deck that exists in her set but not on this database
          const [{ max }] = await sql`SELECT COALESCE(MAX(id), 0)::int AS max FROM pages`;
          pageId = max + 1;
          await sql`INSERT INTO pages (id, slug, title, type, status, view, track_id, content_module_id, specialty_id, wp_created_at, wp_modified_at)
                    VALUES (${pageId}, ${`${p.spec}-flashcards`}, ${`${p.spec.replace(/(^|-)([a-z])/g, (m, a, b) => a.replace('-', ' ') + b.toUpperCase())} Flashcards`},
                            ${'h5p-quiz'}::page_type, 'publish', ${'quiz'}::page_view, ${FLASHCARDS_TRACK_ID}, ${null}, ${specId[p.spec]}, now(), now())`;
          if (hub) {
            const [{ m }] = await sql`SELECT COALESCE(MAX(position), 0)::int m FROM nav_items WHERE source_page_id = ${hub.id}`;
            await sql`INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
                      VALUES (${hub.id}, ${pageId}, ${m + 1}, ${p.subjects.length ? p.spec : p.spec}, 'cards')`;
          }
          step(`created deck page ${pageId} for ${p.spec}`);
        }
        await sql`DELETE FROM flashcard_items WHERE page_id = ${pageId}`;
        const rows = [];
        for (const s of p.subjects) for (const c of s.cards) {
          rows.push({ page_id: pageId, group_position: s.groupPosition, group_label: s.label, position: c.n, text: c.q, answer: c.a });
        }
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const r = await sql`
            INSERT INTO flashcard_items (page_id, group_position, group_label, position, text, answer)
            SELECT v.page_id, v.group_position, v.group_label, v.position, v.text, v.answer
            FROM jsonb_to_recordset(${sql.json(chunk)}::jsonb)
                 AS v(page_id bigint, group_position smallint, group_label text, position smallint, text text, answer text)`;
          if (r.count !== chunk.length) throw new Error(`${p.spec}: inserted ${r.count} of ${chunk.length}`);
        }
        step(`${p.spec}: ${rows.length} cards`);
      }

      // history that pointed at the old cards
      await sql`DELETE FROM review_schedule r WHERE r.item_type = 'flashcard'
                AND NOT EXISTS (SELECT 1 FROM flashcard_items f WHERE f.id = r.item_id)`;

      // invariants
      const empty = await sql`SELECT p.slug FROM pages p WHERE p.track_id = ${FLASHCARDS_TRACK_ID} AND p.specialty_id IS NOT NULL
                              AND NOT EXISTS (SELECT 1 FROM flashcard_items f WHERE f.page_id = p.id)`;
      if (empty.length) throw new Error(`deck(s) left with no cards: ${empty.map((e) => e.slug).join(', ')}`);
      const [{ n: total }] = await sql`SELECT count(*)::int n FROM flashcard_items f JOIN pages p ON p.id = f.page_id WHERE p.track_id = ${FLASHCARDS_TRACK_ID}`;
      if (total !== newCards) throw new Error(`${total} cards after the load, expected ${newCards}`);
      const [{ n: lessons }] = await sql`SELECT count(*)::int n FROM lessons l JOIN pages p ON p.id = l.page_id WHERE p.track_id = 2 AND l.updated_at = now()`;
      if (lessons) throw new Error('an AudioCards lesson was touched');
      step('invariants passed — committing');
    });

    const after = await db`
      SELECT s.slug AS spec, count(*)::int cards, count(DISTINCT f.group_label)::int subjects
      FROM flashcard_items f JOIN pages p ON p.id = f.page_id JOIN specialties s ON s.id = p.specialty_id
      WHERE p.track_id = ${FLASHCARDS_TRACK_ID} GROUP BY 1 ORDER BY 1`;
    console.log(`\n  ✓ APPLIED to ${target}: ${after.reduce((n, r) => n + r.cards, 0)} cards / ${after.reduce((n, r) => n + r.subjects, 0)} subjects / ${after.length} decks.`);
    console.log(`    backups: *_bk_fc_${BK} (RLS on, anon/authenticated revoked)`);
    console.log(`    NEXT: node scripts/backfill-flashcard-theme-topics.js --apply   (magnet deck ranks themes through it)`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
