#!/usr/bin/env node
'use strict';
/**
 * MedVoice — Karina's definitive scripts and recordings of Cirurgia Geral, Emergência and Ginecologia (her e-mail of
 * 18/11/2026, 19h19, item 8). ONE transaction; lessons are found by page + title (ids differ between databases);
 * nothing is deleted.
 *
 *   node scripts/apply-medvoice-2026-11-18.js --db <url> [--apply]     # a local / rehearsal database
 *   node scripts/apply-medvoice-2026-11-18.js --prod [--apply]         # production (app/.env.local DATABASE_URL)
 * Without --apply everything runs and is rolled back. Inputs (gitignored, her content):
 * parsed/medvoice-2026-11-18/delivery.json (script → lesson, text, recording) and audio-urls.json (recordings already
 * on Bunny under MedVoice-Audio/v2 — a new folder, so no cached old file is ever played).
 *
 * Rules:
 *   • every lesson is UPDATED IN PLACE (same id): lesson_completions and lesson_progress CASCADE on delete, and the
 *     Meu Plano links point at the lesson id. Title, page and address stay; text, recording and its length change;
 *   • two old lessons held TWO scripts under one recording (Diverticulite + Diverticulite complicada; Hérnia + Hérnia
 *     estrangulada). She now sent each script with its own recording: the old lesson keeps the first, and the second
 *     becomes a new lesson right after it (one lesson = one recording). No lesson is duplicated;
 *   • the MedVoice of every other specialty is not touched.
 * Rollback: scripts/rollback-medvoice-2026-11-18.sql.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const postgres = require(path.join(ROOT, 'node_modules', 'postgres'));

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
const TAG = 'medvoice_20261118';
/** Lessons each page has before this run — a different number means the base moved since the plan: stop. */
const EXPECT = { 'cirurgia-geral-medvoice': 24, 'emergencia-medvoice': 5, 'ginecologia-medvoice': 18 };
const PAGES = Object.keys(EXPECT);

(async () => {
  const dir = path.join(ROOT, 'parsed', 'medvoice-2026-11-18');
  const delivery = JSON.parse(fs.readFileSync(path.join(dir, 'delivery.json'), 'utf8'));
  const urls = new Map(JSON.parse(fs.readFileSync(path.join(dir, 'audio-urls.json'), 'utf8')).map((a) => [`${a.page}|${a.stem}`, a]));
  const lessons = delivery.lessons.map((l) => ({ ...l, audio: urls.get(`${l.page}|${l.stem}`) }));
  if (lessons.length !== 49 || lessons.some((l) => !l.audio || l.audio.cdn_status !== 200 || l.audio.cdn_bytes !== l.audio_bytes || !/\/MedVoice-Audio\/v2\//.test(l.audio.audio_url))) {
    throw new Error('expected 49 lessons, each with its recording verified on the CDN');
  }

  const sql = postgres(URL, { max: 1, prepare: false, onnotice: () => {} });
  const out = { database: PROD ? 'production' : URL.replace(/.*@/, ''), applied: APPLY };
  try {
    await sql.begin(async (tx) => {
      const one = async (q) => (await q)[0];
      const pages = await tx`select id, slug, status from pages where slug = any(${PAGES})`;
      if (pages.length !== 3 || pages.some((p) => p.status !== 'publish')) throw new Error('the three MedVoice pages were not found published');
      const pageId = new Map(pages.map((p) => [p.slug, p.id]));
      const ids = pages.map((p) => p.id);

      // ── guards ────────────────────────────────────────────────────────────────────────────────────────────
      const before = await tx`select l.id, l.page_id, l.position, l.title, l.audio_url, p.slug page from lessons l join pages p on p.id = l.page_id where l.page_id = any(${ids}) order by p.slug, l.position`;
      if (before.some((l) => /\/MedVoice-Audio\/v2\//.test(l.audio_url || ''))) throw new Error('this delivery is already applied here (a lesson plays a v2 recording) - nothing changed');
      for (const [slug, n] of Object.entries(EXPECT)) {
        const have = before.filter((l) => l.page === slug).length;
        if (have !== n) throw new Error(`${slug} has ${have} lessons, expected ${n} - nothing changed`);
      }
      const find = (page, title) => before.filter((l) => l.page === page && l.title === title);
      for (const l of lessons) {
        const hit = find(l.page, l.title);
        if (l.new && hit.length) throw new Error(`"${l.title}" already exists on ${l.page}`);
        if (!l.new && hit.length !== 1) throw new Error(`lesson "${l.title}" found ${hit.length} times on ${l.page}`);
        if (l.new && find(l.page, l.after).length !== 1) throw new Error(`lesson "${l.after}" (the one "${l.title}" comes after) not found on ${l.page}`);
      }
      const targets = lessons.filter((l) => !l.new).map((l) => find(l.page, l.title)[0].id);
      if (new Set(targets).size !== 47 || before.length !== 47) throw new Error('the delivery does not cover the 47 lessons of the three pages one to one');
      const md5 = async (q) => (await one(q)).h;
      const others = () => md5(tx`select md5(coalesce(string_agg(l.id || '|' || l.page_id || '|' || l.position || '|' || l.title || '|' || md5(l.body_html) || '|' || coalesce(l.audio_url, '') || '|' || coalesce(l.audio_duration_seconds::text, ''), '~' order by l.id), '')) h
        from lessons l where l.page_id <> all(${ids})`);
      const history = () => one(tx`select
        (select count(*)::int from lesson_completions) completions, (select md5(coalesce(string_agg(lc.user_id || '|' || lc.lesson_id || '|' || lc.completed_at, '~' order by lc.user_id, lc.lesson_id), '')) from lesson_completions lc) completions_h,
        (select count(*)::int from lesson_progress) progress, (select md5(coalesce(string_agg(lp.user_id || '|' || lp.lesson_id || '|' || lp.position_seconds || '|' || lp.updated_at, '~' order by lp.user_id, lp.lesson_id), '')) from lesson_progress lp) progress_h`);
      const links = () => md5(tx`select md5(coalesce(string_agg(c.id || '|' || c.topic_id || '|' || c.resource_type || '|' || coalesce(c.page_id::text, '') || '|' || coalesce(c.question_filter::text, '') || '|' || coalesce(c.flashcard_group_id::text, ''), '~' order by c.id), '')) h from topic_content c`);
      const othersBefore = await others(), historyBefore = await history(), linksBefore = await links();

      // ── backups (once: a re-run keeps the ORIGINAL state) ────────────────────────────────────────────────
      await tx.unsafe(`create table if not exists lessons_bk_${TAG} as select l.* from lessons l join pages p on p.id = l.page_id where p.slug in (${PAGES.map((s) => `'${s}'`).join(', ')})`);
      await tx.unsafe(`alter table lessons_bk_${TAG} enable row level security`);
      await tx.unsafe(`revoke all on lessons_bk_${TAG} from public, anon, authenticated`);

      // ── new lessons: right after the lesson they were part of ────────────────────────────────────────────
      out.created = [];
      for (const l of lessons.filter((x) => x.new)) {
        const pid = pageId.get(l.page);
        const parent = await one(tx`select id, position from lessons where page_id = ${pid} and title = ${l.after}`);
        // UNIQUE (page_id, position) is not deferrable: move the following lessons through negative positions.
        await tx`update lessons set position = -(position + 1) where page_id = ${pid} and position > ${parent.position}`;
        await tx`update lessons set position = -position where page_id = ${pid} and position < 0`;
        const [row] = await tx`insert into lessons (page_id, position, title, body_html, audio_url, audio_added_at, audio_duration_seconds)
          values (${pid}, ${parent.position + 1}, ${l.title}, ${l.body_html}, ${l.audio.audio_url}, now(), ${l.duration_seconds}) returning id`;
        out.created.push({ page: l.page, title: l.title, after: l.after, lesson_id: String(row.id), position: parent.position + 1 });
      }

      // ── the 47 lessons, in place ─────────────────────────────────────────────────────────────────────────
      out.updated = [];
      for (const l of lessons.filter((x) => !x.new)) {
        const cur = find(l.page, l.title)[0];
        await tx`update lessons set body_html = ${l.body_html}, audio_url = ${l.audio.audio_url}, audio_added_at = now(), audio_duration_seconds = ${l.duration_seconds} where id = ${cur.id}`;
        out.updated.push({ page: l.page, title: l.title, lesson_id: String(cur.id), script: l.script, audio_before: cur.audio_url, audio_url: l.audio.audio_url, duration_seconds: l.duration_seconds });
      }

      // ── checks ───────────────────────────────────────────────────────────────────────────────────────────
      const checks = [];
      const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail: String(detail) }); };
      const after = await tx`select l.id, l.page_id, l.position, l.title, l.body_html, l.audio_url, l.audio_duration_seconds dur, l.audio_unavailable, p.slug page
        from lessons l join pages p on p.id = l.page_id where l.page_id = any(${ids}) order by p.slug, l.position`;
      const byKey = new Map(after.map((l) => [`${l.page}|${l.title}`, l]));
      const delivered = lessons.map((l) => ({ l, row: byKey.get(`${l.page}|${l.title}`) }));
      check('As 49 aulas têm exatamente o roteiro entregue', delivered.every((d) => d.row && d.row.body_html === d.l.body_html), `${delivered.filter((d) => d.row && d.row.body_html === d.l.body_html).length} de 49`);
      check('As 49 aulas tocam a gravação nova (pasta v2), com a duração medida', delivered.every((d) => d.row && d.row.audio_url === d.l.audio.audio_url && d.row.dur === d.l.duration_seconds && !d.row.audio_unavailable), `${delivered.length} aulas`);
      const count = (slug) => after.filter((l) => l.page === slug).length;
      check('Aulas por página: Cirurgia Geral 26, Emergência 5, Ginecologia 18', count('cirurgia-geral-medvoice') === 26 && count('emergencia-medvoice') === 5 && count('ginecologia-medvoice') === 18,
        PAGES.map((s) => `${s.replace('-medvoice', '')} ${count(s)}`).join(', '));
      const kept = before.every((b) => { const a = after.find((x) => String(x.id) === String(b.id)); return a && a.title === b.title && String(a.page_id) === String(b.page_id); });
      check('Nenhuma aula apagada: as 47 aulas anteriores continuam com o mesmo identificador, título e página', kept && after.length === 49, `${before.length} → ${after.length} aulas`);
      const dupTitle = PAGES.some((s) => { const t = after.filter((l) => l.page === s).map((l) => l.title); return new Set(t).size !== t.length; });
      check('Nenhuma aula duplicada', !dupTitle, 'títulos únicos em cada página');
      const contiguous = PAGES.every((s) => after.filter((l) => l.page === s).every((l, i) => l.position === i + 1));
      check('Ordem das aulas contínua; as duas aulas novas ficam logo depois de Diverticulite e de Hérnia', contiguous && out.created.every((c) => {
        const a = after.find((x) => String(x.id) === c.lesson_id); const p = after.find((x) => x.page === c.page && x.title === c.after); return a.position === p.position + 1;
      }), out.created.map((c) => `${c.title} na posição ${c.position}`).join('; '));
      check('Meu Plano: nenhum vínculo criado, alterado ou removido', (await links()) === linksBefore, 'vínculos idênticos');
      const dead = await tx`select t.slug from topic_content c join topics t on t.id = c.topic_id join pages p on p.id = c.page_id
        left join study_plan_medvoice_lessons v on v.lesson_id = (c.question_filter->>'lesson_id')::bigint
        where c.resource_type = 'medvoice' and p.slug = any(${PAGES}) and (v.lesson_id is null or not v.has_audio or v.duration_seconds is null)`;
      check('Meu Plano: todo vínculo de MedVoice das três especialidades abre aula publicada, com gravação e duração', dead.length === 0, dead.map((d) => d.slug).join(', ') || 'todos conferem');
      const h = await history();
      check('Histórico dos alunos (aulas concluídas e ponto de escuta) sem nenhuma alteração', JSON.stringify(h) === JSON.stringify(historyBefore), `${h.completions} conclusões, ${h.progress} pontos de escuta`);
      check('MedVoice das demais especialidades e todas as outras aulas sem nenhuma alteração', (await others()) === othersBefore, 'todas as aulas fora das três páginas');
      out.checks = checks;
      out.totals = { before: before.length, after: after.length };
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
  console.log(`${out.database}: ${APPLY ? 'APPLIED' : 'rehearsed and rolled back'} — ${out.updated.length} lessons updated in place, ${out.created.length} created`);
  for (const c of out.checks) console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${c.name} (${c.detail})`);
})().catch((e) => { console.error(e); process.exit(1); });
