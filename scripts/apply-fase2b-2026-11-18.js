#!/usr/bin/env node
'use strict';
/**
 * Fase 2b (Karina 18/11/2026, 19h19): what apply-fase2-2026-11-18.js held, now authorized by her.
 * ONE transaction; every lookup is by deck + group name (ids differ between databases); nothing is deleted.
 *
 *   node scripts/apply-fase2b-2026-11-18.js --db <url> [--apply]     # a local / rehearsal database
 *   node scripts/apply-fase2b-2026-11-18.js --prod [--apply]         # production (app/.env.local DATABASE_URL)
 * Without --apply everything runs and is rolled back. Inputs (gitignored, her content): parsed/fase2b/delivery.json
 * and parsed/fase2b/audio-urls.json (recordings already on Bunny under AudioCards-Audio/v3).
 *
 * What it does:
 *   1. backups `*_bk_fase2b` (taken once);
 *   2. the nine themes that hold cards of the free deck of 50 Flashcards, Assistência Pré-Natal with the file and the
 *      recording of this e-mail, and Anemia Falciforme: cards written IN PLACE (same ids) with their recordings. Her
 *      rule for the free deck: THE SAME 50 cards, selection and order — `free_flashcard_deck` is not written at all;
 *      its 17 cards in these groups keep their ids and show the new text of cards 1 and 2;
 *   3. Anemia Falciforme: the definitive file has 29 cards (the platform had 30) — card 30 is MOVED to an archived
 *      group (same id, history kept, Revisão row suspended);
 *   4. Teste do Coraçãozinho: Triagem Neonatal card 7 takes "nas 24 horas seguintes" (her item 6); Cardiopatia
 *      Congênita card 9 was corrected by her on the platform (on a copy that predates her edit, the same text is
 *      written); both groups receive their new recordings.
 * Rollback: scripts/rollback-fase2b-2026-11-18.sql.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const postgres = require(path.join(ROOT, 'node_modules', 'postgres'));
const importer = require('./import-cards-single-source.js');

const has = (k) => process.argv.includes(k);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
let URL = arg('--db', null);
const PROD = has('--prod');
if (PROD) {
  for (const line of fs.readFileSync(path.join(ROOT, 'app', '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^DATABASE_URL=(.*)$/); if (m) URL = m[1].trim().replace(/^["']|["']$/g, '');
  }
}
if (!URL) { console.error('use --db <url> or --prod'); process.exit(2); }
const APPLY = has('--apply');
const local = /@(127\.0\.0\.1|localhost)[:/]/.test(URL);

/** The nine groups with cards of the free deck: [label, cards before]. */
const FREE_GROUPS = ['Perioperatório', 'Assistência Pré-Natal', 'Doenças Hepatobiliares', 'Anticoncepção', 'Ética Médica e Medicina Legal',
  'Assistência Clínica ao Parto', 'Diarreia e Desidratação', 'Sangramento Uterino Anormal', 'Hérnia'];
/** Cards each group has before this run — a different number means the base moved since the plan: stop. */
const EXPECT = {
  'Perioperatório': 30, 'Assistência Pré-Natal': 30, 'Doenças Hepatobiliares': 30, 'Anticoncepção': 30, 'Ética Médica e Medicina Legal': 30,
  'Assistência Clínica ao Parto': 30, 'Diarreia e Desidratação': 30, 'Sangramento Uterino Anormal': 20, 'Hérnia': 25, 'Anemia Falciforme': 30,
};
/** Recordings without a document: [deck, group, cards today, card of the Teste do Coraçãozinho]. */
const AUDIO_ONLY = [['pediatria-flashcards', 'Triagem Neonatal', 30, 7], ['pediatria-flashcards', 'Cardiopatia Congênita', 25, 9]];
const CORACAOZINHO = {
  'Triagem Neonatal': {
    before: 'Realizar avaliação cardiológica e ecocardiograma antes da alta, mantendo o recém-nascido em investigação.',
    after: 'Realizar avaliação cardiológica e ecocardiograma nas 24 horas seguintes, mantendo o recém-nascido em investigação.',
  },
  'Cardiopatia Congênita': {
    before: 'Realizar avaliação cardiológica e ecocardiograma antes da alta.',
    after: 'Realizar ecocardiograma nas 24 horas seguintes, com avaliação cardiológica.',
  },
};
const NOTE = 'Karina 18/11/2026 (Fase 2b)';
const ARCHIVE_LABEL = 'Anemia Falciforme — cartões retirados em 18/11/2026';
const clean = (s) => String(s ?? '').replace(/<\/p>\s*<p>/g, ' ').replace(/<\/?p>/g, '').trim();

(async () => {
  const delivery = JSON.parse(fs.readFileSync(path.join(ROOT, 'parsed', 'fase2b', 'delivery.json'), 'utf8'));
  const audio = JSON.parse(fs.readFileSync(path.join(ROOT, 'parsed', 'fase2b', 'audio-urls.json'), 'utf8'));
  const audioOf = new Map(audio.map((a) => [`${a.deck}|${a.label}`, a.audio_url]));
  const themes = delivery.themes.map((t) => ({ ...t, audio_url: audioOf.get(`${t.deck}|${t.label}`) || null }));
  if (themes.length !== 10 || themes.some((t) => !t.audio_url || !(t.label in EXPECT))) throw new Error(`expected the 10 themes with audio, got ${themes.length}`);

  const sql = postgres(URL, { max: 1, prepare: false, onnotice: () => {} });
  const out = { database: PROD ? 'production' : URL.replace(/.*@/, ''), applied: APPLY };
  try {
    await sql.begin(async (tx) => {
      const one = async (q) => (await q)[0];
      const group = async (deck, label) => {
        const rows = await tx`select g.*, d.slug deck, l.audio_url from flashcard_groups g join pages d on d.id = g.page_id
          left join lessons l on l.id = g.audiocard_lesson_id where d.slug = ${deck} and g.label = ${label}`;
        if (rows.length > 1) throw new Error(`group "${label}" found ${rows.length} times in ${deck}`);
        return rows[0] || null;
      };
      const cardsOf = async (gid) => Number((await one(tx`select count(*)::int n from flashcard_items where group_id = ${gid}`)).n);

      // ── guards ────────────────────────────────────────────────────────────────────────────────────────────
      const touched = [];
      for (const t of themes) {
        const g = await group(t.deck, t.label);
        if (!g || !g.audiocard_lesson_id) throw new Error(`group "${t.label}" not found in ${t.deck} (or without AudioCard)`);
        if (/\/AudioCards-Audio\/v3\//.test(g.audio_url || '')) throw new Error(`Fase 2b already applied here ("${t.label}" plays the new recording) - nothing changed`);
        const have = await cardsOf(g.id);
        if (have !== EXPECT[t.label]) throw new Error(`group "${t.label}" has ${have} cards, expected ${EXPECT[t.label]} - nothing changed`);
        touched.push(g.id);
      }
      for (const [deck, label, n] of AUDIO_ONLY) {
        const g = await group(deck, label);
        if (!g || !g.audiocard_lesson_id || (await cardsOf(g.id)) !== n) throw new Error(`group "${label}" is not as expected - nothing changed`);
        if (/\/AudioCards-Audio\/v3\//.test(g.audio_url || '')) throw new Error(`"${label}" already plays the new recording - nothing changed`);
        if (!audioOf.get(`${deck}|${label}`)) throw new Error(`no recording for "${label}"`);
        touched.push(g.id);
      }
      const freeIds = () => one(tx`select md5(string_agg(position || '|' || flashcard_item_id, '~' order by position)) h, count(*)::int n from free_flashcard_deck`);
      const freeRows = () => tx`select f.position, i.id, i.position card, i.text, i.answer, g.label
        from free_flashcard_deck f join flashcard_items i on i.id = f.flashcard_item_id join flashcard_groups g on g.id = i.group_id order by f.position`;
      const freeBefore = await freeIds();
      const freeRowsBefore = await freeRows();
      const untouched = (skip = touched) => one(tx`select md5(coalesce(string_agg(i.id || '|' || i.group_id || '|' || i.position || '|' || i.text || '|' || i.answer, '~' order by i.id), '')) h
        from flashcard_items i where i.group_id <> all(${skip})`);
      const untouchedAudio = () => one(tx`select md5(coalesce(string_agg(l.id || '|' || coalesce(l.audio_url, '') || '|' || md5(l.body_html), '~' order by l.id), '')) h
        from flashcard_groups g join lessons l on l.id = g.audiocard_lesson_id where g.id <> all(${touched})`);
      const untouchedBefore = (await untouched()).h, untouchedAudioBefore = (await untouchedAudio()).h;
      const totalBefore = await one(tx`select (select count(*)::int from flashcard_items) cards, (select count(*)::int from flashcard_groups) groups`);

      // ── 1. backups (once: a re-run keeps the ORIGINAL state) ─────────────────────────────────────────────
      for (const t of ['flashcard_items', 'flashcard_groups', 'topic_content', 'audiocard_recordings']) {
        await tx.unsafe(`create table if not exists ${t}_bk_fase2b as select * from ${t}`);
      }
      await tx.unsafe(`create table if not exists lessons_bk_fase2b as select l.* from lessons l where l.id in (select audiocard_lesson_id from flashcard_groups)`);
      await tx.unsafe(`create table if not exists review_schedule_bk_fase2b as select * from review_schedule where item_type = 'flashcard'`);
      for (const t of ['flashcard_items', 'flashcard_groups', 'topic_content', 'audiocard_recordings', 'lessons', 'review_schedule']) {
        await tx.unsafe(`alter table ${t}_bk_fase2b enable row level security`);
        await tx.unsafe(`revoke all on ${t}_bk_fase2b from public, anon, authenticated`);
      }

      // ── 3. Anemia Falciforme: the card the definitive file no longer has → archived group, same id ───────
      const anemia = await group('hematologia-flashcards', 'Anemia Falciforme');
      const keep = themes.find((t) => t.label === 'Anemia Falciforme').cards.length;
      const extra = await tx`select id, position from flashcard_items where group_id = ${anemia.id} and position > ${keep} order by position`;
      const ret = await one(tx`select id, status from pages where slug = 'retirados-hematologia-flashcards'`);
      if (!ret || ret.status !== 'draft') throw new Error('archive deck retirados-hematologia-flashcards not found (or published)');
      if (await one(tx`select 1 ok from free_flashcard_deck where flashcard_item_id = any(${extra.map((c) => c.id)})`)) throw new Error('a card of the free deck would be archived - nothing changed');
      const [ag] = await tx`insert into flashcard_groups (page_id, position, label)
        values (${ret.id}, (select coalesce(max(position), 0) + 1 from flashcard_groups where page_id = ${ret.id}), ${ARCHIVE_LABEL}) returning id`;
      let n = 0;
      for (const c of extra) {
        n++;
        await tx`insert into flashcard_group_moves (item_id, from_group_id, from_label, from_deck_id, from_position, to_group_id, to_label, to_deck_id, to_position, operation, reason)
          values (${c.id}, ${anemia.id}, 'Anemia Falciforme', ${anemia.page_id}, ${c.position}, ${ag.id}, ${ARCHIVE_LABEL}, ${ret.id}, ${n}, 'retire_group',
                  ${NOTE + ': cartão não consta do arquivo definitivo do tema; movido para um grupo de arquivo, preservado, fora da área publicada'})`;
        await tx`update flashcard_items set group_id = ${ag.id}, position = ${n} where id = ${c.id}`;
      }
      await tx`update review_schedule set suspended = true where item_type = 'flashcard' and not suspended and item_id = any(${extra.map((c) => c.id)})`;
      out.leftovers = [{ label: 'Anemia Falciforme', kept: keep, archived: extra.length, archive_group_id: String(ag.id) }];

      // ── 2. the cards, in place, with their recordings ────────────────────────────────────────────────────
      const run = { date: delivery.date, change_kind: delivery.change_kind, themes };
      const planned = await importer.plan(tx, run, {});
      const s = importer.summary(planned);
      if (s.conflitos || s.sobras || s.temas_novos) throw new Error(`unexpected plan: ${JSON.stringify(s)}`);
      out.backup_suffix = await importer.apply(tx, run, planned, {});
      out.cards = s;
      out.themes = planned.map((t) => ({
        deck: t.deck, label: t.label, group_id: String(t.group_id), lesson_id: String(t.lesson_id),
        iguais: t.ops.filter((o) => o.kind === 'igual').length, alterados: t.ops.filter((o) => o.kind === 'atualizar').length,
        inseridos: t.ops.filter((o) => o.kind === 'inserir').length, cartoes: t.ops.length, audio_url: t.audio_url,
      }));

      // ── 4. Teste do Coraçãozinho: the two cards, then the two recordings ─────────────────────────────────
      out.coracaozinho = []; out.audio_only = [];
      await tx`select set_config('app.change_source', 'import', true), set_config('app.change_kind', 'clinica', true)`;
      for (const [deck, label, , pos] of AUDIO_ONLY) {
        const g = await group(deck, label);
        const card = await one(tx`select id, answer from flashcard_items where group_id = ${g.id} and position = ${pos}`);
        const want = CORACAOZINHO[label];
        const cur = clean(card.answer);
        let action = 'já estava com o texto novo';
        if (cur === want.before) {
          // Cardiopatia Congênita was corrected by Karina on the platform: in production the old text here is an error.
          if (PROD && label === 'Cardiopatia Congênita') throw new Error('Cardiopatia Congênita card 9 still has the old text in production - nothing changed');
          await tx`update flashcard_items set answer = ${want.after} where id = ${card.id}`;
          action = 'atualizado';
        } else if (cur !== want.after) throw new Error(`"${label}" card ${pos} has an unexpected text: ${cur}`);
        out.coracaozinho.push({ label, card: pos, id: String(card.id), action, answer: want.after });
        const url = audioOf.get(`${deck}|${label}`);
        await tx`update lessons set audio_url = ${url}, audio_added_at = now() where id = ${g.audiocard_lesson_id}`;
        const cards = await tx`select position, text, answer from flashcard_items where group_id = ${g.id} order by position`;
        await tx`insert into audiocard_recordings (lesson_id, audio_url, recorded_cards, recorded_at, source)
          values (${g.audiocard_lesson_id}, ${url}, ${tx.json(cards.map((c) => ({ position: c.position, text: clean(c.text), answer: clean(c.answer) })))}, now(), 'import')`;
        out.audio_only.push({ label, group_id: String(g.id), lesson_id: String(g.audiocard_lesson_id), audio_url: url, cartoes: cards.length });
      }

      // ── checks ───────────────────────────────────────────────────────────────────────────────────────────
      const checks = [];
      const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail: String(detail) }); };
      const freeAfter = await freeIds();
      const freeRowsAfter = await freeRows();
      check('Baralho gratuito: os mesmos 50 cartões, na mesma ordem', freeAfter.h === freeBefore.h && freeAfter.n === 50, `${freeAfter.n} cartões`);
      const inFree = freeRowsAfter.filter((r) => FREE_GROUPS.includes(r.label));
      const byLabel = new Map(themes.map((t) => [t.label, t]));
      const freeText = inFree.every((r) => { const c = byLabel.get(r.label).cards[r.card - 1]; return r.card <= 2 && clean(r.text) === clean(c.q) && clean(r.answer) === clean(c.a); });
      check('Baralho gratuito: os 17 cartões dos nove temas mostram o texto definitivo (cartões 1 e 2)', inFree.length === 17 && freeText, `${inFree.length} cartões`);
      const same = (a, b) => a.position === b.position && String(a.id) === String(b.id) && a.text === b.text && a.answer === b.answer && a.label === b.label;
      const others = freeRowsAfter.filter((r) => !FREE_GROUPS.includes(r.label));
      check('Baralho gratuito: os outros 33 cartões sem nenhuma alteração', others.length === 33 && others.every((r) => same(r, freeRowsBefore.find((b) => b.position === r.position))), `${others.length} cartões`);
      out.free = freeRowsAfter.filter((r) => FREE_GROUPS.includes(r.label)).map((r) => {
        const b = freeRowsBefore.find((x) => x.position === r.position);
        return { free_pos: r.position, id: String(r.id), tema: r.label, card: r.card, antes: { q: clean(b.text), a: clean(b.answer) }, depois: { q: clean(r.text), a: clean(r.answer) } };
      });
      check('Demais grupos sem nenhuma alteração (cartões, transcrição e áudio)', (await untouched([...touched, ag.id])).h === untouchedBefore && (await untouchedAudio()).h === untouchedAudioBefore, 'todos os grupos fora desta entrega');
      const totalAfter = await one(tx`select (select count(*)::int from flashcard_items) cards, (select count(*)::int from flashcard_groups) groups`);
      check('Nenhum cartão apagado', totalAfter.cards === totalBefore.cards + s.inserir, `${totalBefore.cards} + ${s.inserir} inseridos = ${totalAfter.cards}`);
      check('Grupos: nenhum novo na área publicada; 1 de arquivo', totalAfter.groups === totalBefore.groups + 1, `${totalBefore.groups} → ${totalAfter.groups}`);
      const ids = [...planned.map((t) => t.group_id), ...out.audio_only.map((a) => a.group_id)];
      const sync = await tx`
        select g.label, (select count(*)::int from flashcard_items i where i.group_id = g.id) cards,
               (length(l.body_html) - length(replace(l.body_html, '<h3 class="ac-card">', ''))) / length('<h3 class="ac-card">') in_transcript,
               l.audio_url, l.title, lp.slug ac_page, lp.status ac_status,
               (select r.audio_url from audiocard_recordings r where r.lesson_id = l.id order by r.id desc limit 1) last_recording
          from flashcard_groups g join lessons l on l.id = g.audiocard_lesson_id join pages lp on lp.id = l.page_id where g.id = any(${ids})`;
      check('AudioCards: transcrição gerada com o mesmo número de cartões do grupo', sync.length === 12 && sync.every((r) => r.cards === Number(r.in_transcript)), sync.filter((r) => r.cards !== Number(r.in_transcript)).map((r) => r.label).join(', ') || `${sync.length} grupos`);
      check('AudioCards: todos apontam para a gravação nova (pasta v3) e têm o nome do grupo', sync.every((r) => /\/AudioCards-Audio\/v3\//.test(r.audio_url || '') && r.title === r.label), `${sync.length} grupos`);
      check('AudioCards atualizados estão em páginas publicadas', sync.every((r) => r.ac_status === 'publish'), [...new Set(sync.map((r) => r.ac_page))].length + ' páginas');
      check('Cada gravação nova registrada junto com o texto que narra', sync.every((r) => r.last_recording === r.audio_url), `${sync.length} de 12`);
      const cz = await tx`select g.label, i.position, i.answer from flashcard_items i join flashcard_groups g on g.id = i.group_id join pages d on d.id = g.page_id
        where d.slug = 'pediatria-flashcards' and ((g.label = 'Triagem Neonatal' and i.position = 7) or (g.label = 'Cardiopatia Congênita' and i.position = 9))`;
      check('Teste do Coraçãozinho: os dois cartões dizem "nas 24 horas seguintes"', cz.length === 2 && cz.every((r) => clean(r.answer) === CORACAOZINHO[r.label].after), cz.map((r) => `${r.label} cartão ${r.position}`).join('; '));
      const an = await one(tx`select (select count(*)::int from flashcard_items where group_id = ${anemia.id}) cards, (select count(*)::int from flashcard_items where group_id = ${ag.id}) archived,
        (select count(*)::int from topic_content c join topics t on t.id = c.topic_id where t.slug = 'anemia-falciforme' and c.resource_type = 'flashcards' and c.flashcard_group_id = ${anemia.id}) link`);
      check('Anemia Falciforme: 29 cartões no grupo, 1 arquivado, vínculo do Meu Plano mantido', an.cards === 29 && an.archived === 1 && an.link === 1, `${an.cards} cartões, ${an.archived} arquivado, ${an.link} vínculo`);
      const dead = await tx`select t.slug from topic_content c join topics t on t.id = c.topic_id left join flashcard_groups g on g.id = c.flashcard_group_id left join pages p on p.id = coalesce(g.page_id, c.page_id)
        where c.resource_type = 'flashcards' and (g.id is null or p.status <> 'publish')`;
      check('Meu Plano: nenhum vínculo de Flashcards abre grupo arquivado ou inexistente', dead.length === 0, dead.map((d) => d.slug).join(', ') || 'todos os vínculos abrem grupos publicados');
      const tc = await one(tx`select (select count(*)::int from topic_content) after, (select count(*)::int from topic_content_bk_fase2b) before,
        (select count(*)::int from topic_content c join topic_content_bk_fase2b b on b.id = c.id where row(c.*) is distinct from row(b.*)) changed`);
      check('Meu Plano: nenhum vínculo criado, alterado ou removido', tc.after === tc.before && tc.changed === 0, `${tc.before} → ${tc.after} vínculos`);
      const unsusp = await one(tx`select count(*)::int n from review_schedule rs join flashcard_items i on i.id = rs.item_id join flashcard_groups g on g.id = i.group_id join pages d on d.id = g.page_id
        where rs.item_type = 'flashcard' and not rs.suspended and d.status <> 'publish'`);
      check('Revisão: nenhum cartão arquivado continua sendo pedido', unsusp.n === 0, `${unsusp.n} linhas ativas em grupos arquivados`);
      const lost = await one(tx`select (select count(*)::int from review_schedule_bk_fase2b) before, (select count(*)::int from review_schedule where item_type = 'flashcard') after`);
      check('Revisão: nenhum histórico de Flashcards perdido', lost.after >= lost.before, `${lost.before} → ${lost.after} linhas`);
      const dup = await tx`select d.slug, g.label, count(*) from flashcard_groups g join pages d on d.id = g.page_id group by 1, 2 having count(*) > 1`;
      check('Nenhum grupo duplicado', dup.length === 0, dup.length);
      out.checks = checks;
      out.totals = { before: totalBefore, after: totalAfter };
      if (checks.some((c) => !c.ok)) throw new Error('CHECK FAILED: ' + checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`).join(' | '));
      if (!APPLY) { out.rolled_back = true; throw Object.assign(new Error('rollback'), { rehearsal: true }); }
    });
  } catch (e) {
    if (!e.rehearsal) { await sql.end(); console.error('FAILED - nothing changed:', e.message); process.exit(1); }
  }
  if (APPLY && local) await sql`notify pgrst, 'reload schema'`;
  await sql.end();
  const report = arg('--report', null);
  if (report) fs.writeFileSync(report, JSON.stringify(out, null, 1));
  console.log(`${out.database}: ${APPLY ? 'APPLIED' : 'rehearsed and rolled back'}`);
  console.log(JSON.stringify(out.cards), JSON.stringify(out.leftovers), 'coraçãozinho:', JSON.stringify(out.coracaozinho.map((c) => `${c.label}: ${c.action}`)), 'audio only:', out.audio_only.length);
  for (const c of out.checks) console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${c.name} (${c.detail})`);
})().catch((e) => { console.error(e); process.exit(1); });
