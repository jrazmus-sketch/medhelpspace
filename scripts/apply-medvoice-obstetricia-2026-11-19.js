#!/usr/bin/env node
'use strict';
/**
 * MedVoice — Karina's definitive scripts and recordings of Obstetrícia (her e-mail of 19/11/2026, 01h08, item 2).
 * ONE transaction; lessons are found by page + title (ids differ between databases); nothing is deleted or created.
 *
 *   node scripts/apply-medvoice-obstetricia-2026-11-19.js --db <url> [--apply] [--report <file>]
 *   node scripts/apply-medvoice-obstetricia-2026-11-19.js --prod [--apply] [--report <file>]
 * Without --apply everything runs and is rolled back. Inputs (gitignored, her content):
 * parsed/medvoice-obstetricia-2026-11-19/delivery.json (script → lesson, text, recording) and audio-urls.json
 * (recordings already on Bunny under MedVoice-Audio/v2/obstetricia — a new folder, so no cached old file is played).
 *
 * Rules (same as apply-medvoice-2026-11-18.js):
 *   • every lesson is UPDATED IN PLACE (same id): lesson_completions and lesson_progress CASCADE on delete, and the
 *     Meu Plano links point at the lesson id. Title, page and position stay; text, recording and its length change;
 *   • HELD lessons are left exactly as they are (old text with its old recording, which still match):
 *       – "Sífilis E Gestação" came WITHOUT its recording — never a new text over an old audio;
 *       – "Prematuridade": at 01:46 the narration check hears "36 horas e 6 dias" (twice, also on the clip alone) where the
 *         script reads "trinta e seis e seis dias" — held for Karina to listen to before it is published;
 *   • the MedVoice of every other specialty is not touched.
 * Rollback: scripts/rollback-medvoice-obstetricia-2026-11-19.sql.
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
const TAG = 'medvoice_obst_20261119';
const PAGE = 'obstetricia-medvoice';
const EXPECT_LESSONS = 16;
const HELD = ['Sífilis E Gestação', 'Prematuridade'];
const EXPECT_DELIVERED = 16 - HELD.length;

(async () => {
  const dir = path.join(ROOT, 'parsed', 'medvoice-obstetricia-2026-11-19');
  const delivery = JSON.parse(fs.readFileSync(path.join(dir, 'delivery.json'), 'utf8'));
  const urls = new Map(JSON.parse(fs.readFileSync(path.join(dir, 'audio-urls.json'), 'utf8')).map((a) => [`${a.page}|${a.stem}`, a]));
  const lessons = delivery.lessons.filter((l) => !HELD.includes(l.title)).map((l) => ({ ...l, audio: urls.get(`${l.page}|${l.stem}`) }));
  if (lessons.length !== EXPECT_DELIVERED || lessons.some((l) => l.page !== PAGE || l.new || !l.audio || l.audio.cdn_status !== 200 || l.audio.cdn_bytes !== l.audio_bytes || !/\/MedVoice-Audio\/v2\/obstetricia\//.test(l.audio.audio_url))) {
    throw new Error(`expected ${EXPECT_DELIVERED} lessons of ${PAGE}, each with its recording verified on the CDN`);
  }

  const sql = postgres(URL, { max: 1, prepare: false, onnotice: () => {} });
  const out = { database: PROD ? 'production' : URL.replace(/.*@/, ''), applied: APPLY };
  try {
    await sql.begin(async (tx) => {
      const one = async (q) => (await q)[0];
      const page = await one(tx`select id, status from pages where slug = ${PAGE}`);
      if (!page || page.status !== 'publish') throw new Error(`${PAGE} not found published`);

      // ── guards ────────────────────────────────────────────────────────────────────────────────────────────
      const before = await tx`select id, position, title, body_html, audio_url, audio_duration_seconds dur from lessons where page_id = ${page.id} order by position`;
      if (before.some((l) => /\/MedVoice-Audio\/v2\//.test(l.audio_url || ''))) throw new Error('this delivery is already applied here (a lesson plays a v2 recording) - nothing changed');
      if (before.length !== EXPECT_LESSONS) throw new Error(`${PAGE} has ${before.length} lessons, expected ${EXPECT_LESSONS} - nothing changed`);
      const find = (title) => before.filter((l) => l.title === title);
      for (const l of lessons) if (find(l.title).length !== 1) throw new Error(`lesson "${l.title}" found ${find(l.title).length} times`);
      for (const t of HELD) if (find(t).length !== 1) throw new Error(`held lesson "${t}" not found exactly once`);
      const targets = new Set(lessons.map((l) => String(find(l.title)[0].id)));
      if (targets.size !== EXPECT_DELIVERED) throw new Error('the delivery does not cover the lessons one to one');

      const md5 = async (q) => (await one(q)).h;
      const others = () => md5(tx`select md5(coalesce(string_agg(l.id || '|' || l.page_id || '|' || l.position || '|' || l.title || '|' || md5(l.body_html) || '|' || coalesce(l.audio_url, '') || '|' || coalesce(l.audio_duration_seconds::text, ''), '~' order by l.id), '')) h
        from lessons l where l.page_id <> ${page.id}`);
      const held = () => md5(tx`select md5(coalesce(string_agg(l.id || '|' || l.position || '|' || l.title || '|' || md5(l.body_html) || '|' || coalesce(l.audio_url, '') || '|' || coalesce(l.audio_duration_seconds::text, '') || '|' || l.updated_at, '~' order by l.id), '')) h
        from lessons l where l.page_id = ${page.id} and l.title = any(${HELD})`);
      const history = () => one(tx`select
        (select count(*)::int from lesson_completions) completions, (select md5(coalesce(string_agg(lc.user_id || '|' || lc.lesson_id || '|' || lc.completed_at, '~' order by lc.user_id, lc.lesson_id), '')) from lesson_completions lc) completions_h,
        (select count(*)::int from lesson_progress) progress, (select md5(coalesce(string_agg(lp.user_id || '|' || lp.lesson_id || '|' || lp.position_seconds || '|' || lp.updated_at, '~' order by lp.user_id, lp.lesson_id), '')) from lesson_progress lp) progress_h`);
      const links = () => md5(tx`select md5(coalesce(string_agg(c.id || '|' || c.topic_id || '|' || c.resource_type || '|' || coalesce(c.page_id::text, '') || '|' || coalesce(c.question_filter::text, '') || '|' || coalesce(c.flashcard_group_id::text, ''), '~' order by c.id), '')) h from topic_content c`);
      const othersBefore = await others(), heldBefore = await held(), historyBefore = await history(), linksBefore = await links();

      // ── backup (once: a re-run keeps the ORIGINAL state) ─────────────────────────────────────────────────
      await tx.unsafe(`create table if not exists lessons_bk_${TAG} as select l.* from lessons l join pages p on p.id = l.page_id where p.slug = '${PAGE}'`);
      await tx.unsafe(`alter table lessons_bk_${TAG} enable row level security`);
      await tx.unsafe(`revoke all on lessons_bk_${TAG} from public, anon, authenticated`);

      // ── the 15 lessons, in place ─────────────────────────────────────────────────────────────────────────
      out.updated = [];
      for (const l of lessons) {
        const cur = find(l.title)[0];
        await tx`update lessons set body_html = ${l.body_html}, audio_url = ${l.audio.audio_url}, audio_added_at = now(), audio_duration_seconds = ${l.duration_seconds} where id = ${cur.id}`;
        out.updated.push({ title: l.title, lesson_id: String(cur.id), script: l.script, audio_before: cur.audio_url, audio_url: l.audio.audio_url, duration_before: cur.dur, duration_seconds: l.duration_seconds });
      }

      // ── checks ───────────────────────────────────────────────────────────────────────────────────────────
      const checks = [];
      const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail: String(detail) }); };
      const after = await tx`select id, position, title, body_html, audio_url, audio_duration_seconds dur, audio_unavailable from lessons where page_id = ${page.id} order by position`;
      const byTitle = new Map(after.map((l) => [l.title, l]));
      const delivered = lessons.map((l) => ({ l, row: byTitle.get(l.title) }));
      check(`As ${EXPECT_DELIVERED} aulas têm exatamente o roteiro entregue`, delivered.every((d) => d.row && d.row.body_html === d.l.body_html), `${delivered.filter((d) => d.row && d.row.body_html === d.l.body_html).length} de ${EXPECT_DELIVERED}`);
      check(`As ${EXPECT_DELIVERED} aulas tocam a gravação nova (pasta v2), com a duração medida`, delivered.every((d) => d.row && d.row.audio_url === d.l.audio.audio_url && d.row.dur === d.l.duration_seconds && !d.row.audio_unavailable), `${delivered.length} aulas`);
      check('Sífilis e Gestação e Prematuridade sem nenhuma alteração (roteiro e gravação atuais, que continuam correspondentes)', (await held()) === heldBefore, HELD.join(', '));
      const kept = before.every((b) => { const a = after.find((x) => String(x.id) === String(b.id)); return a && a.title === b.title && a.position === b.position; });
      check('Nenhuma aula criada ou apagada: as 16 aulas mantêm identificador, título e posição', kept && after.length === EXPECT_LESSONS, `${before.length} → ${after.length} aulas`);
      check('Nenhuma aula duplicada', new Set(after.map((l) => l.title)).size === after.length, 'títulos únicos');
      check('Meu Plano: nenhum vínculo criado, alterado ou removido', (await links()) === linksBefore, 'vínculos idênticos');
      const dead = await tx`select t.slug from topic_content c join topics t on t.id = c.topic_id
        left join study_plan_medvoice_lessons v on v.lesson_id = (c.question_filter->>'lesson_id')::bigint
        where c.resource_type = 'medvoice' and c.page_id = ${page.id} and (v.lesson_id is null or not v.has_audio or v.duration_seconds is null)`;
      check('Meu Plano: todo vínculo de MedVoice de Obstetrícia abre aula publicada, com gravação e duração', dead.length === 0, dead.map((d) => d.slug).join(', ') || 'todos conferem');
      const h = await history();
      check('Histórico dos alunos (aulas concluídas e ponto de escuta) sem nenhuma alteração', JSON.stringify(h) === JSON.stringify(historyBefore), `${h.completions} conclusões, ${h.progress} pontos de escuta`);
      check('MedVoice das demais especialidades e todas as outras aulas sem nenhuma alteração', (await others()) === othersBefore, 'todas as aulas fora de Obstetrícia');
      out.checks = checks;
      out.totals = { before: before.length, after: after.length, updated: out.updated.length };
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
  console.log(`${out.database}: ${APPLY ? 'APPLIED' : 'rehearsed and rolled back'} — ${out.updated.length} lessons updated in place`);
  for (const c of out.checks) console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${c.name} (${c.detail})`);
})().catch((e) => { console.error(e); process.exit(1); });
