#!/usr/bin/env node
'use strict';
/**
 * Fase 2 (Karina 18/11/2026, 13h12): her definitive Flashcards + AudioCards + recordings, on top of the single source.
 * ONE transaction; every lookup is by deck + group name (ids differ between databases); nothing is deleted.
 *
 *   node scripts/apply-fase2-2026-11-18.js --db <url> [--apply]      # a local / rehearsal database
 *   node scripts/apply-fase2-2026-11-18.js --prod [--apply]          # production (app/.env.local DATABASE_URL)
 * Without --apply everything runs and is rolled back (a full rehearsal inside the transaction).
 * Inputs (gitignored, her content): parsed/fase2/delivery.json (scratchpad fase2/build_delivery.py) and
 * parsed/fase2/audio-urls.json (the recordings already uploaded to Bunny under AudioCards-Audio/v3).
 *
 * What it does:
 *   1. backups `*_bk_fase2` (taken once);
 *   2. Ortopedia: the group "Trauma e Infecções Musculoesqueléticas" (Outros) becomes "Ortopedia" (same group, same
 *      AudioCard); "Artrite Infecciosa" (Outros) is archived, not deleted; both Meu Plano topics open the Ortopedia group;
 *   3. cards a definitive file no longer has (Urologia 31–55, Cirurgia Pediátrica 29–30) are MOVED to an archived group —
 *      same ids, history kept, Revisão rows suspended;
 *   4. the cards of each theme are written in place (same ids) by scripts/import-cards-single-source.js, with the new
 *      recording; the AudioCard transcripts regenerate themselves; Espondiloartrites is a new group in Reumatologia,
 *      linked to its Meu Plano topic;
 *   5. the recording of Malformações Congênitas, which came without a document, replaces that group's audio (cards
 *      untouched); the other two recordings without a document are held (see AUDIO_HELD);
 *   6. the old Revalida Up "Artrite Infecciosa" (Reumatologia) is unpublished, not deleted (her item 3).
 * HELD, untouched (see HOLD): the nine groups that hold cards of the frozen free deck of 50 Flashcards — importing them
 * would change that deck, which must stay as it is until she decides — and Anemia Falciforme (her item 4).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const postgres = require(path.join(ROOT, 'node_modules', 'postgres'));
const importer = require('./import-cards-single-source.js');

const has = (k) => process.argv.includes(k);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
let URL = arg('--db', null);
if (has('--prod')) {
  for (const line of fs.readFileSync(path.join(ROOT, 'app', '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^DATABASE_URL=(.*)$/); if (m) URL = m[1].trim().replace(/^["']|["']$/g, '');
  }
}
if (!URL) { console.error('use --db <url> or --prod'); process.exit(2); }
const APPLY = has('--apply');
const local = /@(127\.0\.0\.1|localhost)[:/]/.test(URL);

/** Groups that hold cards of the frozen free deck (and Pré-Natal, which also came without a recording): not touched. */
const HOLD = ['Perioperatório', 'Assistência Pré-Natal', 'Doenças Hepatobiliares', 'Anticoncepção', 'Ética Médica e Medicina Legal',
  'Assistência Clínica ao Parto', 'Diarreia e Desidratação', 'Sangramento Uterino Anormal', 'Hérnia'];
/** Cards each group has before this run — a different number means the base moved since the plan: stop. */
const EXPECT = {
  'Choque': 30, 'Cirurgia Pediátrica': 30, 'Coluna Vertebral e Trauma Raquimedular': 30, 'Diabetes Gestacional': 30,
  'Distúrbios Hidroeletrolíticos Nefrológicos': 25, 'Efeitos do Álcool e Abstinência': 30, 'HIV na Gestação': 25,
  'Trauma e Infecções Musculoesqueléticas': 22, 'Otorrinolaringologia': 30, 'Pancreatite': 25, 'Sepse Neonatal': 28,
  'Síndromes Hemorrágicas da Gestação': 28, 'Trauma – Atendimento Inicial e Vias Aéreas': 25, 'Tuberculose': 30, 'Urologia': 55,
};
// Recordings delivered without a document: [deck, group, cards today]. Three came; only Malformações Congênitas is
// applied. The new recordings of Triagem Neonatal and Cardiopatia Congênita say "ecocardiograma nas 24 horas seguintes"
// on the Teste do Coraçãozinho card, where the published cards say "antes da alta" (narration check, 18/11/2026):
// they are HELD until Karina says which text is right — the audio and the cards of those two groups are not touched.
const AUDIO_ONLY = [['pediatria-flashcards', 'Malformações Congênitas', 30]];
const AUDIO_HELD = ['Triagem Neonatal', 'Cardiopatia Congênita'];
const NOTE = 'Karina 18/11/2026 (Fase 2)';
const clean = (s) => String(s ?? '').replace(/<\/p>\s*<p>/g, ' ').replace(/<\/?p>/g, '').trim();

(async () => {
  const delivery = JSON.parse(fs.readFileSync(path.join(ROOT, 'parsed', 'fase2', 'delivery.json'), 'utf8'));
  const audio = JSON.parse(fs.readFileSync(path.join(ROOT, 'parsed', 'fase2', 'audio-urls.json'), 'utf8'));
  const audioOf = new Map(audio.map((a) => [a.file, a.audio_url]));
  const themes = delivery.themes.filter((t) => !HOLD.includes(t.label)).map((t) => ({
    ...t, label: t.file === 'ortopedia' ? 'Ortopedia' : t.label, audio_url: audioOf.get(t.file) || null,
  }));
  if (themes.length !== 16 || themes.some((t) => !t.audio_url)) throw new Error(`expected 16 themes with audio, got ${themes.length}`);

  const sql = postgres(URL, { max: 1, prepare: false, onnotice: () => {} });
  const out = { database: has('--prod') ? 'production' : URL.replace(/.*@/, ''), applied: APPLY };
  try {
    await sql.begin(async (tx) => {
      const one = async (q) => (await q)[0];
      const group = async (deck, label) => {
        const rows = await tx`select g.*, d.slug deck from flashcard_groups g join pages d on d.id = g.page_id where d.slug = ${deck} and g.label = ${label}`;
        if (rows.length > 1) throw new Error(`group "${label}" found ${rows.length} times in ${deck}`);
        return rows[0] || null;
      };
      const cardsOf = async (gid) => Number((await one(tx`select count(*)::int n from flashcard_items where group_id = ${gid}`)).n);
      const md5 = async (where) => (await one(tx.unsafe(`select md5(coalesce(string_agg(i.id || '|' || i.text || '|' || i.answer, '~' order by i.id), '')) h
        from flashcard_items i join flashcard_groups g on g.id = i.group_id join pages d on d.id = g.page_id where ${where}`))).h;

      // ── guards ────────────────────────────────────────────────────────────────────────────────────────────
      if (await group('outros-flashcards', 'Ortopedia')) throw new Error('Fase 2 already applied here (group "Ortopedia" exists) - nothing changed');
      for (const [label, n] of Object.entries(EXPECT)) {
        const t = delivery.themes.find((x) => x.label === label);
        const g = await group(t.deck, label);
        if (!g) throw new Error(`group "${label}" not found in ${t.deck}`);
        const have = await cardsOf(g.id);
        if (have !== n) throw new Error(`group "${label}" has ${have} cards, expected ${n} - nothing changed`);
      }
      for (const [deck, label, n] of AUDIO_ONLY) {
        const g = await group(deck, label);
        if (!g || (await cardsOf(g.id)) !== n) throw new Error(`group "${label}" is not as expected - nothing changed`);
      }
      const artrite = await group('outros-flashcards', 'Artrite Infecciosa');
      if (!artrite || (await cardsOf(artrite.id)) !== 28) throw new Error('group "Artrite Infecciosa" (Outros) is not as expected');
      if (await group('reumatologia-flashcards', 'Espondiloartrites')) throw new Error('group "Espondiloartrites" already exists');
      const freeBefore = await one(tx`select md5(string_agg(f.position || '|' || i.id || '|' || i.text || '|' || i.answer, '~' order by f.position)) h, count(*)::int n
        from free_flashcard_deck f join flashcard_items i on i.id = f.flashcard_item_id`);
      const heldWhere = `g.label = any(array[${[...HOLD, ...AUDIO_HELD].map((l) => `'${l.replace(/'/g, "''")}'`).join(',')}]) or g.label = 'Anemia Falciforme'`;
      const heldAudio = () => tx`select md5(string_agg(l.id || '|' || coalesce(l.audio_url, '') || '|' || md5(l.body_html), '~' order by l.id)) h
        from flashcard_groups g join lessons l on l.id = g.audiocard_lesson_id where g.label = any(${[...HOLD, ...AUDIO_HELD, 'Anemia Falciforme']})`;
      const heldAudioBefore = (await heldAudio())[0].h;
      const heldBefore = await md5(heldWhere);
      const totalBefore = await one(tx`select (select count(*)::int from flashcard_items) cards, (select count(*)::int from flashcard_groups) groups`);

      // ── 1. backups (once: a re-run keeps the ORIGINAL state) ─────────────────────────────────────────────
      for (const t of ['flashcard_items', 'flashcard_groups', 'topic_content', 'audiocard_recordings']) {
        await tx.unsafe(`create table if not exists ${t}_bk_fase2 as select * from ${t}`);
      }
      await tx.unsafe(`create table if not exists lessons_bk_fase2 as select l.* from lessons l where l.id in (select audiocard_lesson_id from flashcard_groups)`);
      await tx.unsafe(`create table if not exists review_schedule_bk_fase2 as select * from review_schedule where item_type = 'flashcard'`);
      await tx.unsafe(`create table if not exists pages_bk_fase2 as select * from pages where slug = 'artrite-infecciosa-revalida-up'`);
      for (const t of ['flashcard_items', 'flashcard_groups', 'topic_content', 'audiocard_recordings', 'lessons', 'review_schedule', 'pages']) {
        await tx.unsafe(`alter table ${t}_bk_fase2 enable row level security`);
        await tx.unsafe(`revoke all on ${t}_bk_fase2 from public, anon, authenticated`);
      }

      // ── archive decks (draft pages; same pattern as Fase 1) ──────────────────────────────────────────────
      await tx.unsafe(`
        insert into pages (id, slug, title, type, status, parent_id, specialty_id, view, track_id, content_module_id, notes, wp_created_at, wp_modified_at)
        select (select max(id) from pages) + row_number() over (order by r.spec, k.ord),
               'retirados-' || r.spec || k.suffix, r.spec_name || k.title, k.type::page_type, 'draft', null,
               (select id from specialties where slug = r.spec), k.view::page_view, (select id from tracks where slug = k.track), null,
               '${NOTE}: materiais retirados da área publicada. Não publicar; não apagar.', now(), now()
          from (values ('outros', 'Outros'), ('pediatria', 'Pediatria')) r(spec, spec_name)
         cross join (values (1, '-flashcards', ' Flashcards — materiais retirados (não publicados)', 'h5p-quiz', 'quiz', 'flashcards'),
                            (2, '-audiocards', ' AudioCards — materiais retirados (não publicados)', 'text-lesson', null, 'audiocards')) k(ord, suffix, title, type, view, track)
         where not exists (select 1 from pages p where p.slug = 'retirados-' || r.spec || k.suffix)`);
      const deckId = async (slug) => (await one(tx`select id from pages where slug = ${slug}`)).id;
      const suspend = (ids) => tx`update review_schedule set suspended = true where item_type = 'flashcard' and not suspended and item_id = any(${ids})`;

      // ── 2. Ortopedia ─────────────────────────────────────────────────────────────────────────────────────
      const orto = await group('outros-flashcards', 'Trauma e Infecções Musculoesqueléticas');
      await tx`update flashcard_groups set label = 'Ortopedia' where id = ${orto.id}`;
      const retOutros = await deckId('retirados-outros-flashcards');
      await tx`insert into flashcard_group_moves (item_id, from_group_id, from_label, from_deck_id, from_position, to_group_id, to_label, to_deck_id, to_position, operation, reason)
        select f.id, ${artrite.id}, 'Artrite Infecciosa', ${artrite.page_id}, f.position, ${artrite.id}, 'Artrite Infecciosa', ${retOutros}, f.position, 'retire_group',
               ${NOTE + ': grupo substituído por "Ortopedia"; conteúdo, áudio e identificadores preservados'}
          from flashcard_items f where f.group_id = ${artrite.id}`;
      await tx`select move_flashcard_group(${artrite.id}, ${retOutros}, 1::smallint)`;
      await suspend((await tx`select id from flashcard_items where group_id = ${artrite.id}`).map((r) => r.id));
      const relinked = await tx`update topic_content c set flashcard_group_id = ${orto.id}
        from topics t where t.id = c.topic_id and t.slug = 'artrite-infecciosa' and c.resource_type = 'flashcards' and c.flashcard_group_id = ${artrite.id} returning c.id`;
      if (await one(tx`select 1 ok from topic_content where flashcard_group_id = ${artrite.id}`)) throw new Error('a Meu Plano topic still points at the archived "Artrite Infecciosa" group');
      out.ortopedia = { group_id: String(orto.id), archived_group_id: String(artrite.id), artrite_links_moved: relinked.length };

      // ── 3. cards the definitive file no longer has → archived group, same ids ───────────────────────────
      out.leftovers = [];
      for (const [deck, label, keep, retDeck] of [['outros-flashcards', 'Urologia', 30, 'retirados-outros-flashcards'], ['pediatria-flashcards', 'Cirurgia Pediátrica', 28, 'retirados-pediatria-flashcards']]) {
        const g = await group(deck, label);
        const extra = await tx`select id, position from flashcard_items where group_id = ${g.id} and position > ${keep} order by position`;
        if (!extra.length) continue;
        const ret = await deckId(retDeck);
        const [ag] = await tx`insert into flashcard_groups (page_id, position, label)
          values (${ret}, (select coalesce(max(position), 0) + 1 from flashcard_groups where page_id = ${ret}), ${label + ' — cartões retirados em 18/11/2026'}) returning id`;
        let n = 0;
        for (const c of extra) {
          n++;
          await tx`insert into flashcard_group_moves (item_id, from_group_id, from_label, from_deck_id, from_position, to_group_id, to_label, to_deck_id, to_position, operation, reason)
            values (${c.id}, ${g.id}, ${label}, ${g.page_id}, ${c.position}, ${ag.id}, ${label + ' — cartões retirados em 18/11/2026'}, ${ret}, ${n}, 'retire_group',
                    ${NOTE + ': cartão não consta do arquivo definitivo do tema; movido para um grupo de arquivo, preservado, fora da área publicada'})`;
          await tx`update flashcard_items set group_id = ${ag.id}, position = ${n} where id = ${c.id}`;
        }
        await suspend(extra.map((c) => c.id));
        out.leftovers.push({ label, kept: keep, archived: extra.length, archive_group_id: String(ag.id) });
      }

      // ── 4. the cards, in place, with their recordings ────────────────────────────────────────────────────
      const run = { date: delivery.date, change_kind: delivery.change_kind, themes };
      const planned = await importer.plan(tx, run, {});
      const s = importer.summary(planned);
      if (s.conflitos || s.sobras || s.temas_novos !== 1) throw new Error(`unexpected plan: ${JSON.stringify(s)}`);
      out.backup_suffix = await importer.apply(tx, run, planned, {});
      out.cards = s;
      out.themes = planned.map((t) => ({
        deck: t.deck, label: t.label, new_group: t.new_group, group_id: String(t.group_id), lesson_id: String(t.lesson_id),
        iguais: t.ops.filter((o) => o.kind === 'igual').length, alterados: t.ops.filter((o) => o.kind === 'atualizar').length,
        inseridos: t.ops.filter((o) => o.kind === 'inserir').length, cartoes: t.ops.length, audio_url: t.audio_url,
      }));

      // ── 5. recordings without a document ─────────────────────────────────────────────────────────────────
      out.audio_only = [];
      for (const [deck, label] of AUDIO_ONLY) {
        const g = await group(deck, label);
        const a = audio.find((x) => x.label === label && x.deck === deck);
        if (!a || !g.audiocard_lesson_id) throw new Error(`no recording / AudioCard for "${label}"`);
        await tx`update lessons set audio_url = ${a.audio_url}, audio_added_at = now() where id = ${g.audiocard_lesson_id}`;
        const cards = await tx`select position, text, answer from flashcard_items where group_id = ${g.id} order by position`;
        await tx`insert into audiocard_recordings (lesson_id, audio_url, recorded_cards, recorded_at, source)
          values (${g.audiocard_lesson_id}, ${a.audio_url}, ${tx.json(cards.map((c) => ({ position: c.position, text: clean(c.text), answer: clean(c.answer) })))}, now(), 'import')`;
        out.audio_only.push({ label, group_id: String(g.id), lesson_id: String(g.audiocard_lesson_id), audio_url: a.audio_url, cartoes: cards.length });
      }

      // ── Espondiloartrites → its Meu Plano topic ──────────────────────────────────────────────────────────
      const esp = await group('reumatologia-flashcards', 'Espondiloartrites');
      const topic = await one(tx`select id from topics where slug = 'espondiloartrites'`);
      if (!esp || !topic) throw new Error('Espondiloartrites: group or topic missing');
      if (!(await one(tx`select 1 ok from topic_content where topic_id = ${topic.id} and resource_type = 'flashcards'`))) {
        await tx`insert into topic_content (topic_id, resource_type, page_id, flashcard_group_id, note)
          values (${topic.id}, 'flashcards', ${esp.page_id}, ${esp.id}, ${NOTE + ': novo grupo de Flashcards e AudioCard'})`;
      }

      // ── 6. the old Revalida Up of Artrite Infecciosa ─────────────────────────────────────────────────────
      if (await one(tx`select 1 ok from topic_content c join pages p on p.id = c.page_id where p.slug = 'artrite-infecciosa-revalida-up'`)) {
        throw new Error('a Meu Plano topic still opens artrite-infecciosa-revalida-up - not unpublished');
      }
      const ru = await tx`update pages set status = 'draft' where slug = 'artrite-infecciosa-revalida-up' and status = 'publish' returning id`;
      out.artrite_ru_unpublished = ru.length;

      // ── checks ───────────────────────────────────────────────────────────────────────────────────────────
      const checks = [];
      const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail: String(detail) }); };
      const freeAfter = await one(tx`select md5(string_agg(f.position || '|' || i.id || '|' || i.text || '|' || i.answer, '~' order by f.position)) h, count(*)::int n
        from free_flashcard_deck f join flashcard_items i on i.id = f.flashcard_item_id`);
      check('Baralho gratuito de 50 Flashcards idêntico (mesmos cartões, mesmo texto)', freeAfter.h === freeBefore.h && freeAfter.n === 50, `${freeAfter.n} cartões`);
      check('Grupos retidos e Anemia Falciforme sem nenhuma alteração (cartões, transcrição e áudio)',
        (await md5(heldWhere)) === heldBefore && (await heldAudio())[0].h === heldAudioBefore, `${HOLD.length + AUDIO_HELD.length} grupos retidos + Anemia Falciforme`);
      const totalAfter = await one(tx`select (select count(*)::int from flashcard_items) cards, (select count(*)::int from flashcard_groups) groups`);
      const inserted = s.inserir;
      check('Nenhum cartão apagado', totalAfter.cards === totalBefore.cards + inserted, `${totalBefore.cards} + ${inserted} inseridos = ${totalAfter.cards}`);
      check('Grupos: 1 novo (Espondiloartrites) + 2 de arquivo', totalAfter.groups === totalBefore.groups + 1 + out.leftovers.length, `${totalBefore.groups} → ${totalAfter.groups}`);
      const sync = await tx`
        select g.label, (select count(*)::int from flashcard_items i where i.group_id = g.id) cards,
               (length(l.body_html) - length(replace(l.body_html, '<h3 class="ac-card">', ''))) / length('<h3 class="ac-card">') in_transcript,
               l.audio_url, l.title, lp.slug ac_page, lp.status ac_status
          from flashcard_groups g join lessons l on l.id = g.audiocard_lesson_id join pages lp on lp.id = l.page_id
         where g.id = any(${[...planned.map((t) => t.group_id), ...out.audio_only.map((a) => a.group_id)]})`;
      check('AudioCards: transcrição gerada com o mesmo número de cartões do grupo', sync.every((r) => r.cards === Number(r.in_transcript)), sync.filter((r) => r.cards !== Number(r.in_transcript)).map((r) => r.label).join(', ') || `${sync.length} grupos`);
      check('AudioCards: todos apontam para a gravação nova (pasta v3) e têm o nome do grupo', sync.every((r) => /\/AudioCards-Audio\/v3\//.test(r.audio_url || '') && r.title === r.label), `${sync.length} grupos`);
      check('AudioCards atualizados estão em páginas publicadas', sync.every((r) => r.ac_status === 'publish'), [...new Set(sync.map((r) => r.ac_page))].length + ' páginas');
      const rec = await one(tx`select count(distinct lesson_id)::int n from audiocard_recordings where audio_url like '%/AudioCards-Audio/v3/%'`);
      check('Cada gravação nova registrada junto com o texto que narra', rec.n === 17, `${rec.n} de 17`);
      const dead = await tx`select t.slug from topic_content c join topics t on t.id = c.topic_id left join flashcard_groups g on g.id = c.flashcard_group_id left join pages p on p.id = coalesce(g.page_id, c.page_id)
        where c.resource_type = 'flashcards' and (g.id is null or p.status <> 'publish')`;
      check('Meu Plano: nenhum vínculo de Flashcards abre grupo arquivado ou inexistente', dead.length === 0, dead.map((d) => d.slug).join(', ') || 'todos os vínculos abrem grupos publicados');
      const links = await tx`select t.slug, g.label from topic_content c join topics t on t.id = c.topic_id join flashcard_groups g on g.id = c.flashcard_group_id
        where t.slug = any(${['artrite-infecciosa', 'trauma-osteomielite', 'espondiloartrites', 'patologias-da-coluna-vertebral', 'trauma-raquimedular']}) and c.resource_type = 'flashcards' order by 1`;
      check('Meu Plano: Ortopedia (2 temas), Espondiloartrites e Coluna/Trauma Raquimedular (1 grupo, 2 temas)',
        links.length === 5 && links.filter((l) => l.label === 'Ortopedia').length === 2 && links.filter((l) => l.label === 'Coluna Vertebral e Trauma Raquimedular').length === 2
          && links.some((l) => l.slug === 'espondiloartrites' && l.label === 'Espondiloartrites'), links.map((l) => `${l.slug} → ${l.label}`).join('; '));
      const unsusp = await one(tx`select count(*)::int n from review_schedule rs join flashcard_items i on i.id = rs.item_id join flashcard_groups g on g.id = i.group_id join pages d on d.id = g.page_id
        where rs.item_type = 'flashcard' and not rs.suspended and d.status <> 'publish'`);
      check('Revisão: nenhum cartão arquivado continua sendo pedido', unsusp.n === 0, `${unsusp.n} linhas ativas em grupos arquivados`);
      const lost = await one(tx`select (select count(*)::int from review_schedule_bk_fase2) before, (select count(*)::int from review_schedule where item_type = 'flashcard') after`);
      check('Revisão: nenhum histórico de Flashcards perdido', lost.after >= lost.before, `${lost.before} → ${lost.after} linhas`);
      const dup = await tx`select d.slug, g.label, count(*) from flashcard_groups g join pages d on d.id = g.page_id group by 1, 2 having count(*) > 1`;
      check('Nenhum grupo duplicado', dup.length === 0, dup.length);
      const old = await tx`select g.label, d.slug, d.status from flashcard_groups g join pages d on d.id = g.page_id where g.label in ('Artrite Infecciosa', 'Trauma Raquimedular', 'Trauma e Infecções Musculoesqueléticas')`;
      check('Grupos antigos não voltaram à área publicada', old.every((o) => o.status === 'draft'), old.map((o) => `${o.label} em ${o.slug} (${o.status})`).join('; '));
      check('Revalida Up antigo de Artrite Infecciosa despublicado, sem exclusão',
        (await one(tx`select status from pages where slug = 'artrite-infecciosa-revalida-up'`)).status === 'draft', 'draft');
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
  console.log(JSON.stringify(out.cards), JSON.stringify(out.leftovers), JSON.stringify(out.ortopedia), 'audio only:', out.audio_only.length, 'RU unpublished:', out.artrite_ru_unpublished);
  for (const c of out.checks) console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${c.name} (${c.detail})`);
})().catch((e) => { console.error(e); process.exit(1); });
