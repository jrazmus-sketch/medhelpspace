#!/usr/bin/env node
'use strict';

/**
 * Karina 2026-11-05 (thread "Substituição completa dos AudioCards…"), two follow-ups to
 * AudioCards v2 (scripts/import-audiocards-v2.js, 2026-11-04):
 *
 *  A) The five recordings that were missing. Each theme already lives on the platform
 *     text-only ("Áudio em preparação"); this attaches its MP3 and nothing else — only
 *     these five lessons change, so nobody's resume position elsewhere is cleared (a full
 *     re-run of the v2 importer would clear lesson_progress on every AudioCards page).
 *     Four transcripts came again with the SAME text. Insuficiência Cardíaca came
 *     REWRITTEN (same 30-card theme, new questions) and its recording reads the new text,
 *     so its transcript is replaced too.
 *
 *  B) "Sim, pode atualizar os flashcards de urologia" — the Urologia deck (Outros
 *     Flashcards) takes the 55-card file the Urologia AudioCard already uses. Cards 1–30 of
 *     that file ARE the 30 live cards, word for word (checked 2026-11-05), so this only
 *     ADDS cards 31–55: no card id changes, no review history moves or disappears.
 *
 * Usage:
 *   node scripts/apply-audiocards-missing-audio.js --new <11-05 folder> --old <11-04 folder with flashcards/>
 *        → parsed/audiocards-missing-audio-2026-11-05.sql + …-rollback.sql
 *   … --upload   → also PUT the five MP3s to Bunny (AudioCards-Audio/v2/<spec>/<slug>-A.mp3)
 * Apply with scripts/run-sql.js (prod, then local with DATABASE_URL). Both files are guarded:
 * they refuse to run against a database that is not in the expected state.
 */

const fs = require('fs');
const path = require('path');
const { parseTranscript, transcriptHtml, BUNNY_DIR, CDN } = require('./import-audiocards-v2.js');

// file slug in her delivery → the live lesson (page slug + title, from the v2 manifest).
const THEMES = [
  { file: 'insuficiencia-cardiaca', spec: 'cardiologia', page: 'cardiologia-audiocards', title: 'Insuficiência Cardíaca',
    oldDocx: 'clinica-medica/cardiologia/cardiologia__insuficiencia-cardiaca.md.docx', rewritten: true },
  { file: 'ulceras-genitais-ist', spec: 'infectologia', page: 'infectologia-audiocards', title: 'Úlceras Genitais e IST',
    oldDocx: 'clinica-medica/infectologia/ulceras-genitais-ist.md.docx' },
  { file: 'disturbios-hidroeletroliticos-nefrologicos', spec: 'nefrologia', page: 'nefrologia-audiocards',
    title: 'Distúrbios Hidroeletrolíticos Nefrológicos', oldDocx: 'clinica-medica/nefrologia/disturbios-hidroeletroliticos-nefrologicos.md.docx' },
  { file: 'fibromialgia', spec: 'reumatologia', page: 'reumatologia-audiocards', title: 'Fibromialgia',
    oldDocx: 'clinica-medica/reumatologia/fibromialgia.md.docx' },
  { file: 'obstetricia__puerperio', slug: 'puerperio', spec: 'obstetricia', page: 'obstetricia-audiocards', title: 'Puerpério',
    oldDocx: 'obstetricia/obstetricia__puerperio.md.docx' },
];

const URO = { page: 'outros-flashcards', label: 'Urologia', groupPosition: 3, live: 30, docx: 'outros/outros__urologia.md.docx' };

const arg = (k) => (process.argv.includes(k) ? path.resolve(process.argv[process.argv.indexOf(k) + 1]) : null);
const lit = (s, tag) => {
  if (s.includes(`$${tag}$`)) throw new Error(`text contains $${tag}$`);
  return `$${tag}$${s}$${tag}$`;
};

(async () => {
  for (const line of fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(); if (!(k in process.env)) process.env[k] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  const NEW = arg('--new'); let OLD = arg('--old');
  if (!NEW || !OLD) throw new Error('Pass --new <11-05 folder> --old <11-04 folder>');
  if (fs.existsSync(path.join(OLD, 'flashcards'))) OLD = path.join(OLD, 'flashcards');

  const apply = []; const rollback = [];
  for (const t of THEMES) {
    const mp3 = path.join(NEW, `${t.file}_A.mp3`);
    if (!fs.existsSync(mp3)) throw new Error(`missing ${mp3}`);
    t.bunny = `${BUNNY_DIR}/${t.spec}/${t.slug || t.file}-A.mp3`;
    t.url = `${CDN}/${t.bunny}`;
    const fresh = parseTranscript(path.join(NEW, `${t.file}.md.docx`));
    const prev = parseTranscript(path.join(OLD, t.oldDocx));
    for (const i of fresh.issues) console.warn(`  ! ${t.file}: ${i}`);
    const freshHtml = transcriptHtml(fresh.cards); const prevHtml = transcriptHtml(prev.cards);
    const changed = freshHtml !== prevHtml;
    if (changed !== Boolean(t.rewritten)) throw new Error(`${t.file}: transcript ${changed ? 'CHANGED' : 'unchanged'} — expected the opposite`);
    console.log(`${t.title}: ${fresh.cards.length} cards, transcript ${changed ? 'REWRITTEN' : 'same'} → ${t.bunny}`);
    const where = `FROM pages p WHERE l.page_id = p.id AND p.slug = '${t.page}' AND l.title = ${lit(t.title, 't')}`;
    apply.push(`  UPDATE lessons l SET audio_url = '${t.url}', audio_added_at = now(), updated_at = now()` +
      (changed ? `,\n         body_html = ${lit(freshHtml, 'h')}` : '') +
      `\n    ${where} AND l.audio_url IS NULL;\n  GET DIAGNOSTICS n = ROW_COUNT;\n` +
      `  IF n <> 1 THEN RAISE EXCEPTION '${t.page} / ${t.file}: % lessons without audio, expected 1', n; END IF;`);
    rollback.push(`  UPDATE lessons l SET audio_url = NULL, audio_added_at = NULL, updated_at = now()` +
      (changed ? `,\n         body_html = ${lit(prevHtml, 'h')}` : '') +
      `\n    ${where} AND l.audio_url = '${t.url}';\n  GET DIAGNOSTICS n = ROW_COUNT;\n` +
      `  IF n <> 1 THEN RAISE EXCEPTION '${t.page} / ${t.file}: % lessons to roll back, expected 1', n; END IF;`);
    t.mp3 = mp3;
  }

  // B) Urologia: cards 31–55 of the file. The guard re-checks the two ends of the overlap.
  const uro = parseTranscript(path.join(OLD, URO.docx));
  if (uro.issues.length) throw new Error(`urologia: ${uro.issues.join('; ')}`);
  if (uro.cards.length !== 55) throw new Error(`urologia: ${uro.cards.length} cards, expected 55`);
  const [q1] = uro.cards[0].blocks; const [q30] = uro.cards[URO.live - 1].blocks;
  const added = uro.cards.slice(URO.live).map((c, i) => {
    const [q, a] = c.blocks;
    return `(${URO.live + i + 1}, ${lit(q, 'q')}, ${lit(a, 'a')})`;
  });
  const uroWhere = `page_id = (SELECT id FROM pages WHERE slug = '${URO.page}') AND group_label = '${URO.label}'`;
  apply.push(`  IF (SELECT count(*) FROM flashcard_items WHERE ${uroWhere}) <> ${URO.live}
     OR NOT EXISTS (SELECT 1 FROM flashcard_items WHERE ${uroWhere} AND position = 1 AND text = ${lit(q1, 'q')})
     OR NOT EXISTS (SELECT 1 FROM flashcard_items WHERE ${uroWhere} AND position = ${URO.live} AND text = ${lit(q30, 'q')}) THEN
    RAISE EXCEPTION 'Urologia flashcards are not the expected ${URO.live}-card deck';
  END IF;
  INSERT INTO flashcard_items (page_id, group_position, group_label, position, text, answer)
  SELECT (SELECT id FROM pages WHERE slug = '${URO.page}'), ${URO.groupPosition}, '${URO.label}', v.pos, v.q, v.a
    FROM (VALUES
    ${added.join(',\n    ')}
    ) AS v(pos, q, a);
  IF (SELECT count(*) FROM flashcard_items WHERE ${uroWhere}) <> 55 THEN RAISE EXCEPTION 'Urologia is not 55 cards'; END IF;`);
  rollback.push(`  DELETE FROM flashcard_items WHERE ${uroWhere} AND position > ${URO.live};
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 25 THEN RAISE EXCEPTION 'removed % Urologia cards, expected 25', n; END IF;`);

  const head = (what) => `-- ${what} — generated by scripts/apply-audiocards-missing-audio.js (Karina 2026-11-05). Do not edit.
-- Apply: node scripts/run-sql.js <this file>   (prod, then local with DATABASE_URL)
DO $do$
DECLARE n int;
BEGIN
`;
  const out = path.join(__dirname, '..', 'parsed');
  fs.writeFileSync(path.join(out, 'audiocards-missing-audio-2026-11-05.sql'),
    head('AudioCards: 5 missing recordings (+ IC transcript) · Urologia flashcards 30 → 55') + apply.join('\n\n') + '\nEND $do$;\n', 'utf8');
  fs.writeFileSync(path.join(out, 'audiocards-missing-audio-2026-11-05-rollback.sql'),
    head('ROLLBACK of audiocards-missing-audio-2026-11-05.sql') + rollback.join('\n\n') + '\nEND $do$;\n', 'utf8');
  console.log(`Urologia: +${added.length} cards (31–55)\nWrote parsed/audiocards-missing-audio-2026-11-05{,-rollback}.sql`);

  if (process.argv.includes('--upload')) {
    const { BUNNY_STORAGE_HOSTNAME: HOST, BUNNY_STORAGE_ZONE: ZONE, BUNNY_API_KEY: KEY } = process.env;
    if (!HOST || !ZONE || !KEY) throw new Error('Missing BUNNY_STORAGE_HOSTNAME / BUNNY_STORAGE_ZONE / BUNNY_API_KEY');
    for (const t of THEMES) {
      const res = await fetch(`https://${HOST}/${ZONE}/${t.bunny}`, {
        method: 'PUT', headers: { AccessKey: KEY, 'Content-Type': 'application/octet-stream' }, body: fs.readFileSync(t.mp3),
      });
      if (!res.ok) throw new Error(`PUT ${t.bunny}: ${res.status} ${res.statusText}`);
      const head = await fetch(t.url, { method: 'HEAD' });
      const len = Number(head.headers.get('content-length'));
      if (!head.ok || len !== fs.statSync(t.mp3).size) throw new Error(`CDN ${t.url}: ${head.status}, ${len} bytes`);
      console.log(`  uploaded + served: ${t.url}`);
    }
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
