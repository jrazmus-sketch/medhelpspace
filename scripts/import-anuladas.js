'use strict';
/**
 * import-anuladas.js — loads the 32 annulled questions Karina sent as one .txt
 * ("Questoes anuladas que faltam", 2026-09-22), each now carrying the defensible answer
 * she agreed to use for study: "✔ Gabarito oficial: questão anulada. Alternativa mais
 * defensável para estudo: (B)".
 *
 *   node scripts/import-anuladas.js                     # DRY RUN (PROD via app/.env.local)
 *   node scripts/import-anuladas.js --apply
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/import-anuladas.js --apply
 *   ANULADAS_TXT="C:/path/to/file.txt" node scripts/import-anuladas.js
 *
 * An annulled question has no official answer, so the September import DROPPED all 32
 * (a question the student cannot answer is worse than none). 18 of them were already live
 * in their June form and stayed; 14 were not on the platform at all.
 *
 *   live (number@year in the same specialty) → UPDATE in place: the row id survives, so
 *                                              attempts and review state stay attached.
 *   not live → INSERT into the topic the parser recorded when it dropped it
 *              (parsed/questoes-dropped.json), then the page is re-ordered chronologically.
 *
 * The heading says "· Anulada", like every other annulled question on the platform, so the
 * student is told what they are looking at before they answer.
 */
const fs = require('fs');
const path = require('path');

const TXT = process.env.ANULADAS_TXT ||
  'C:/Users/jrazm/OneDrive/Desktop/Medhelpspace/09-22-2026/recontedonoarhoje6perguntasanuladasimagensfl/Questoes anuladas que faltam .txt';
const DROPPED = path.join(__dirname, '..', 'parsed', 'questoes-dropped.json');

function loadEnvLocal() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slugify = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const HEAD_RE = /Quest[aã]o\s+0*(\d+)[^<]{0,8}?Revalida\s+(20\d\d(?:\.[12])?)/;
const chrono = (y, n) => [y ? parseFloat(y) : 9999, +n];

// Same shape as scripts/parse-questoes.js, so these read exactly like every other question.
function explanationTextToHtml(lines) {
  const out = []; let buf = []; let kind = null;
  const flush = () => {
    if (!buf.length) return;
    const cls = kind === '🟣' ? ' class="resumo"' : kind === '❌' ? ' class="pega"' : kind === '✔' ? ' class="certo"' : '';
    out.push(`<ul${cls}>${buf.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`);
    buf = []; kind = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const m = line.match(/^([●🟣❌✔])\uFE0F?\s*(.*)$/u);
    if (m) { if (kind && kind !== m[1]) flush(); kind = m[1]; if (m[2].trim()) buf.push(m[2].trim()); continue; }
    flush();
    if (/^(?:🟪\s*)?Coment[aá]rio:?$/iu.test(line)) out.push('<h4>Comentário:</h4>');
    else if (/:\.?$/.test(line)) out.push(`<h4>${escapeHtml(line.replace(/^[🟪🟣]\s*/u, '').replace(/:\.$/, ':'))}</h4>`);
    else out.push(`<p>${escapeHtml(line)}</p>`);
  }
  flush();
  return out.join('\n');
}

function parseTxt(text, knownSpecs) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const heads = [];
  lines.forEach((l, i) => { const m = l.trim().match(/^Quest[aã]o\s+0*(\d+)\s*\(Revalida\s+([\d.]+)\)/); if (m) heads.push({ i, number: m[1], year: m[2] }); });
  const out = [];
  heads.forEach((h, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].i : lines.length;
    // Section heading: the nearest specialty name above this question. The file groups
    // several questions under one heading, so this scans past the ones in between.
    let spec = null;
    for (let i = h.i - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (!t) continue;
      if (knownSpecs.has(slugify(t))) { spec = slugify(t); break; }
    }
    const body = lines.slice(h.i + 1, end);
    const stem = []; const options = []; let correct = null; const expl = [];
    let phase = 'stem';
    for (const raw of body) {
      const line = raw.trim();
      const opt = line.match(/^\(([A-E])\)\s*(.+)$/);
      // Two shapes: one line ("✔ Gabarito oficial: questão anulada. Alternativa mais
      // defensável para estudo: (B)") or that sentence split over two lines.
      const gab = line.match(/mais defens[aá]vel para estudo:\s*\(([A-E])\)/i);
      const gabOnly = /^✔?\s*Gabarito oficial:/i.test(line);
      if (gab) { correct = gab[1]; phase = 'expl'; continue; }
      if (gabOnly) { phase = 'expl'; continue; }
      if (opt && phase !== 'expl') { options.push({ letter: opt[1], text: opt[2].trim() }); phase = 'options'; continue; }
      if (phase === 'expl') { expl.push(line); continue; }
      if (phase === 'options') { if (line) options[options.length - 1].text += ' ' + line; continue; }
      if (line) stem.push(line);
    }
    out.push({ spec, number: h.number, year: h.year, stem, options, correct, expl });
  });
  return out;
}

(async () => {
  loadEnvLocal();
  const apply = process.argv.includes('--apply');
  if (!fs.existsSync(TXT)) { console.error(`✗ file not found: ${TXT}`); process.exit(1); }
  const dropped = JSON.parse(fs.readFileSync(DROPPED, 'utf8'));
  const reconAll = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parsed', 'questoes-reconciliation.json'), 'utf8'));
  const recon = [...(reconAll.refresh || []), ...(reconAll.rename || []), ...(reconAll.moved || []), ...(reconAll.create || [])];

  const postgres = require('postgres');
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL missing'); process.exit(1); }
  const target = url.includes('127.0.0.1') ? 'LOCAL' : 'PROD';
  const db = postgres(url, { max: 1, prepare: false, ssl: target === 'LOCAL' ? false : 'require', onnotice: () => {} });

  try {
    const specs = new Set((await db`SELECT slug FROM specialties`).map((s) => s.slug));
    const parsed = parseTxt(fs.readFileSync(TXT, 'utf8'), specs);
    const live = await db`
      SELECT q.id, q.page_id, q.position, q.question, p.slug, s.slug AS spec
      FROM quiz_questions q JOIN pages p ON p.id = q.page_id JOIN specialties s ON s.id = p.specialty_id
      WHERE p.view = 'quiz' AND p.type = 'h5p-quiz' AND p.status = 'publish' AND p.track_id IS NULL AND p.content_module_id IS NULL`;
    const liveKey = new Map();
    for (const r of live) { const m = r.question.match(HEAD_RE); if (m) liveKey.set(`${r.spec}|${+m[1]}@${m[2]}`, r); }
    const pageBySlug = new Map((await db`SELECT id, slug FROM pages WHERE view = 'quiz' AND type = 'h5p-quiz'`).map((p) => [p.slug, p.id]));

    const problems = []; const updates = []; const inserts = []; const skipped = [];
    for (const q of parsed) {
      const where = `${q.spec || '?'} Q${q.number} ${q.year}`;
      if (!q.spec) { problems.push(`${where}: no specialty heading above it`); continue; }
      // She left some annulled questions with no defensible alternative. Those stay exactly
      // as they are on the platform (they are live with June's answer) — never imported
      // answerless, which would make them unanswerable.
      if (!q.correct) { skipped.push(where); continue; }
      if (q.options.length < 4) { problems.push(`${where}: ${q.options.length} options`); continue; }
      if (!q.options.some((o) => o.letter === q.correct)) { problems.push(`${where}: answer (${q.correct}) is not among the options`); continue; }
      if (!q.stem.length) { problems.push(`${where}: empty stem`); continue; }
      const prov = `Questão ${q.number} · Revalida ${q.year} · Anulada`;
      const question = `<h3><strong>${escapeHtml(prov)}</strong></h3>\n${q.stem.map((l) => `<p>${escapeHtml(l)}</p>`).join('\n')}`;
      const answers = q.options.map((o) => ({ text: `<div><strong>(${o.letter}) ${escapeHtml(o.text)}</strong></div>`, correct: o.letter === q.correct, feedback: '' }));
      const explanation_html = explanationTextToHtml(q.expl) || null;
      const row = { question, answers, explanation_html };

      // The file lists the 14 missing ones under their specialty, then the 18 already-live
      // ones under a single heading — so the heading alone cannot place a question. Match on
      // (number, exam year): inside the section's specialty first, then platform-wide, and
      // only accept a platform-wide match when it is unambiguous.
      const key = `${+q.number}@${q.year}`;
      let hit = liveKey.get(`${q.spec}|${key}`);
      if (!hit) {
        const cands = [...liveKey.entries()].filter(([k]) => k.endsWith(`|${key}`)).map(([, v]) => v);
        if (cands.length === 1) hit = cands[0];
        else if (cands.length > 1) {
          // Two topics can hold the same exam question (Sífilis na Gestação / Congênita
          // both carry Q78 2022.2, and her file sends one entry for each). Pick the copy
          // whose stem matches — by shared words, since the wording was lightly edited.
          const words = (t) => new Set(String(t).replace(/<[^>]+>/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4));
          const mine = words(q.stem.join(' '));
          const scored = cands.map((c) => {
            const theirs = words(c.question);
            const shared = [...mine].filter((w) => theirs.has(w)).length;
            return { c, score: shared / Math.max(1, Math.min(mine.size, theirs.size)) };
          }).sort((a, b) => b.score - a.score);
          if (scored[0].score >= 0.5 && scored[0].score - scored[1].score >= 0.1) hit = scored[0].c;
          else if (scored.every((x) => x.score >= 0.9)) {
            // The very same exam question is cross-listed under two topics (Sífilis na
            // Gestação and Sífilis Congênita both carry Q78 2022.2). Update every copy, or
            // the student would meet one fixed and one unanswerable.
            scored.forEach((x) => updates.push({ ...row, id: x.c.id, slug: x.c.slug, where: `${where} (cross-listed)`, pageId: x.c.page_id, number: q.number, year: q.year }));
            continue;
          }
          else { problems.push(`${where}: ${cands.length} live questions share Q${q.number} ${q.year} (${scored.map((x) => `${x.c.slug} ${(x.score * 100).toFixed(0)}%`).join(', ')})`); continue; }
        }
      }
      if (hit) { updates.push({ ...row, id: hit.id, slug: hit.slug, where, pageId: hit.page_id, number: q.number, year: q.year }); continue; }
      let d = dropped.find((x) => x.spec === q.spec && +x.number === +q.number && x.year === q.year);
      if (!d) {
        const cands = dropped.filter((x) => +x.number === +q.number && x.year === q.year);
        if (cands.length === 1) d = cands[0];
        else if (cands.length > 1) { problems.push(`${where}: ${cands.length} dropped questions share it (${cands.map((c) => c.topicSlug).join(', ')})`); continue; }
      }
      if (!d) { problems.push(`${where}: not live and not in parsed/questoes-dropped.json — cannot place it`); continue; }
      // Her file names do not always match the live address; the reconciliation maps them.
      const rec = recon.find((r) => r.spec === d.spec && r.localSlug === d.topicSlug);
      const pageId = (rec && rec.liveId) || pageBySlug.get(d.topicSlug) || pageBySlug.get(`${d.topicSlug}-quiz`);
      if (!pageId) { problems.push(`${where}: topic '${d.topicSlug}' has no page`); continue; }
      inserts.push({ ...row, pageId, slug: (rec && rec.liveSlug) || d.topicSlug, where, number: q.number, year: q.year });
    }

    console.log(`\n=== import-anuladas  [target: ${target}]  ${apply ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`  file: ${path.basename(TXT)}   questions read: ${parsed.length}`);
    console.log(`  UPDATE (already live, keeps its id + history): ${updates.length}`);
    updates.forEach((u) => console.log(`    ~ ${u.slug} Q${u.number} ${u.year}`));
    console.log(`  INSERT (was dropped for having no answer): ${inserts.length}`);
    inserts.forEach((i) => console.log(`    + ${i.slug} Q${i.number} ${i.year}`));
    console.log(`  KEPT as they are (she gave no defensible alternative): ${skipped.length}`);
    skipped.forEach((k) => console.log(`    = ${k}`));
    if (problems.length) { console.log(`\n  ✗ ${problems.length} PROBLEM(S):`); problems.forEach((p) => console.log(`    - ${p}`)); process.exit(1); }
    console.log('  ✓ validation clean');
    if (!apply) { console.log('\n  DRY RUN — re-run with --apply.'); return; }

    await db.begin(async (sql) => {
      const [{ ok }] = await sql`SELECT pg_try_advisory_xact_lock(hashtext('import-anuladas')) AS ok`;
      if (!ok) throw new Error('another import-anuladas run is in progress');
      for (const u of updates) {
        const r = await sql`UPDATE quiz_questions SET question = ${u.question}, answers = ${sql.json(u.answers)}, explanation_html = ${u.explanation_html} WHERE id = ${u.id}`;
        if (r.count !== 1) throw new Error(`update ${u.where}: ${r.count} rows`);
      }
      const touchedPages = new Set(inserts.map((i) => i.pageId));
      for (const i of inserts) {
        const [{ max }] = await sql`SELECT COALESCE(MAX(position), 0)::int AS max FROM quiz_questions WHERE page_id = ${i.pageId}`;
        await sql`INSERT INTO quiz_questions (page_id, position, question, answers, media_url, explanation_html)
                  VALUES (${i.pageId}, ${max + 1}, ${i.question}, ${sql.json(i.answers)}, ${null}, ${i.explanation_html})`;
      }
      // Re-order every touched topic chronologically (exam year, then number), in two passes
      // because (page_id, position) is UNIQUE.
      for (const pageId of touchedPages) {
        const rows = await sql`SELECT id, question FROM quiz_questions WHERE page_id = ${pageId}`;
        const ordered = rows.map((r) => { const m = r.question.match(HEAD_RE); return { id: r.id, sort: m ? chrono(m[2], m[1]) : [9999, 9999] }; })
          .sort((a, b) => (a.sort[0] - b.sort[0]) || (a.sort[1] - b.sort[1]));
        await sql`UPDATE quiz_questions SET position = position + 10000 WHERE page_id = ${pageId}`;
        for (let k = 0; k < ordered.length; k++) await sql`UPDATE quiz_questions SET position = ${k + 1} WHERE id = ${ordered[k].id}`;
      }
      const [{ n: parked }] = await sql`SELECT count(*)::int n FROM quiz_questions WHERE position >= 10000`;
      if (parked) throw new Error(`${parked} question(s) left parked`);
      const gaps = touchedPages.size
        ? await sql`SELECT page_id FROM quiz_questions WHERE page_id IN ${sql([...touchedPages])} GROUP BY page_id HAVING max(position) <> count(*)`
        : [];
      if (gaps.length) throw new Error(`non-contiguous positions on page(s) ${gaps.map((g) => g.page_id).join(', ')}`);
    });

    const [{ tp, qn }] = await db`
      SELECT count(DISTINCT p.id)::int tp, count(q.id)::int qn FROM pages p JOIN quiz_questions q ON q.page_id = p.id
      WHERE p.view = 'quiz' AND p.type = 'h5p-quiz' AND p.status = 'publish' AND p.track_id IS NULL AND p.content_module_id IS NULL`;
    console.log(`\n  ✓ APPLIED to ${target}: ${updates.length} updated, ${inserts.length} inserted. Questões now: ${tp} topics, ${qn} questions.`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
