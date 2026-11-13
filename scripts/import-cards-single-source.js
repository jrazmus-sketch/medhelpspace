#!/usr/bin/env node
'use strict';
/**
 * One import for Flashcards + AudioCards (single source, TEST ONLY — local database).
 *
 * A delivery is a list of themes, each with its cards (question + answer) and, optionally, a new audio.
 * The cards are written ONCE, into the Flashcards group; the AudioCard transcript is regenerated from
 * them by the database. Rules (Karina 2026-11-13):
 *   • a theme is found by its group (deck + name), never by the AudioCard title; a new theme creates the
 *     group AND its AudioCard;
 *   • a card is updated IN PLACE (same id: progress, attempts and Revisão are kept); a new position is
 *     inserted; the database refuses a second card at the same position (no duplicates);
 *   • an OLDER delivery never overwrites a NEWER text: when a card was changed on the platform after the
 *     delivery's date, the card is reported as a conflict and left as it is (unless --accept <Tema#N>);
 *   • cards that the delivery no longer has are only reported (removed only with --retire);
 *   • a new audio is recorded together with the text it narrates (audiocard_recordings), so the admin can
 *     tell when the text changes after the recording;
 *   • --apply runs in one transaction and first copies every card and AudioCard it may touch into backup
 *     tables (suffix = run time), so each run can be reverted.
 *
 *   node scripts/import-cards-single-source.js --delivery d.json [--apply] [--accept "Choque#25"] [--retire] [--kind editorial|clinica|nao_esclarecida] [--actor <uuid>]
 *   node scripts/import-cards-single-source.js --from-v2-sql parsed/audiocards-v2-import.sql --date 2026-11-04 --out d.json
 * Delivery JSON: { "date": "YYYY-MM-DD", "themes": [{ "deck": "emergencia-flashcards", "label": "Choque",
 *                   "cards": [{ "q": "…", "a": "…" }], "audio_url": "https://…" (optional) }] }
 */
const fs = require('fs');
const path = require('path');
const postgres = require(path.join(__dirname, '..', 'node_modules', 'postgres'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const all = (k) => process.argv.flatMap((a, i) => (a === k ? [process.argv[i + 1]] : []));
const has = (k) => process.argv.includes(k);

const clean = (s) => String(s ?? '').replace(/<\/p>\s*<p>/g, ' ').replace(/<\/?p>/g, '').trim();

/** Plan one delivery against the database (read only). */
async function plan(tx, delivery, { accept = [], retire = false } = {}) {
  const date = new Date(delivery.date + 'T23:59:59-03:00');
  const out = [];
  for (const th of delivery.themes) {
    const [g] = await tx`select g.id, g.page_id, g.position, g.audiocard_lesson_id, l.audio_url
      from flashcard_groups g join pages d on d.id = g.page_id left join lessons l on l.id = g.audiocard_lesson_id
      where d.slug = ${th.deck} and g.label = ${th.label}`;
    const cur = g ? await tx`select id, position, text, answer, updated_at from flashcard_items where group_id = ${g.id} order by position` : [];
    const byPos = new Map(cur.map((c) => [c.position, c]));
    const t = { deck: th.deck, label: th.label, group_id: g?.id ?? null, lesson_id: g?.audiocard_lesson_id ?? null,
      new_group: !g, audio_url: th.audio_url ?? null, ops: [] };
    th.cards.forEach((c, i) => {
      const pos = i + 1; const ex = byPos.get(pos);
      const q = clean(c.q), a = clean(c.a);
      if (!ex) return t.ops.push({ kind: 'inserir', pos, q, a });
      if (clean(ex.text) === q && clean(ex.answer) === a) return t.ops.push({ kind: 'igual', pos, id: ex.id });
      const key = `${th.label}#${pos}`;
      if (new Date(ex.updated_at) > date && !accept.includes(key)) {
        return t.ops.push({ kind: 'conflito', pos, id: ex.id, atual: { q: clean(ex.text), a: clean(ex.answer) }, entrega: { q, a },
          motivo: `cartão alterado na plataforma em ${new Date(ex.updated_at).toISOString().slice(0, 10)}, depois da entrega (${delivery.date})` });
      }
      t.ops.push({ kind: 'atualizar', pos, id: ex.id, antes: { q: clean(ex.text), a: clean(ex.answer) }, q, a });
    });
    for (const ex of cur) if (ex.position > th.cards.length) t.ops.push({ kind: retire ? 'retirar' : 'sobra', pos: ex.position, id: ex.id });
    out.push(t);
  }
  return out;
}

/**
 * Apply a plan inside the caller's transaction. Returns the backup suffix.
 * Every card change lands in flashcard_item_changes as source 'import'; its type is the delivery's
 * `change_kind` (or opts.kind), else 'nao_esclarecida' — the importer never decides it is only editorial.
 */
async function apply(tx, delivery, planned, opts = {}) {
  const kind = opts.kind || delivery.change_kind || 'nao_esclarecida';
  await tx`select set_config('app.change_source', 'import', true), set_config('app.change_kind', ${kind}, true),
                  set_config('app.actor_id', ${opts.actor || ''}, true)`;
  const suffix = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const groups = planned.map((t) => t.group_id).filter(Boolean);
  await tx.unsafe(`create table flashcard_items_bk_import_${suffix} as select * from flashcard_items where group_id = any($1)`, [groups]);
  await tx.unsafe(`create table lessons_bk_import_${suffix} as select l.* from lessons l join flashcard_groups g on g.audiocard_lesson_id = l.id where g.id = any($1)`, [groups]);
  // Supabase grants new tables to anon/authenticated by default: backups are service-role only.
  await tx.unsafe(`alter table flashcard_items_bk_import_${suffix} enable row level security`);
  await tx.unsafe(`alter table lessons_bk_import_${suffix} enable row level security`);
  for (const t of planned) {
    if (t.new_group) {
      const [deck] = await tx`select id, slug from pages where slug = ${t.deck}`;
      const [acp] = await tx`select id from pages where slug = ${deck.slug.replace(/-flashcards$/, '-audiocards')}`;
      const [{ n }] = await tx`select coalesce(max(position), 0) + 1 as n from flashcard_groups where page_id = ${deck.id}`;
      const [lesson] = await tx`insert into lessons (page_id, position, title, body_html)
        values (${acp.id}, (select coalesce(max(position), 0) + 1 from lessons where page_id = ${acp.id}), ${t.label}, '') returning id`;
      const [g] = await tx`insert into flashcard_groups (page_id, position, label, audiocard_lesson_id)
        values (${deck.id}, ${n}, ${t.label}, ${lesson.id}) returning id`;
      t.group_id = g.id; t.lesson_id = lesson.id;
    }
    for (const op of t.ops) {
      if (op.kind === 'inserir') await tx`insert into flashcard_items (group_id, position, text, answer) values (${t.group_id}, ${op.pos}, ${op.q}, ${op.a})`;
      if (op.kind === 'atualizar') await tx`update flashcard_items set text = ${op.q}, answer = ${op.a} where id = ${op.id}`;
      if (op.kind === 'retirar') await tx`delete from flashcard_items where id = ${op.id}`;
    }
    if (t.audio_url) {
      await tx`update lessons set audio_url = ${t.audio_url}, audio_added_at = now() where id = ${t.lesson_id}`;
      const cards = await tx`select position, text, answer from flashcard_items where group_id = ${t.group_id} order by position`;
      await tx`insert into audiocard_recordings (lesson_id, audio_url, recorded_cards, recorded_at, source)
        values (${t.lesson_id}, ${t.audio_url}, ${tx.json(cards.map((c) => ({ position: c.position, text: clean(c.text), answer: clean(c.answer) })))}, now(), 'import')`;
    }
  }
  return suffix;
}

function summary(planned) {
  const n = (k) => planned.reduce((s, t) => s + t.ops.filter((o) => o.kind === k).length, 0);
  return { temas: planned.length, temas_novos: planned.filter((t) => t.new_group).length, iguais: n('igual'), atualizar: n('atualizar'),
    inserir: n('inserir'), conflitos: n('conflito'), sobras: n('sobra'), retirar: n('retirar'), audios_novos: planned.filter((t) => t.audio_url).length };
}

/** 04/11 AudioCards import SQL → delivery JSON (the transcripts exactly as delivered). */
function fromV2Sql(file, date) {
  const src = fs.readFileSync(file, 'utf8');
  const themes = [];
  const re = /^\s*\('([a-z-]+)-audiocards', '((?:[^']|'')*)', (?:'(?:[^']|'')*'|NULL), \d+, '((?:[^']|'')*)'/gm;
  let m;
  while ((m = re.exec(src))) {
    const body = m[3].replace(/''/g, "'");
    const cards = [...body.matchAll(/<p class="ac-q">([^<]*)<\/p><p class="ac-a">([^<]*)<\/p>/g)].map((x) => ({ q: x[1], a: x[2] }));
    themes.push({ deck: `${m[1]}-flashcards`, label: m[2].replace(/''/g, "'"), cards });
  }
  return { date, themes };
}

module.exports = { plan, apply, summary, fromV2Sql };

if (require.main === module) {
  (async () => {
    if (has('--from-v2-sql')) {
      const d = fromV2Sql(arg('--from-v2-sql'), arg('--date', '2026-11-04'));
      fs.writeFileSync(arg('--out', 'delivery.json'), JSON.stringify(d, null, 1));
      console.log(`${d.themes.length} temas, ${d.themes.reduce((s, t) => s + t.cards.length, 0)} cartões → ${arg('--out', 'delivery.json')}`);
      return;
    }
    const URL = arg('--db', 'postgresql://postgres:postgres@127.0.0.1:55322/postgres');
    if (!/@(127\.0\.0\.1|localhost)[:/]/.test(URL)) { console.error('TEST build: local database only'); process.exit(2); }
    const sql = postgres(URL, { max: 1, onnotice: () => {} });
    const delivery = JSON.parse(fs.readFileSync(arg('--delivery'), 'utf8'));
    const opts = { accept: all('--accept'), retire: has('--retire') };
    await sql.begin(async (tx) => {
      const p = await plan(tx, delivery, opts);
      console.log(JSON.stringify(summary(p)));
      for (const t of p) for (const o of t.ops.filter((x) => x.kind === 'conflito'))
        console.log(`  CONFLITO ${t.label} #${o.pos}: ${o.motivo}\n     plataforma: ${o.atual.q} → ${o.atual.a}\n     entrega:    ${o.entrega.q} → ${o.entrega.a}`);
      if (has('--apply')) console.log('backup suffix', await apply(tx, delivery, p, { kind: arg('--kind'), actor: arg('--actor') }));
      else console.log('(simulação: nada gravado — use --apply)');
    });
    await sql.end();
  })().catch((e) => { console.error(e); process.exit(1); });
}
