#!/usr/bin/env node
'use strict';
/**
 * Behaviour tests for schema-patch-single-source-cards.sql (TEST ONLY).
 * Runs against LOCAL by default; every test runs inside a transaction that is ROLLED BACK, so the
 * database is left exactly as it was. Refuses any host that is not localhost.
 *   node scripts/test-single-source-cards.js [DATABASE_URL]
 */
const path = require('path');
const postgres = require(path.join(__dirname, '..', 'node_modules', 'postgres'));
const URL = process.argv[2] || 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(URL)) { console.error('refusing a non-local database'); process.exit(2); }
const sql = postgres(URL, { max: 1, onnotice: () => {} });

const results = [];
class Rollback extends Error {}
async function t(name, fn) {
  try {
    await sql.begin(async (tx) => { await fn(tx); throw new Rollback(); });
  } catch (e) {
    if (e instanceof Rollback) { results.push([true, name]); return; }
    results.push([false, name, e.message]);
  }
}
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

async function group(tx, label, deckSlug) {
  const [g] = await tx`select g.*, l.body_html, l.title as lesson_title, l.page_id as lesson_page
    from flashcard_groups g join pages d on d.id = g.page_id left join lessons l on l.id = g.audiocard_lesson_id
    where g.label = ${label} and d.slug = ${deckSlug}`;
  ok(g, `group ${deckSlug}/${label} not found`);
  return g;
}

(async () => {
  await t('every group has exactly one AudioCard and every transcript equals its generated version', async (tx) => {
    const [r] = await tx`select count(*)::int n, count(audiocard_lesson_id)::int linked,
      count(*) filter (where l.body_html is distinct from audiocard_transcript_html(g.id))::int diff
      from flashcard_groups g left join lessons l on l.id = g.audiocard_lesson_id`;
    eq(r.n, 194, 'groups'); eq(r.linked, 194, 'linked'); eq(r.diff, 0, 'transcripts differing from generator');
  });

  await t('editing a Flashcard regenerates its AudioCard transcript (same lesson id, same card id)', async (tx) => {
    const g = await group(tx, 'Choque', 'emergencia-flashcards');
    const [c] = await tx`select id from flashcard_items where group_id = ${g.id} and position = 25`;
    await tx`update flashcard_items set answer = ${'TEXTO DE TESTE'} where id = ${c.id}`;
    const [l] = await tx`select body_html from lessons where id = ${g.audiocard_lesson_id}`;
    ok(l.body_html.includes('<h3 class="ac-card">Card 25</h3><p class="ac-q">') && l.body_html.includes('<p class="ac-a">TEXTO DE TESTE</p>'), 'transcript not regenerated');
    const [s] = await tx`select status, changed_since_recording from audiocard_sync_status where group_id = ${g.id}`;
    eq(s.status, 'avaliacao_pendente', 'status'); eq(JSON.stringify(s.changed_since_recording), '[25]', 'changed cards');
  });

  await t('writing an AudioCard transcript directly is refused', async (tx) => {
    const g = await group(tx, 'Choque', 'emergencia-flashcards');
    let err = null;
    try { await tx`savepoint s`; await tx`update lessons set body_html = 'x' where id = ${g.audiocard_lesson_id}`; }
    catch (e) { err = e; await tx`rollback to savepoint s`; }
    ok(err && /audiocard_transcript_generated/.test(err.message), 'direct transcript edit was not refused');
    // audio_url and other fields stay editable
    await tx`update lessons set audio_url = audio_url where id = ${g.audiocard_lesson_id}`;
  });

  await t('a legacy insert (page_id + group_position + group_label) joins its group and shows in the AudioCard', async (tx) => {
    const g = await group(tx, 'Choque', 'emergencia-flashcards');
    await tx`insert into flashcard_items (page_id, group_position, group_label, position, text, answer)
             values (${g.page_id}, ${g.position}, ${g.label}, 31, 'Pergunta 31?', 'Resposta 31.')`;
    const [c] = await tx`select group_id from flashcard_items where page_id = ${g.page_id} and group_position = ${g.position} and position = 31`;
    eq(String(c.group_id), String(g.id), 'group_id');
    const [l] = await tx`select body_html from lessons where id = ${g.audiocard_lesson_id}`;
    ok(l.body_html.endsWith('<h3 class="ac-card">Card 31</h3><p class="ac-q">Pergunta 31?</p><p class="ac-a">Resposta 31.</p>'), 'new card missing from transcript');
  });

  await t('a second card at the same position of a group is refused (no duplicates on import)', async (tx) => {
    const g = await group(tx, 'Choque', 'emergencia-flashcards');
    let err = null;
    try { await tx`savepoint s`; await tx`insert into flashcard_items (group_id, position, text, answer) values (${g.id}, 1, 'dup', 'dup')`; }
    catch (e) { err = e; await tx`rollback to savepoint s`; }
    ok(err && /duplicate key/.test(err.message), 'duplicate was accepted');
  });

  await t('deleting a card removes it from the AudioCard and flags the recording', async (tx) => {
    const g = await group(tx, 'Tireotoxicose', 'endocrinologia-flashcards');
    await tx`delete from flashcard_items where group_id = ${g.id} and position = 30`;
    const [l] = await tx`select body_html from lessons where id = ${g.audiocard_lesson_id}`;
    ok(!l.body_html.includes('Card 30<'), 'card 30 still in transcript');
    const [s] = await tx`select status, changed_since_recording from audiocard_sync_status where group_id = ${g.id}`;
    eq(s.status, 'avaliacao_pendente', 'status'); eq(JSON.stringify(s.changed_since_recording), '[30]', 'changed');
  });

  await t('renaming a group renames its cards and its AudioCard', async (tx) => {
    const g = await group(tx, 'Tireotoxicose', 'endocrinologia-flashcards');
    await tx`update flashcard_groups set label = 'Tireotoxicose (teste)' where id = ${g.id}`;
    const [c] = await tx`select count(*)::int n from flashcard_items where group_id = ${g.id} and group_label = 'Tireotoxicose (teste)'`;
    eq(c.n, 30, 'cards relabelled');
    const [l] = await tx`select title from lessons where id = ${g.audiocard_lesson_id}`;
    eq(l.title, 'Tireotoxicose (teste)', 'AudioCard title');
  });

  await t('moving a group (proposal D: Trauma Raquimedular → Neurologia) keeps every id and history', async (tx) => {
    const g = await group(tx, 'Trauma Raquimedular', 'cirurgia-geral-flashcards');
    const ids = (await tx`select id from flashcard_items where group_id = ${g.id} order by position`).map((r) => String(r.id));
    const [u] = await tx`select id from auth.users limit 1`;
    ok(u, 'no local user to attach test history to');
    await tx`insert into flashcard_progress (user_id, flashcard_item_id) values (${u.id}, ${ids[0]}) on conflict do nothing`.catch(() => {});
    await tx`insert into review_schedule (user_id, item_type, item_id, specialty_id, due_date)
             values (${u.id}, 'flashcard', ${ids[0]}, 13, current_date)`;
    const [neuro] = await tx`select id, specialty_id from pages where slug = 'neurologia-flashcards'`;
    await tx`select move_flashcard_group(${g.id}, ${neuro.id}, 11::smallint)`;
    const after = await tx`select id, page_id, group_position, group_label from flashcard_items where group_id = ${g.id} order by position`;
    eq(after.map((r) => String(r.id)).join(), ids.join(), 'card ids changed');
    ok(after.every((r) => String(r.page_id) === String(neuro.id) && r.group_position === 11 && r.group_label === 'Trauma Raquimedular'), 'cards not in Neurologia/11');
    const [l] = await tx`select l.id, p.slug, l.position from lessons l join pages p on p.id = l.page_id where l.id = ${g.audiocard_lesson_id}`;
    eq(l.slug, 'neurologia-audiocards', 'AudioCard page'); eq(l.position, 11, 'AudioCard position');
    const cg = await tx`select position from flashcard_groups where page_id = ${g.page_id} order by position`;
    eq(cg.map((r) => r.position).join(), Array.from({ length: 22 }, (_, i) => i + 1).join(), 'Cirurgia Geral positions not closed');
    const [rs] = await tx`select specialty_id from review_schedule where item_type = 'flashcard' and item_id = ${ids[0]} and user_id = ${u.id}`;
    eq(String(rs.specialty_id), String(neuro.specialty_id), 'Revisão specialty');
    const [d] = await tx`select count(*)::int n from flashcard_groups g join lessons l on l.id = g.audiocard_lesson_id
      where l.body_html is distinct from audiocard_transcript_html(g.id)`;
    eq(d.n, 0, 'transcripts out of sync after move');
    const order = await tx`select g.position gp, l.position lp from flashcard_groups g join lessons l on l.id = g.audiocard_lesson_id
      where g.page_id in (${g.page_id}, ${neuro.id}) and g.position <> l.position`;
    eq(order.length, 0, 'AudioCards order differs from Flashcards order');
  });

  await t('the four-group proposal D runs end to end (Outros order by area)', async (tx) => {
    const deck = async (slug) => (await tx`select id from pages where slug = ${slug}`)[0].id;
    const [neuro, outros] = [await deck('neurologia-flashcards'), await deck('outros-flashcards')];
    const trm = await group(tx, 'Trauma Raquimedular', 'cirurgia-geral-flashcards');
    const time = await group(tx, 'Trauma e Infecções Musculoesqueléticas', 'cirurgia-geral-flashcards');
    const ai = await group(tx, 'Artrite Infecciosa', 'reumatologia-flashcards');
    await tx`select move_flashcard_group(${trm.id}, ${neuro}, 11::smallint)`;
    await tx`select move_flashcard_group(${ai.id}, ${outros}, 2::smallint)`;
    await tx`select move_flashcard_group(${time.id}, ${outros}, 3::smallint)`;
    const o = await tx`select g.label, l.title from flashcard_groups g join lessons l on l.id = g.audiocard_lesson_id where g.page_id = ${outros} order by g.position`;
    eq(o.map((r) => r.label).join(' | '), 'Oftalmologia | Artrite Infecciosa | Trauma e Infecções Musculoesqueléticas | Otorrinolaringologia | Urologia', 'Outros order');
    const ac = await tx`select l.title from lessons l join pages p on p.id = l.page_id where p.slug = 'outros-audiocards' order by l.position`;
    eq(ac.map((r) => r.title).join(' | '), o.map((r) => r.label).join(' | '), 'Outros AudioCards order');
    const [n] = await tx`select count(*)::int n from flashcard_items`;
    eq(n.n, 5385, 'card count changed');
  });


  const imp = require('./import-cards-single-source.js');
  const choqueDelivery = async (tx, date, extra = {}) => {
    const g = await group(tx, 'Choque', 'emergencia-flashcards');
    const cards = (await tx`select text, answer from flashcard_items where group_id = ${g.id} order by position`).map((c) => ({ q: c.text, a: c.answer }));
    cards[24] = { q: cards[24].q, a: 'Tamponamento pré-peritoneal ou angioembolização (texto novo de teste).' };
    cards.push({ q: 'Pergunta nova 31?', a: 'Resposta nova 31.' });
    return { g, d: { date, themes: [{ deck: 'emergencia-flashcards', label: 'Choque', cards, ...extra }] } };
  };

  await t('import: a newer delivery updates in place, adds the new card, records the new audio; a second run changes nothing', async (tx) => {
    const { g, d } = await choqueDelivery(tx, '2026-12-01', { audio_url: 'https://example.invalid/choque-v3.mp3' });
    const [before] = await tx`select id from flashcard_items where group_id = ${g.id} and position = 25`;
    const p = await imp.plan(tx, d); const s = imp.summary(p);
    eq(s.atualizar, 1, 'updates'); eq(s.inserir, 1, 'inserts'); eq(s.conflitos, 0, 'conflicts'); eq(s.iguais, 29, 'unchanged');
    await imp.apply(tx, d, p);
    const [after] = await tx`select id, answer from flashcard_items where group_id = ${g.id} and position = 25`;
    eq(String(after.id), String(before.id), 'card id changed'); ok(/texto novo de teste/.test(after.answer), 'not updated');
    const [l] = await tx`select body_html, audio_url from lessons where id = ${g.audiocard_lesson_id}`;
    ok(l.body_html.includes('texto novo de teste') && l.body_html.includes('Pergunta nova 31?'), 'AudioCard not regenerated');
    eq(l.audio_url, 'https://example.invalid/choque-v3.mp3', 'audio');
    const [st] = await tx`select status from audiocard_sync_status where group_id = ${g.id}`;
    eq(st.status, 'em_dia', 'status after import with new audio');
    const s2 = imp.summary(await imp.plan(tx, d));
    eq(s2.atualizar + s2.inserir + s2.conflitos, 0, 'second run is not a no-op');
    const [{ n }] = await tx`select count(*)::int n from flashcard_items where group_id = ${g.id}`;
    eq(n, 31, 'duplicates created');
  });

  await t('import: new text without a new audio flags the AudioCard for re-recording', async (tx) => {
    const { g, d } = await choqueDelivery(tx, '2026-12-01');
    await imp.apply(tx, d, await imp.plan(tx, d));
    const [st] = await tx`select status, changed_since_recording from audiocard_sync_status where group_id = ${g.id}`;
    eq(st.status, 'avaliacao_pendente', 'status'); eq(JSON.stringify(st.changed_since_recording), '[25,31]', 'changed cards');
  });

  await t('import: a card edited on the platform after the delivery date is a conflict and is left untouched', async (tx) => {
    // the delivery was prepared before today; the card is edited on the platform now (after it)
    // Two days back: the importer reads the delivery date in Brasília time (end of day -03:00), so a UTC
    // "yesterday" is still the delivery day between 21:00 and 24:00 BRT and the test flipped by clock.
    const before = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
    const { g, d } = await choqueDelivery(tx, before);
    await tx`update flashcard_items set answer = 'Editado na plataforma.' where group_id = ${g.id} and position = 25`;
    const p = await imp.plan(tx, d); eq(imp.summary(p).conflitos, 1, 'conflicts');
    await imp.apply(tx, d, p);
    const [c] = await tx`select answer from flashcard_items where group_id = ${g.id} and position = 25`;
    eq(c.answer, 'Editado na plataforma.', 'platform edit overwritten');
  });

  await t('import: a new theme creates its Flashcards group and its AudioCard together', async (tx) => {
    const d = { date: '2026-12-01', themes: [{ deck: 'emergencia-flashcards', label: 'Tema Novo de Teste', cards: [{ q: 'P1?', a: 'R1.' }, { q: 'P2?', a: 'R2.' }] }] };
    const p = await imp.plan(tx, d); eq(imp.summary(p).temas_novos, 1, 'new themes');
    await imp.apply(tx, d, p);
    const g = await group(tx, 'Tema Novo de Teste', 'emergencia-flashcards');
    ok(g.lesson_title === 'Tema Novo de Teste', 'AudioCard missing');
    eq(g.body_html, '<h3 class="ac-card">Card 1</h3><p class="ac-q">P1?</p><p class="ac-a">R1.</p><h3 class="ac-card">Card 2</h3><p class="ac-q">P2?</p><p class="ac-a">R2.</p>', 'transcript');
  });

  // ── Part 2: change log + Karina's three tiers (schema-patch-single-source-change-log.sql) ──────────
  const actorOf = async (tx) => (await tx`select id from auth.users order by created_at limit 1`)[0].id;
  const st = async (tx, g) => (await tx`select status, audio_suspended, changes, changed_since_recording from audiocard_sync_status where group_id = ${g.id}`)[0];
  const choque = async (tx) => {
    const g = await group(tx, 'Choque', 'emergencia-flashcards');
    const [c] = await tx`select id, text, answer from flashcard_items where group_id = ${g.id} and position = 25`;
    const [s0] = await tx`select status from audiocard_sync_status where group_id = ${g.id}`;
    eq(s0.status, 'em_dia', 'Choque must start in sync for these tests');
    return { g, c };
  };

  const lessonOf = (g) => g.audiocard_lesson_id;
  const decisions = async (tx, g) => tx`select decision, reason, positions, decided_by, decided_at from audiocard_audio_decisions where lesson_id = ${lessonOf(g)} order by id`;

  await t('tier A: an editorial edit is logged with author, source and type; the audio stays; "audio still fine" clears it and records the decision', async (tx) => {
    const { g, c } = await choque(tx); const actor = await actorOf(tx);
    await tx`select edit_flashcard_card(${c.id}, 'answer', ${c.answer + ' Revisado.'}, 'editorial', ${actor}, 'editor')`;
    const [log] = await tx`select * from flashcard_item_changes where item_id = ${c.id} order by id desc limit 1`;
    eq(log.op, 'update', 'op'); eq(log.change_kind, 'editorial', 'kind'); eq(log.source, 'editor', 'source');
    eq(String(log.changed_by), String(actor), 'author'); eq(log.old_answer, c.answer, 'before'); eq(log.new_answer, c.answer + ' Revisado.', 'after');
    ok(log.changed_at, 'date');
    let s = await st(tx, g);
    eq(s.status, 'texto_alterado_apos_gravacao', 'status'); eq(s.audio_suspended, false, 'audio suspended on an editorial change');
    eq(JSON.stringify(s.changes), '[{"kind":"editorial","position":25}]', 'changes');
    const [{ n }] = await tx`select confirm_audiocard_changes(${lessonOf(g)}, ${actor}) n`; eq(n, 1, 'confirmed');
    s = await st(tx, g); eq(s.status, 'alteracao_conferida', 'after confirming'); eq(s.audio_suspended, false, 'suspended');
    const [d] = await decisions(tx, g);
    eq(d.decision, 'audio_mantido', 'decision'); eq(JSON.stringify(d.positions), '[25]', 'card recorded'); eq(String(d.decided_by), String(actor), 'decided by'); ok(d.decided_at, 'date');
    const [l2] = await tx`select review_decision, reviewed_by from flashcard_item_changes where id = ${log.id}`;
    eq(l2.review_decision, 'audio_mantido', 'decision on the change'); eq(String(l2.reviewed_by), String(actor), 'reviewed by');
  });

  await t('tier B: a clinical edit raises the evident alert but NEVER suspends the audio by itself (Karina 2026-11-14)', async (tx) => {
    const { g, c } = await choque(tx); const actor = await actorOf(tx);
    const [before] = await tx`select audio_url from lessons where id = ${lessonOf(g)}`;
    await tx`select edit_flashcard_card(${c.id}, 'answer', ${'Dose nova de teste.'}, 'clinica', ${actor}, 'editor')`;
    let s = await st(tx, g);
    eq(s.status, 'revisao_clinica_pendente', 'status'); eq(s.audio_suspended, false, 'a clinical change suspended the audio automatically');
    const [after] = await tx`select audio_url from lessons where id = ${lessonOf(g)}`;
    eq(after.audio_url, before.audio_url, 'the audio file/URL must be preserved');
    await tx`select confirm_audiocard_changes(${lessonOf(g)}, ${actor})`;
    s = await st(tx, g); eq(s.status, 'alteracao_conferida', 'after her decision'); eq(s.audio_suspended, false, 'suspended');
    const cards = await tx`select position, audiocard_card_text(text) as text, audiocard_card_text(answer) as answer from flashcard_items where group_id = ${g.id} order by position`;
    await tx`insert into audiocard_recordings (lesson_id, audio_url, recorded_cards, recorded_at, source)
      values (${lessonOf(g)}, ${before.audio_url}, ${tx.json(cards)}, now(), 'manual')`;
    s = await st(tx, g); eq(s.status, 'em_dia', 'after re-recording'); eq(s.audio_suspended, false, 'still suspended');
  });

  await t('tier B: she may instead suspend it by hand — reason, cards and date recorded; the file is kept; lifting brings it back', async (tx) => {
    const { g, c } = await choque(tx); const actor = await actorOf(tx);
    const [before] = await tx`select audio_url from lessons where id = ${lessonOf(g)}`;
    await tx`select edit_flashcard_card(${c.id}, 'answer', ${'Critério novo.'}, 'clinica', ${actor}, 'editor')`;
    await tx`select set_audiocard_suspension(${lessonOf(g)}, true, 'A narração cita o critério antigo', ${actor})`;
    let s = await st(tx, g); eq(s.status, 'audio_suspenso', 'status'); eq(s.audio_suspended, true, 'suspended');
    const [after] = await tx`select audio_url from lessons where id = ${lessonOf(g)}`; eq(after.audio_url, before.audio_url, 'file kept');
    await tx`select set_audiocard_suspension(${lessonOf(g)}, false, null, ${actor})`;
    s = await st(tx, g); eq(s.audio_suspended, false, 'still suspended'); eq(s.status, 'alteracao_conferida', 'after lifting');
    const ds = await decisions(tx, g);
    eq(ds.map((d) => d.decision).join(','), 'audio_suspenso,audio_liberado', 'decisions');
    eq(ds[0].reason, 'A narração cita o critério antigo', 'reason'); eq(JSON.stringify(ds[0].positions), '[25]', 'card');
  });

  await t('tier C: an unclassified change is pending for Karina, the audio stays; classifying moves the alert, never the audio', async (tx) => {
    const { g, c } = await choque(tx); const actor = await actorOf(tx);
    await tx`update flashcard_items set answer = ${'Sem tipo informado.'} where id = ${c.id}`;   // e.g. a raw SQL fix
    let s = await st(tx, g); eq(s.status, 'avaliacao_pendente', 'status'); eq(s.audio_suspended, false, 'suspended');
    const [log] = await tx`select id, change_kind, source from flashcard_item_changes where item_id = ${c.id} order by id desc limit 1`;
    eq(log.change_kind, 'nao_esclarecida', 'default kind'); eq(log.source, 'sql', 'source');
    await tx`select classify_flashcard_changes(${[log.id]}, 'clinica', ${actor})`;
    s = await st(tx, g); eq(s.status, 'revisao_clinica_pendente', 'classified clinical'); eq(s.audio_suspended, false, 'suspended');
    await tx`select classify_flashcard_changes(${[log.id]}, 'editorial', ${actor})`;
    s = await st(tx, g); eq(s.status, 'texto_alterado_apos_gravacao', 'classified editorial'); eq(s.audio_suspended, false, 'suspended');
    const [l2] = await tx`select classified_by, classified_at from flashcard_item_changes where id = ${log.id}`;
    eq(String(l2.classified_by), String(actor), 'classified by'); ok(l2.classified_at, 'classified at');
  });

  await t('the most severe pending change wins: a later editorial touch never hides an earlier clinical change', async (tx) => {
    const { g, c } = await choque(tx); const actor = await actorOf(tx);
    await tx`select edit_flashcard_card(${c.id}, 'answer', ${'Conduta nova.'}, 'clinica', ${actor}, 'editor')`;
    await tx`select edit_flashcard_card(${c.id}, 'answer', ${'Conduta nova!'}, 'editorial', ${actor}, 'editor')`;
    eq((await st(tx, g)).status, 'revisao_clinica_pendente', 'status');
  });

  await t('a new edit after her decision raises a NEW alert', async (tx) => {
    const { g, c } = await choque(tx); const actor = await actorOf(tx);
    await tx`select edit_flashcard_card(${c.id}, 'answer', ${c.answer + ' A.'}, 'editorial', ${actor}, 'editor')`;
    await tx`select confirm_audiocard_changes(${lessonOf(g)}, ${actor})`;
    eq((await st(tx, g)).status, 'alteracao_conferida', 'after decision');
    await tx`select edit_flashcard_card(${c.id}, 'answer', ${c.answer + ' B.'}, 'nao_esclarecida', ${actor}, 'editor')`;
    eq((await st(tx, g)).status, 'avaliacao_pendente', 'no new alert after a second edit');
    const [{ n }] = await tx`select count(*)::int n from audiocard_pending_changes(${lessonOf(g)})`; eq(n, 1, 'only the new change is pending');
  });

  await t('confirming can cover chosen changes only; the rest stays pending', async (tx) => {
    const g = await group(tx, 'Choque', 'emergencia-flashcards'); const actor = await actorOf(tx);
    const cs = await tx`select id, answer from flashcard_items where group_id = ${g.id} and position in (24, 25) order by position`;
    for (const c of cs) await tx`select edit_flashcard_card(${c.id}, 'answer', ${c.answer + ' X.'}, 'editorial', ${actor}, 'editor')`;
    const [first] = await tx`select id from flashcard_item_changes where item_id = ${cs[0].id} order by id desc limit 1`;
    const [{ n }] = await tx`select confirm_audiocard_changes(${lessonOf(g)}, ${actor}, ${[first.id]}) n`; eq(n, 1, 'covered');
    eq((await st(tx, g)).status, 'texto_alterado_apos_gravacao', 'the other card must still be pending');
  });

  await t('restoring the narrated text clears the warning, and the history keeps both edits', async (tx) => {
    const { g, c } = await choque(tx); const actor = await actorOf(tx);
    await tx`select edit_flashcard_card(${c.id}, 'answer', ${'Temporário.'}, 'clinica', ${actor}, 'editor')`;
    await tx`select edit_flashcard_card(${c.id}, 'answer', ${c.answer}, 'editorial', ${actor}, 'editor')`;
    eq((await st(tx, g)).status, 'em_dia', 'status');
    const [{ n }] = await tx`select count(*)::int n from flashcard_item_changes where item_id = ${c.id}`; eq(n, 2, 'history');
  });

  await t('manual suspension needs a reason, keeps the file, and can be lifted', async (tx) => {
    const { g } = await choque(tx); const actor = await actorOf(tx);
    let err = null;
    try { await tx`savepoint s`; await tx`select set_audiocard_suspension(${lessonOf(g)}, true, '', ${actor})`; }
    catch (e) { err = e; await tx`rollback to savepoint s`; }
    ok(err && /motivo/.test(err.message), 'suspension without a reason was accepted');
    await tx`select set_audiocard_suspension(${lessonOf(g)}, true, 'A narração cita a dose antiga', ${actor})`;
    let s = await st(tx, g); eq(s.status, 'audio_suspenso', 'status'); eq(s.audio_suspended, true, 'suspended');
    await tx`select set_audiocard_suspension(${lessonOf(g)}, false, null, ${actor})`;
    s = await st(tx, g); eq(s.status, 'em_dia', 'lifted'); eq(s.audio_suspended, false, 'still suspended');
  });

  await t('deleting and inserting cards is logged; an import is logged as source "import" with the delivery type', async (tx) => {
    const g = await group(tx, 'Choque', 'emergencia-flashcards');
    const [c] = await tx`select id from flashcard_items where group_id = ${g.id} order by position desc limit 1`;
    await tx`delete from flashcard_items where id = ${c.id}`;
    const [d] = await tx`select op, old_text from flashcard_item_changes where item_id = ${c.id}`;
    eq(d.op, 'delete', 'delete logged'); ok(d.old_text, 'deleted text kept');
    const { plan, apply } = require('./import-cards-single-source');
    const cards = await tx`select text as q, answer as a from flashcard_items where group_id = ${g.id} order by position`;
    const delivery = { date: '2099-01-01', change_kind: 'editorial',
      themes: [{ deck: 'emergencia-flashcards', label: 'Choque', cards: [...cards, { q: 'Pergunta importada?', a: 'Resposta importada.' }] }] };
    await apply(tx, delivery, await plan(tx, delivery, {}));
    const [i] = await tx`select op, source, change_kind from flashcard_item_changes where new_text = 'Pergunta importada?'`;
    ok(i, 'import not logged'); eq(i.op, 'insert', 'op'); eq(i.source, 'import', 'source'); eq(i.change_kind, 'editorial', 'kind');
  });

  await t('members cannot read the change log or the decisions, nor call the tier functions', async (tx) => {
    const [r] = await tx`select
      has_table_privilege('authenticated', 'public.flashcard_item_changes', 'select') a,
      has_table_privilege('anon', 'public.flashcard_item_changes', 'select') b,
      has_function_privilege('authenticated', 'public.edit_flashcard_card(bigint,text,text,text,uuid,text)', 'execute') c,
      has_function_privilege('authenticated', 'public.classify_flashcard_changes(bigint[],text,uuid)', 'execute') d,
      has_function_privilege('authenticated', 'public.set_audiocard_suspension(bigint,boolean,text,uuid)', 'execute') e,
      has_function_privilege('anon', 'public.confirm_audiocard_changes(bigint,uuid,bigint[])', 'execute') f,
      has_function_privilege('anon', 'public.stamp_flashcard_changes(bigint[],uuid,text,timestamptz)', 'execute') g,
      has_table_privilege('authenticated', 'public.audiocard_audio_decisions', 'select') h,
      has_function_privilege('authenticated', 'public.audiocard_pending_changes(bigint)', 'execute') i`;
    for (const k of 'abcdefghi') eq(r[k], false, `privilege ${k}`);
  });

  await t('nothing an anonymous or signed-in member can call writes cards', async (tx) => {
    const r = await tx`select has_function_privilege('authenticated', 'public.move_flashcard_group(bigint,bigint,smallint)', 'execute') a,
                               has_function_privilege('anon', 'public.refresh_audiocard_transcripts(bigint[])', 'execute') b`;
    eq(r[0].a, false, 'authenticated can move groups'); eq(r[0].b, false, 'anon can refresh');
  });

  for (const [pass, name, err] of results) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${err ? `\n      ${err}` : ''}`);
  const failed = results.filter((r) => !r[0]).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await sql.end();
  process.exit(failed ? 1 : 0);
})().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
