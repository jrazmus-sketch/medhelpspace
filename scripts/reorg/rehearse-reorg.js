#!/usr/bin/env node
// Integrated rehearsal of the reorganization (R4b → R1 → R2 → Ortopedia → TRM-CG retirement → Revalida Up links) on a
// FULL COPY OF PRODUCTION restored into an isolated local Supabase (port 56322, personal data left out).
//
//   node scripts/reorg/rehearse-reorg.js            → apply each step + checks, re-run test, rollback chain
//                                                     (each rollback must land on the state before its step),
//                                                     then re-apply everything (left applied for the screen tests)
//   Report: scripts/reorg/rehearsal-report.json (gitignored data stays outside the repo: see REPORT below)
//
// REFUSES any database that is not the rehearsal copy (port 56322 + every profile anonymised @rehearsal.local).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const pg = require(path.join(ROOT, '..', 'medhelpspace', 'node_modules', 'postgres'));
const URL = 'postgresql://postgres:postgres@127.0.0.1:56322/postgres';
const DATA = process.env.R1_DATA || 'c:/Users/jrazm/claudebuilds/mhs-rehearsal/exam-questions-data.sql';
const REPORT = process.env.REPORT || 'c:/Users/jrazm/claudebuilds/mhs-rehearsal/rehearsal-report.json';

const STEPS = [
  { key: 'R4b', apply: ['schema-patch-r4b-stable-group-ids.sql'], rollback: ['schema-patch-r4b-stable-group-ids-rollback.sql'], rerun: true },
  { key: 'R1', apply: ['schema-patch-exam-questions.sql', DATA], rollback: ['schema-patch-exam-questions-rollback.sql'], rerun: true },
  { key: 'R2', apply: ['schema-patch-r2-topics-reorg.sql', DATA], rollback: ['schema-patch-r2-topics-reorg-rollback.sql'], rerun: true },
  { key: 'Ortopedia', apply: ['schema-patch-ortopedia-flashcard-groups.sql'], rollback: ['schema-patch-ortopedia-flashcard-groups-rollback.sql'], rerun: true },
  // Karina 2026-11-15: NO 55-card union; the old Cirurgia Geral TRM materials leave the published area instead.
  { key: 'TRM Cirurgia Geral (retirada)', apply: ['schema-patch-trm-cirurgia-geral-retirada.sql'], rollback: ['schema-patch-trm-cirurgia-geral-retirada-rollback.sql'], rerun: true },
  { key: 'Revalida Up (24 vínculos)', apply: ['schema-patch-revalida-up-topic-links.sql'], rollback: ['schema-patch-revalida-up-topic-links-rollback.sql'], rerun: true },
];
const PII = new Set(('admin_alerts admin_alerts_seen admin_notification_prefs admin_audit_log ambassador_clicks ambassadors app_errors ' +
  'announcement_reads announcement_dismissals clinact_invoices clinact_subscription_events clinact_subscriptions commissions ' +
  'coupon_redemptions email_log email_settings funnel_events integration_credentials lead_email_events lead_events leads ' +
  'meta_capi_events orders pagbank_subscription_api_calls payouts profiles support_tickets support_ticket_messages user_notifications').split(' '));
const HISTORY = ['quiz_attempts', 'flashcard_attempts', 'flashcard_progress', 'lesson_completions', 'lesson_progress', 'study_plans',
  'study_plan_focus_specialties', 'study_plan_excluded_specialties', 'study_plan_pauses', 'clinact_attempts', 'clinact_step_events',
  'simulado_review_flags', 'user_cohort_memberships'];
const FREE_DECK_PLAN = [[16, 10], [13, 9], [14, 9], [17, 9], [15, 8], [7, 5]];   // lib/magnet/flashcards.ts

const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 16);
const report = { started: new Date().toISOString(), database: 'cópia integral da produção (dados pessoais excluídos), porta 56322', steps: [], checks: [], rollback: [], rerun: [], final: null };
let failures = 0;
const check = (name, ok, detail) => { report.checks.push({ name, ok, detail }); if (!ok) failures++; console.log(`  ${ok ? 'OK ' : 'FALHA'} ${name}${detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };

async function fingerprint(db) {
  return db.begin('read only', async (t) => {
    const tabs = (await t`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`)
      .map((x) => x.table_name).filter((x) => !PII.has(x));
    const o = {};
    for (const tb of tabs) {
      const [x] = await t.unsafe(`select count(*)::int n, coalesce(md5(string_agg(md5(r::text),'' order by md5(r::text))),'') h from public."${tb}" r`);
      o[tb] = `${x.n}:${x.h}`;
    }
    o.__functions = (await t`select md5(string_agg(md5(pg_get_functiondef(p.oid)),'' order by p.proname, md5(pg_get_functiondef(p.oid)))) h from pg_proc p where pronamespace='public'::regnamespace and prokind in ('f','p')`)[0].h;
    o.__triggers = (await t`select md5(string_agg(pg_get_triggerdef(oid),'' order by tgname)) h from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace)`)[0].h;
    o.__policies = (await t`select md5(string_agg(tablename||policyname||coalesce(qual,'')||coalesce(with_check,''),'' order by tablename,policyname)) h from pg_policies where schemaname='public'`)[0].h;
    o.__views = (await t`select md5(string_agg(viewname||definition,'' order by viewname)) h from pg_views where schemaname='public'`)[0].h;
    o.__constraints = (await t`select md5(string_agg(conrelid::regclass||conname||pg_get_constraintdef(oid),'' order by conrelid::regclass::text, conname)) h from pg_constraint where connamespace='public'::regnamespace`)[0].h;
    o.__columns = (await t`select md5(string_agg(table_name||'.'||column_name||':'||data_type,'' order by table_name, ordinal_position)) h from information_schema.columns where table_schema='public'`)[0].h;
    return o;
  });
}
const diffFp = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);

// Everything the checks compare, captured from the database as it is.
async function snapshot(db) {
  return db.begin('read only', async (t) => {
    const has = async (tbl, col) => (await t`select 1 from information_schema.columns where table_schema='public' and table_name=${tbl} and column_name=${col}`).length > 0;
    const S = {};
    S.quiz = await t`select id, page_id, position, md5(coalesce(question,'')||'|'||coalesce(answers::text,'')||'|'||coalesce(explanation_html,'')||'|'||coalesce(media_url,'')||'|'||coalesce(h5p_sub_id::text,'')) h from quiz_questions order by id`;
    S.pages = await t`select id, slug, title, status, specialty_id, view from pages order by id`;
    S.cards = await t`select f.id, f.group_id, f.page_id, f.group_position, f.position, md5(coalesce(f.text,'')||'|'||coalesce(f.answer,'')||'|'||coalesce(f.image_url,'')||'|'||coalesce(f.tip,'')) h from flashcard_items f order by id`;
    S.groups = await t`select g.id, g.page_id, g.position, g.label, g.audiocard_lesson_id, p.slug deck from flashcard_groups g join pages p on p.id=g.page_id order by g.id`;
    S.audiocards = await t`select l.id, l.page_id, l.position, l.title, l.audio_url, md5(coalesce(l.body_html,'')) h, p.slug, p.status from lessons l join pages p on p.id=l.page_id where p.track_id = (select id from tracks where slug='audiocards') order by l.id`;
    S.links = await t.unsafe(`select c.id, c.topic_id, c.resource_type, c.page_id, c.question_filter${await has('topic_content', 'flashcard_group_id') ? ', c.flashcard_group_id' : ''} from topic_content c order by c.id`);
    S.topics = await t`select id, name, slug, specialty_id, source_page_id, incidence_count from topics order by id`;
    S.fft = await t`select * from flashcard_theme_topics`;
    S.review = await t`select id, user_id, item_type, item_id, specialty_id, md5(row(r.*)::text) h from review_schedule r order by id`;
    S.history = {};
    for (const tb of HISTORY) {
      const ex = (await t`select 1 from information_schema.tables where table_schema='public' and table_name=${tb}`).length;
      if (ex) S.history[tb] = (await t.unsafe(`select count(*)::int n, coalesce(md5(string_agg(md5(r::text),'' order by md5(r::text))),'') h from public."${tb}" r`))[0];
    }
    S.flashPages = await t`select id, specialty_id from pages where track_id = 3 and status='publish' and specialty_id is not null`;
    S.status = await t`select status, count(*)::int n from audiocard_sync_status group by 1 order by 1`;
    S.suspended = (await t`select count(*)::int n from audiocard_sync_status where audio_suspended`)[0].n;
    S.publishedGroups = (await t`select count(*)::int n from flashcard_groups g join pages p on p.id=g.page_id where p.status='publish'`)[0].n;
    S.ruCheck = (await t`select to_regclass('public.revalida_up_link_check') is not null r`)[0].r
      ? await t`select issue, page_id, slug, topic_name from revalida_up_link_check order by issue, slug` : null;
    S.ruUnlinkedRaw = await t`select p.id, p.slug from pages p where p.view='revalida-up' and p.status='publish'
      and not exists (select 1 from topic_content c where c.resource_type='revalida_up' and c.page_id=p.id) order by p.slug`;
    const gid = (await has('topic_content', 'flashcard_group_id')) ? 'c.flashcard_group_id' : 'null::bigint';
    S.newTopics = await t.unsafe(`select t.slug, t.name, t.incidence_count, s.slug spec,
      (select string_agg(c.resource_type||':'||p.slug||coalesce('#'||${gid},''), ' ' order by c.resource_type) from topic_content c join pages p on p.id=c.page_id where c.topic_id=t.id) links
      from topics t join specialties s on s.id=t.specialty_id where t.slug in ('cerume-impactado','epistaxe','hipertrofia-adenoideana','fistulas-urinarias') order by t.slug`);
    S.trmLinks = await t.unsafe(`select c.resource_type, p.slug, p.status, ${gid} flashcard_group_id from topic_content c join topics t on t.id=c.topic_id join pages p on p.id=c.page_id where t.slug='trauma-raquimedular' order by 1`);
    S.r1 = (await t`select to_regclass('public.exam_questions') is not null r`)[0].r
      ? (await t`select (select count(*)::int from exam_questions) originals, (select count(*)::int from exam_questions where topic_id is not null) with_topic,
                       (select count(*)::int from exam_question_registry where registered) registered,
                       (select count(*)::int from quiz_questions q join pages p on p.id=q.page_id where p.view='quiz' and p.status='publish') records,
                       (select count(*)::int from quiz_questions q join pages p on p.id=q.page_id where p.view='quiz' and p.status='publish' and q.exam_question_id is not null) records_linked,
                       (select count(*)::int from topic_question_links) topic_links,
                       (select count(*)::int from topic_content where resource_type='resumo') resumo_links,
                       (select count(*)::int from exam_questions where topic_status='aprovado') approved,
                       (select count(*)::int from exam_questions where topic_status='proposto' and topic_note like 'A REVER%') doubtful,
                       (select string_agg(q.id::text, ',') from quiz_questions q join pages p on p.id=q.page_id where p.view='quiz' and p.status='publish' and q.exam_question_id is null) unlinked_records,
                       (select string_agg(e.edition||' Q'||e.number, ', ' order by e.edition, e.number) from exam_questions e join topics t on t.id=e.topic_id where t.slug in ('cerume-impactado','epistaxe','hipertrofia-adenoideana','fistulas-urinarias')) new_topic_questions,
                       (select count(*)::int from topic_question_links l join exam_questions e on e.id=l.exam_question_id
                         where l.is_primary and l.topic_id is distinct from e.topic_id) wrong_primary_links`)[0]
      : null;
    return S;
  });
}

// lib/magnet/flashcards.ts getWeightedRevalidaDeck(), reproduced (labels: the copies kept in sync by R4b).
function freeDeck(S) {
  const inc = new Map(S.topics.map((t) => [+t.id, +t.incidence_count || 0]));
  const bySpecTheme = new Map(S.fft.map((m) => [`${m.specialty_id}::${m.group_label}`, inc.get(+m.topic_id)]).filter((x) => x[1] != null));
  const groupLabel = new Map(S.groups.map((g) => [+g.id, g.label]));
  const per = new Map();
  for (const [sid, n] of FREE_DECK_PLAN) {
    const pgRow = S.flashPages.filter((p) => +p.specialty_id === sid).sort((a, b) => a.id - b.id)[0];
    if (!pgRow) { per.set(sid, []); continue; }
    const rows = S.cards.filter((f) => +f.page_id === +pgRow.id).sort((a, b) => a.group_position - b.group_position || a.position - b.position);
    const tm = new Map();
    for (const r of rows) { const k = groupLabel.get(+r.group_id) ?? ''; if (!tm.has(k)) tm.set(k, []); tm.get(k).push(r); }
    const themes = [...tm.entries()].map(([l, c]) => ({ l, c, i: bySpecTheme.get(`${sid}::${l}`) ?? -1 })).sort((a, b) => b.i - a.i).slice(0, 5);
    const sel = []; const cur = themes.map(() => 0); let pr = true;
    while (sel.length < n && pr) { pr = false; for (let i = 0; i < themes.length && sel.length < n; i++) if (cur[i] < themes[i].c.length) { sel.push(themes[i].c[cur[i]]); cur[i]++; pr = true; } }
    per.set(sid, sel.map((c) => +c.id));
  }
  const ids = []; const c = new Map(FREE_DECK_PLAN.map(([s]) => [s, 0])); let more = true;
  while (more) { more = false; for (const [s] of FREE_DECK_PLAN) { const L = per.get(s) || []; const k = c.get(s); if (k < L.length) { ids.push(L[k]); c.set(s, k + 1); more = true; } } }
  return ids;
}

const byId = (rows) => new Map(rows.map((r) => [String(r.id), r]));

function checkState(label, S0, S, expect) {
  console.log(`\n▶ checks after ${label}`);
  // Questions: no content, section or position change — ever.
  const q0 = byId(S0.quiz), q = byId(S.quiz);
  const qChanged = [...q0.keys()].filter((k) => !q.has(k) || q.get(k).h !== q0.get(k).h || q.get(k).page_id !== q0.get(k).page_id || q.get(k).position !== q0.get(k).position);
  check(`${label}: questões — ${S.quiz.length} registros, enunciado/alternativas/comentário/seção/posição inalterados`, S.quiz.length === S0.quiz.length && qChanged.length === 0, qChanged.slice(0, 5));
  // Pages: only the expected titles change
  const p0 = byId(S0.pages); const pChanged = S.pages.filter((p) => { const o = p0.get(String(p.id)); return !o || JSON.stringify(o) !== JSON.stringify(p); }).map((p) => `${p.slug}: ${p0.get(String(p.id))?.title} → ${p.title}`);
  check(`${label}: páginas — só as mudanças previstas`, JSON.stringify(pChanged.sort()) === JSON.stringify((expect.pages || []).sort()), pChanged);
  // Cards: same ids, same text; placement changes only in the expected groups
  const c0 = byId(S0.cards), c = byId(S.cards);
  const textChanged = [...c0.keys()].filter((k) => !c.has(k) || c.get(k).h !== c0.get(k).h);
  check(`${label}: Flashcards — ${S.cards.length} cartões, mesmos identificadores e textos`, S.cards.length === S0.cards.length && textChanged.length === 0 && [...c.keys()].every((k) => c0.has(k)), textChanged.slice(0, 5));
  const moved = [...c.keys()].filter((k) => { const a = c0.get(k), b = c.get(k); return a.group_id !== b.group_id || a.page_id !== b.page_id || a.position !== b.position; });
  const movedGroups = [...new Set(moved.map((k) => c0.get(k).group_id))].sort();
  check(`${label}: cartões que mudaram de lugar pertencem só aos grupos previstos`, JSON.stringify(movedGroups) === JSON.stringify((expect.movedGroups || []).map(String).sort()), { cards: moved.length, groups: movedGroups });
  // AudioCards: audio never changes; transcript only where expected; nothing unpublished
  const a0 = byId(S0.audiocards), a = byId(S.audiocards);
  const audioChanged = [...a0.keys()].filter((k) => !a.has(k) || a.get(k).audio_url !== a0.get(k).audio_url);
  check(`${label}: AudioCards — ${S.audiocards.length} aulas, nenhum arquivo de áudio trocado ou removido`, S.audiocards.length === S0.audiocards.length && audioChanged.length === 0, audioChanged);
  const trChanged = [...a0.keys()].filter((k) => a.get(k).h !== a0.get(k).h).map((k) => a0.get(k).title).sort();
  check(`${label}: transcrições alteradas só onde previsto`, JSON.stringify(trChanged) === JSON.stringify((expect.transcripts || []).sort()), trChanged);
  const unpublished = [...a.values()].filter((l) => l.status !== 'publish').map((l) => l.title).sort();
  const expUnpub = (expect.unpublishedAudiocards || []).slice().sort();
  check(expUnpub.length ? `${label}: AudioCards fora da área publicada — só os previstos (${expUnpub.join(', ')})` : `${label}: nenhum AudioCard despublicado`,
    JSON.stringify(unpublished) === JSON.stringify(expUnpub), unpublished);
  // Student history: untouched (Revisão: only the denormalised specialty of moved cards may follow the deck)
  const hChanged = Object.keys(S0.history).filter((t) => JSON.stringify(S0.history[t]) !== JSON.stringify(S.history[t]));
  check(`${label}: históricos dos alunos (tentativas, conclusões, progresso, planos) idênticos`, hChanged.length === 0, hChanged);
  const r0 = byId(S0.review), r = byId(S.review);
  const rLost = [...r0.keys()].filter((k) => !r.has(k) || r.get(k).item_id !== r0.get(k).item_id || r.get(k).user_id !== r0.get(k).user_id);
  const rSpec = [...r0.keys()].filter((k) => r.has(k) && r.get(k).specialty_id !== r0.get(k).specialty_id);
  check(`${label}: Revisão — ${S.review.length} itens preservados (mesmo aluno, mesmo cartão/questão)`, S.review.length === S0.review.length && rLost.length === 0, { lost: rLost.length, specialtyFollowedDeck: rSpec.length });
  // Meu Plano links: everything resolves
  const pages = byId(S.pages); const groups = byId(S.groups);
  const broken = [];
  for (const l of S.links) {
    const page = pages.get(String(l.page_id));
    if (!page) { broken.push(`${l.id}: página ${l.page_id} inexistente`); continue; }
    if (l.resource_type === 'flashcards' && 'flashcard_group_id' in l) {
      const g = groups.get(String(l.flashcard_group_id));
      if (!g) broken.push(`${l.id}: grupo ${l.flashcard_group_id} inexistente`);
      else if (String(g.page_id) !== String(l.page_id)) broken.push(`${l.id}: baralho ≠ baralho do grupo`);
    }
    if (['quiz', 'flashcards', 'revalida_up', 'resumo'].includes(l.resource_type) && page.status !== 'publish' && !(expect.unpublishedLinkOk || []).includes(l.id)) broken.push(`${l.id}: ${page.slug} não publicada`);
  }
  const known = new Set(expect.__baselineBroken || []);
  const fresh = broken.filter((b) => !known.has(b));
  check(`${label}: Meu Plano — ${S.links.length} vínculos; nenhum vínculo novo ou alterado leva a destino inexistente ou não publicado`, fresh.length === 0, fresh.slice(0, 10));
  if ('flashcard_group_id' in (S.links[0] || {})) {
    const fcNoGroup = S.links.filter((l) => l.resource_type === 'flashcards' && l.flashcard_group_id == null).length;
    check(`${label}: todos os vínculos de Flashcards têm identificador estável`, fcNoGroup === 0, fcNoGroup);
  }
  // Free 50-card deck
  const d0 = freeDeck(S0), d = freeDeck(S);
  check(`${label}: baralho gratuito — os mesmos 50 cartões, na mesma ordem`, JSON.stringify(d0) === JSON.stringify(d) && d.length === 50,
    JSON.stringify(d0) === JSON.stringify(d) ? `${d.length} cartões` : { removed: d0.filter((x) => !d.includes(x)), added: d.filter((x) => !d0.includes(x)) });
}

async function apply(db, files) {
  for (const f of files) {
    const p = path.isAbsolute(f) ? f : path.join(ROOT, f);
    await db.unsafe(fs.readFileSync(p, 'utf8'));
  }
  await db`notify pgrst, 'reload schema'`;
}

(async () => {
  const db = pg(URL, { max: 1, prepare: false, onnotice: () => {} });
  const [{ port }] = await db`select inet_server_port() port`;
  const [{ total, anon }] = await db`select count(*)::int total, count(*) filter (where email like '%@rehearsal.local')::int anon from profiles`;
  if (port !== 5432 || total === 0 || total !== anon) throw new Error('not the rehearsal copy — refusing to run');

  const F0 = await fingerprint(db); const S0 = await snapshot(db);
  report.baseline = { tables: Object.keys(F0).length, quiz: S0.quiz.length, cards: S0.cards.length, groups: S0.groups.length, audiocards: S0.audiocards.length, links: S0.links.length, review: S0.review.length };
  console.log('baseline', report.baseline);
  const fps = [F0];
  // links that ALREADY point at an unpublished section in production (reported, not caused by these patches)
  const baselineBroken = (() => { const pages = byId(S0.pages); return S0.links.filter((l) => {
    const p = pages.get(String(l.page_id)); return !p || (['quiz', 'flashcards', 'revalida_up'].includes(l.resource_type) && p.status !== 'publish'); })
    .map((l) => `${l.id}: ${pages.get(String(l.page_id))?.slug} não publicada`); })();
  report.baselineBrokenLinks = baselineBroken.map((b) => { const id = b.split(':')[0]; const l = S0.links.find((x) => String(x.id) === id);
    const t = S0.topics.find((x) => String(x.id) === String(l.topic_id)); return { link: id, topic: t?.name, type: l.resource_type, section: b.split(': ')[1].replace(' não publicada', '') }; });

  const g = (deck, label) => S0.groups.find((x) => x.deck === deck && x.label === label);
  const G = { time: g('cirurgia-geral-flashcards', 'Trauma e Infecções Musculoesqueléticas'), ai: g('reumatologia-flashcards', 'Artrite Infecciosa'),
    trmCG: g('cirurgia-geral-flashcards', 'Trauma Raquimedular'), coluna: g('neurologia-flashcards', 'Coluna Vertebral e Trauma Raquimedular') };
  const cgAfter = S0.groups.filter((x) => x.deck === 'cirurgia-geral-flashcards' && x.position > G.time.position).map((x) => x.id);
  const reumaAfter = S0.groups.filter((x) => x.deck === 'reumatologia-flashcards' && x.position > G.ai.position).map((x) => x.id);
  const outrosAfter = S0.groups.filter((x) => x.deck === 'outros-flashcards' && x.label !== 'Oftalmologia').map((x) => x.id);
  // cards whose own group, deck or position changes (groups that only shift place in a deck keep their cards)
  const orto = [G.time.id, G.ai.id];
  void cgAfter; void reumaAfter; void outrosAfter;
  const R2P = ['artrite-infecciosa: Artrite Infecciosa → Monoartrite Aguda'];
  const TRMP = [...R2P, 'trauma-raquimedular-revalida-up: Trauma Raquimedular Revalida Up → Trauma Raquimedular Revalida Up',
    'retirados-cirurgia-geral-flashcards: undefined → Cirurgia Geral Flashcards — materiais retirados (não publicados)',
    'retirados-cirurgia-geral-audiocards: undefined → Cirurgia Geral AudioCards — materiais retirados (não publicados)'];
  const EXPECT = {
    'R4b': {},
    'R1': {},
    'R2': { pages: R2P },
    'Ortopedia': { pages: R2P, movedGroups: orto },
    'TRM Cirurgia Geral (retirada)': { pages: TRMP, movedGroups: [...orto, G.trmCG.id], unpublishedAudiocards: ['Trauma Raquimedular'] },
    'Revalida Up (24 vínculos)': { pages: TRMP, movedGroups: [...orto, G.trmCG.id], unpublishedAudiocards: ['Trauma Raquimedular'] },
  };
  const LAST = EXPECT['Revalida Up (24 vínculos)'];

  // Karina's item 9 + the TRM/Revalida Up/new-topic specifics, on the final state.
  const finalChecks = (label, S) => {
    console.log(`
▶ ${label}: verificações específicas`);
    const gTotal0 = S0.groups.length;
    check(`${label}: grupos de Flashcards — ${S.groups.length} guardados (nenhum apagado); publicados ${S0.publishedGroups} → ${S.publishedGroups}`,
      S.groups.length === gTotal0 && S.publishedGroups === S0.publishedGroups - 1, { total: S.groups.length, published: S.publishedGroups });
    check(`${label}: nenhum áudio suspenso; situação da fonte única igual à de antes`, S.suspended === 0 && JSON.stringify(S.status) === JSON.stringify(S0.status), S.status);
    const trm = Object.fromEntries(S.trmLinks.map((l) => [l.resource_type, l]));
    check(`${label}: Trauma Raquimedular abre Questões de Coluna, Flashcards e Revalida Up de Neurologia (publicados)`,
      trm.quiz?.slug === 'patologias-da-coluna-vertebral' && trm.flashcards?.slug === 'neurologia-flashcards' && String(trm.flashcards?.flashcard_group_id) === String(G.coluna.id)
      && trm.revalida_up?.slug === 'coluna-vertebral-trauma-raquimedular-revalida-up' && S.trmLinks.every((l) => l.status === 'publish'), S.trmLinks);
    check(`${label}: Revalida Up sem tema — 25 antes, só "Trauma e Infecções Musculoesqueléticas" depois; nenhum vínculo inválido`,
      S0.ruUnlinkedRaw.length === 25 && S.ruCheck && S.ruCheck.length === 1 && S.ruCheck[0].issue === 'pagina_sem_tema' && String(S.ruCheck[0].page_id) === '91012', S.ruCheck);
    check(`${label}: 4 temas novos (Outros), incidência 1 cada, abrem Questões + Revalida Up + grupo da área`,
      S.newTopics.length === 4 && S.newTopics.every((t) => t.spec === 'outros' && t.incidence_count === 1 && /flashcards:outros-flashcards#\d+/.test(t.links) && /quiz:(otorrinolaringologia|urologia)\b/.test(t.links) && /revalida_up:(otorrinolaringologia|urologia)-revalida-up/.test(t.links)), S.newTopics);
    check(`${label}: R1 — todos os ${S.r1.records} registros publicados ligados à questão original; 27 classificações duvidosas mantidas para revisão; vínculos principais coerentes`,
      S.r1.records === S.r1.records_linked && S.r1.unlinked_records == null && S.r1.doubtful === 27 && S.r1.wrong_primary_links === 0 && (S.r1.new_topic_questions || '').split(', ').length === 4, S.r1);
  };

  // ── 1. apply, step by step ──
  for (const s of STEPS) {
    const t0 = Date.now(); await apply(db, s.apply);
    report.steps.push({ step: s.key, files: s.apply.map((f) => path.basename(f)), ms: Date.now() - t0 });
    console.log(`\napplied ${s.key} (${Date.now() - t0} ms)`);
    fps.push(await fingerprint(db));
    checkState(s.key, S0, await snapshot(db), { ...EXPECT[s.key], __baselineBroken: baselineBroken });
  }
  const SF = await snapshot(db);
  finalChecks('estado final', SF);
  report.final = {
    groups: SF.groups.length, outros: SF.groups.filter((x) => x.deck === 'outros-flashcards').sort((a, b) => a.position - b.position).map((x) => x.label),
    coluna: SF.cards.filter((c) => String(c.group_id) === String(G.coluna.id)).length, r1: SF.r1, audiocardStatus: SF.status,
    publishedGroups: { before: S0.publishedGroups, after: SF.publishedGroups }, suspended: SF.suspended, ruCheck: SF.ruCheck,
    ruUnlinkedBefore: S0.ruUnlinkedRaw.length, newTopics: SF.newTopics, trmLinks: SF.trmLinks,
    links: { before: S0.links.length, after: SF.links.length },
  };
  // the plan links that changed destination, for the report
  const l0 = new Map(S0.links.map((l) => [`${l.topic_id}|${l.resource_type}`, l]));
  report.final.linkChanges = SF.links.filter((l) => { const o = l0.get(`${l.topic_id}|${l.resource_type}`); return !o || String(o.page_id) !== String(l.page_id); })
    .filter((l) => l.resource_type !== 'resumo').map((l) => {
      const t = SF.topics.find((x) => String(x.id) === String(l.topic_id)); const o = l0.get(`${l.topic_id}|${l.resource_type}`);
      const pn = (id) => SF.pages.find((p) => String(p.id) === String(id))?.slug;
      return { topic: t?.name, type: l.resource_type, from: o ? pn(o.page_id) : '(novo)', to: pn(l.page_id) };
    });
  report.final.resumoLinksAdded = SF.links.filter((l) => l.resource_type === 'resumo').length;

  // ── 2. re-run the re-runnable steps: nothing may change ──
  console.log('\n▶ re-run test');
  const before = await fingerprint(db);
  for (const s of STEPS.filter((x) => x.rerun)) await apply(db, s.apply);
  const d = diffFp(before, await fingerprint(db));
  report.rerun = d;
  check('reexecução de todas as etapas não altera nada', d.length === 0, d);

  // ── 3. rollback chain: each rollback must land EXACTLY on the state before its step ──
  console.log('\n▶ rollback chain');
  for (let i = STEPS.length - 1; i >= 0; i--) {
    await apply(db, STEPS[i].rollback);
    const dd = diffFp(fps[i], await fingerprint(db));
    report.rollback.push({ step: STEPS[i].key, identicalToStateBefore: dd.length === 0, diff: dd });
    check(`reversão de ${STEPS[i].key} volta exatamente ao estado anterior`, dd.length === 0, dd);
  }
  const dz = diffFp(F0, await fingerprint(db));
  check('depois de todas as reversões, o banco é idêntico à cópia da produção', dz.length === 0, dz);

  // ── 4. re-apply everything (final state for the screen tests) ──
  // A second application stamps new timestamps and log ids, so the comparison is semantic: every safety
  // check again, and the same final organisation (groups, Outros, Coluna, links, R1 coverage, statuses).
  for (const s of STEPS) await apply(db, s.apply);
  const SR = await snapshot(db);
  checkState('reaplicação completa', S0, SR, { ...LAST, __baselineBroken: baselineBroken });
  finalChecks('reaplicação completa', SR);
  const summary = (S) => ({ groups: S.groups.map((x) => `${x.id}@${x.deck}#${x.position}`).sort(), cards: S.cards.map((c) => `${c.id}:${c.group_id}:${c.position}`).sort(),
    // new topics get new ids on a second application → compare links by topic SLUG
    links: S.links.map((l) => `${S.topics.find((t) => String(t.id) === String(l.topic_id))?.slug}|${l.resource_type}|${l.page_id}|${l.flashcard_group_id ?? ''}`).sort(), r1: S.r1, status: S.status,
    topics: S.topics.map((t) => `${t.slug}|${t.name}|${t.specialty_id}|${t.source_page_id}`).sort() });
  const sameFinal = JSON.stringify(summary(SR)) === JSON.stringify(summary(SF));
  check('reaplicação completa reproduz a mesma organização final (grupos, cartões, vínculos, temas, R1, status)', sameFinal);

  report.finished = new Date().toISOString();
  report.failures = failures;
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} — report: ${REPORT}`);
  await db.end();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message, e.detail || '', e.where || ''); process.exit(2); });
