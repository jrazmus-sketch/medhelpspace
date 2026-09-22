'use strict';
/**
 * apply-questoes-v2.js — applies a Questões Revalida delivery WITHOUT ever deleting a
 * live question. Successor of apply-questoes.js (June 2026), which deleted and
 * re-inserted every topic's questions.
 *
 *   node scripts/apply-questoes-v2.js            # DRY RUN (default) — validates, prints the plan, no writes
 *   node scripts/apply-questoes-v2.js --apply    # execute in ONE transaction (PROD via app/.env.local)
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/apply-questoes-v2.js --apply   # local
 *
 * Inputs: parsed/questoes-parsed.json (scripts/parse-questoes.js) and
 *         parsed/questoes-reconciliation.json (scripts/reconcile-questoes.js).
 *
 * The rule (Karina, 2026-09-20): what came in her files REPLACES the live version, what
 * is new is ADDED, and what did not come STAYS. Her delivery had truncated files
 * (Urologia, Atenção Básica), a few accidental omissions, and annulled questions with no
 * answer yet — a delete+reinsert would have silently removed 62 live questions.
 *
 * Per topic, a live question and a parsed question are the same when their
 * (number, exam year) match — read from the "Questão N · Revalida YYYY" heading.
 *   matched  → UPDATE in place. The row id survives, so quiz_attempts and
 *              review_schedule keep pointing at it, and media_url is untouched.
 *   new      → INSERT.
 *   unmatched live → KEPT as is.
 * Live rows whose heading lost its year are matched on the number alone when that is
 * unambiguous. Known renumberings go in IDENTITY_ALIASES. An exact duplicate live row
 * (same topic, number, year) is removed — there is one on prod.
 * Positions are rebuilt chronologically (exam year, then number), in two passes because
 * (page_id, position) is UNIQUE.
 *
 * Titles: her file names carry no accents, so the display name comes from the topic's
 * Revalida Up twin ("<slug>-revalida-up", imported 2026-09-13 with her spelling), else
 * TITLE_OVERRIDES, else the live title is left alone. Slugs/URLs never change.
 *
 * Backups: <table>_bk_questoes_20260920 are created ONCE (first apply), RLS-enabled and
 * revoked from anon/authenticated, so a second apply after a fresh download keeps the
 * true "before" state. Never touches flashcards (track_id), memorecards
 * (content_module_id) or simulados (view='simulados').
 */
const fs = require('fs');
const path = require('path');

const BK = '20260920';

// Same question, renumbered by Karina (live key -> delivered key), per topic slug.
const IDENTITY_ALIASES = {
  leptospirose: { '61@2021.1': '60@2021.1' },
};

// Display names for topics with no Revalida Up twin (Karina approved 2026-09-20).
const TITLE_OVERRIDES = {
  'acidentes-por-animais-peconhentos': 'Acidentes por Animais Peçonhentos',
  demencias: 'Demências',
  'tromboembolismo-pulmonar': 'Tromboembolismo Pulmonar',
  'testes-diagnosticos': 'Testes Diagnósticos',
  'ictericia-e-hiperbilirrubinemias': 'Icterícia e Hiperbilirrubinemias',
  'psiquiatria-na-infancia': 'Psiquiatria Infantil',
  // Her Revalida Up title is sentence-cased; every other card is Title Case.
  'maus-tratos-violencia-prevencao-acidentes-infancia': 'Maus-tratos, Violência e Prevenção de Acidentes na Infância',
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

const HEAD_RE = /Quest[aã]o\s+0*(\d+)[^<]{0,8}?Revalida\s+(20\d\d(?:\.[12])?)/;
const NUM_RE = /Quest[aã]o\s+0*(\d+)/;
const liveKey = (html) => { const m = html.match(HEAD_RE); return m ? `${+m[1]}@${m[2]}` : null; };
const liveNum = (html) => { const m = html.replace(/<[^>]+>/g, ' ').match(NUM_RE); return m ? +m[1] : null; };
const newKey = (q) => `${+q.number}@${q.year}`;
// "2021" < "2021.1" < "2022.1"; a row with no year sorts last.
const chrono = (key) => { if (!key) return [9999, 9999]; const [n, y] = key.split('@'); return [y ? parseFloat(y) : 9999, +n]; };
const byChrono = (a, b) => (a.sort[0] - b.sort[0]) || (a.sort[1] - b.sort[1]) || (a.tie - b.tie);
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// The stem without its heading — a hand-re-added copy can carry a malformed heading
// ("Questão 22 .Revalida 2025.1" as plain text) yet be the very same question.
const stemOf = (html) => textOf(html.replace(/<h3>[\s\S]*?<\/h3>/i, ' ')).replace(/^Quest[aã]o\s+0*\d+[^A-Za-zÀ-ÿ]{0,6}Revalida\s+20\d\d(?:\.[12])?\s*/i, '').slice(0, 250);

(async () => {
  loadEnvLocal();
  const apply = process.argv.includes('--apply');
  const recon = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parsed', 'questoes-reconciliation.json'), 'utf8'));
  const parsed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parsed', 'questoes-parsed.json'), 'utf8'));
  const pMap = new Map(parsed.map((p) => [`${p.spec}::${p.topicSlug}`, p]));

  const inPlace = [...recon.refresh, ...recon.rename, ...recon.moved];
  const creates = []; // filled below: recon.create minus the topics an earlier apply already created
  if (recon.retire.length) { console.error(`✗ reconciliation lists ${recon.retire.length} RETIRE topic(s); v2 never retires — review them first.`); process.exit(1); }
  if (recon.moved.length) { console.error(`✗ reconciliation lists ${recon.moved.length} MOVED topic(s); v2 does not move specialties — review them first.`); process.exit(1); }

  const postgres = require('postgres');
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL missing (app/.env.local or environment).'); process.exit(1); }
  const target = url.includes('127.0.0.1') ? 'LOCAL' : 'PROD';
  const db = postgres(url, { max: 1, prepare: false, ssl: target === 'LOCAL' ? false : 'require' });

  try {
    // ── lookups (read-only) ──
    const specId = Object.fromEntries((await db`SELECT id, slug FROM specialties`).map((s) => [s.slug, s.id]));
    const hubs = await db`SELECT id, specialty_id FROM pages WHERE view='quiz' AND type='blurb-nav-hub' AND status='publish' AND specialty_id IS NOT NULL`;
    const hubBySpecId = Object.fromEntries(hubs.map((h) => [h.specialty_id, h.id]));
    const [{ max: maxPageId }] = await db`SELECT COALESCE(MAX(id),0)::int AS max FROM pages`;
    const navPos = Object.fromEntries((await db`SELECT source_page_id, MAX(position)::int AS m FROM nav_items GROUP BY source_page_id`).map((r) => [r.source_page_id, r.m]));
    const existingSlugs = new Set((await db`SELECT slug FROM pages`).map((r) => r.slug));
    const ruTitle = new Map((await db`SELECT slug, title FROM pages WHERE view='revalida-up' AND status='publish'`)
      .map((r) => [r.slug.replace(/-revalida-up$/, ''), r.title.replace(/\s*Revalida Up$/i, '').trim()]));
    // A "new" topic may already have a page:
    //  - a topic retired to DRAFT in June because her folder then held an empty placeholder
    //    (prod: `demencias`, which still owns its study-plan link and clean URL) → REVIVE it;
    //  - a page an earlier apply of this script created (a second pass after a fresh
    //    download still reads the first reconciliation) → merge into it.
    // Either way, never create a twin: pages.slug is UNIQUE, so a twin would be "-quiz".
    const quizPages = await db`SELECT id, slug, specialty_id, status FROM pages WHERE view='quiz' AND type='h5p-quiz' AND track_id IS NULL AND content_module_id IS NULL`;
    const quizBySlug = new Map(quizPages.map((p) => [p.slug, p]));
    const revived = [];
    for (const c of recon.create) {
      const hit = [c.localSlug, `${c.localSlug}-quiz`, `${c.localSlug}-questoes`].map((x) => quizBySlug.get(x)).find((p) => p && p.specialty_id === specId[c.spec]);
      if (hit) {
        const revive = hit.status !== 'publish';
        if (revive) revived.push(`${c.spec}/${hit.slug} (page ${hit.id})`);
        inPlace.push({ spec: c.spec, localSlug: c.localSlug, liveId: hit.id, liveSlug: hit.slug, match: revive ? 'revived-draft' : 'created-by-earlier-apply', revive });
      } else creates.push(c);
    }
    const livePages = new Map((await db`SELECT id, slug, title, status FROM pages WHERE id IN ${db(inPlace.map((r) => r.liveId))}`).map((p) => [String(p.id), p]));
    const liveRows = await db`SELECT id, page_id, position, question, answers, explanation_html, media_url FROM quiz_questions WHERE page_id IN ${db(inPlace.map((r) => r.liveId))} ORDER BY page_id, position`;
    const liveByPage = new Map();
    for (const q of liveRows) { const k = String(q.page_id); if (!liveByPage.has(k)) liveByPage.set(k, []); liveByPage.get(k).push(q); }

    const titleFor = (slug) => TITLE_OVERRIDES[slug] || ruTitle.get(slug) || null;

    // ── plan ──
    const problems = [];
    const plan = []; // per topic
    const tot = { update: 0, unchanged: 0, insert: 0, keep: 0, dedupe: 0, titles: 0, yearFixed: 0, reordered: 0 };
    const keptList = []; const titleList = []; const noTitle = []; const dedupeList = [];

    for (const r of inPlace) {
      const lp = pMap.get(`${r.spec}::${r.localSlug}`);
      const page = livePages.get(String(r.liveId));
      if (!lp || !lp.questions.length) { problems.push(`no parsed questions for ${r.spec}/${r.localSlug}`); continue; }
      if (!page) { problems.push(`live page ${r.liveId} (${r.liveSlug}) not found on ${target}`); continue; }
      if (page.slug !== r.liveSlug) { problems.push(`page ${r.liveId}: slug '${page.slug}' on ${target} != '${r.liveSlug}' in the reconciliation`); continue; }

      const live = liveByPage.get(String(r.liveId)) || [];
      const alias = IDENTITY_ALIASES[r.localSlug] || {};
      const newByKey = new Map(lp.questions.map((q) => [newKey(q), q]));
      const usedNew = new Set();
      const ops = []; // {kind, liveId?, q?, sort, tie}
      const seenLiveKeys = new Map();

      for (const lq of live) {
        let k = liveKey(lq.question);
        if (k && alias[k]) k = alias[k];
        // exact duplicate live row → drop the later copy
        if (k && seenLiveKeys.has(k)) {
          const first = seenLiveKeys.get(k);
          if (stemOf(first.question) === stemOf(lq.question)) { ops.push({ kind: 'dedupe', liveId: lq.id }); tot.dedupe++; dedupeList.push(`${r.spec}/${r.localSlug} Q${k} (row ${lq.id}, copy of row ${first.id})`); continue; }
        }
        if (k) seenLiveKeys.set(k, lq);
        let nq = k ? newByKey.get(k) : null;
        if (!nq && !k) { // heading lost its year → match on the number when unambiguous
          const n = liveNum(lq.question);
          const cands = lp.questions.filter((q) => +q.number === n && !usedNew.has(newKey(q)));
          const liveSameNum = live.filter((x) => liveNum(x.question) === n).length;
          if (n != null && cands.length === 1 && liveSameNum === 1) { nq = cands[0]; tot.yearFixed++; }
        }
        if (nq && !usedNew.has(newKey(nq))) {
          usedNew.add(newKey(nq));
          const same = lq.question === nq.question && JSON.stringify(lq.answers) === JSON.stringify(nq.answers) && (lq.explanation_html || null) === (nq.explanation_html || null);
          ops.push({ kind: same ? 'unchanged' : 'update', liveId: lq.id, q: nq, sort: chrono(newKey(nq)), tie: 0 });
          tot[same ? 'unchanged' : 'update']++;
        } else {
          ops.push({ kind: 'keep', liveId: lq.id, sort: chrono(k), tie: lq.position });
          tot.keep++; keptList.push(`${r.spec}/${r.localSlug} Q${k || ('?' + (liveNum(lq.question) ?? ''))}`);
        }
      }
      for (const q of lp.questions) if (!usedNew.has(newKey(q))) { ops.push({ kind: 'insert', q, sort: chrono(newKey(q)), tie: 1 }); tot.insert++; }

      const ordered = ops.filter((o) => o.kind !== 'dedupe').sort(byChrono);
      ordered.forEach((o, i) => { o.position = i + 1; });
      const livePos = new Map(live.map((x) => [x.id, x.position]));
      if (ordered.some((o) => o.liveId && livePos.get(o.liveId) !== o.position)) tot.reordered++;

      const title = titleFor(r.localSlug);
      if (!title) noTitle.push(`${r.spec}/${r.localSlug} (keeps "${page.title}")`);
      else if (title !== page.title) { tot.titles++; titleList.push(`${page.title}  →  ${title}`); }
      plan.push({ r, page, ops, ordered, title });
    }

    const newPlan = [];
    for (const c of creates) {
      const lp = pMap.get(`${c.spec}::${c.localSlug}`);
      if (!lp || !lp.questions.length) { problems.push(`no parsed questions for NEW ${c.spec}/${c.localSlug}`); continue; }
      if (!specId[c.spec]) { problems.push(`NEW ${c.spec}/${c.localSlug}: unknown specialty`); continue; }
      if (!hubBySpecId[specId[c.spec]]) { problems.push(`NEW ${c.spec}/${c.localSlug}: no Questões hub for the specialty`); continue; }
      const title = titleFor(c.localSlug);
      if (!title) { problems.push(`NEW ${c.spec}/${c.localSlug}: no display title (add it to TITLE_OVERRIDES)`); continue; }
      const questions = [...lp.questions].map((q) => ({ q, sort: chrono(newKey(q)), tie: 0 })).sort(byChrono).map((o, i) => ({ ...o.q, position: i + 1 }));
      newPlan.push({ c, title, questions });
    }

    // ── report ──
    const qNew = newPlan.reduce((n, p) => n + p.questions.length, 0);
    console.log(`\n=== apply-questoes-v2  [target: ${target}]  ${apply ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`  existing topics: ${plan.length}   live questions on them: ${liveRows.length}`);
    console.log(`    UPDATE in place : ${tot.update}   (already identical: ${tot.unchanged})`);
    console.log(`    INSERT new      : ${tot.insert}`);
    console.log(`    KEEP as is      : ${tot.keep}   (live, not in the delivery)`);
    console.log(`    duplicate rows removed: ${tot.dedupe}   headings that regain their year: ${tot.yearFixed}   topics re-ordered: ${tot.reordered}`);
    console.log(`  NEW topics: ${newPlan.length} (${qNew} questions): ${newPlan.map((p) => `${p.c.spec}/${p.c.localSlug}`).join(', ')}`);
    if (revived.length) console.log(`  REVIVED from draft (published again, card restored, its old questions kept): ${revived.join(', ')}`);
    console.log(`  titles changing: ${tot.titles}`);
    console.log(`  → after apply: ${plan.length + newPlan.length} topics, ${liveRows.length - tot.dedupe + tot.insert + qNew} questions`);
    if (dedupeList.length) console.log(`  duplicates: ${dedupeList.join('; ')}`);
    if (process.argv.includes('--verbose')) {
      console.log(`\n  KEPT (${keptList.length}):\n    ${keptList.join('\n    ')}`);
      console.log(`\n  TITLES (${titleList.length}):\n    ${titleList.join('\n    ')}`);
    }
    if (noTitle.length) console.log(`\n  ! no twin/override title, live title kept: ${noTitle.join('; ')}`);
    if (problems.length) { console.log(`\n  ✗ ${problems.length} VALIDATION PROBLEM(S):`); problems.forEach((p) => console.log(`    - ${p}`)); process.exit(1); }
    console.log(`  ✓ validation clean`);
    if (!apply) { console.log(`\n  DRY RUN — re-run with --apply to execute (add --verbose for the kept/title lists).`); return; }

    // ── apply (one transaction) ──
    let pid = maxPageId;
    const nextNav = (hubId) => (navPos[hubId] = (navPos[hubId] ?? 0) + 1);
    const pickSlug = (slug) => { let s = slug; if (existingSlugs.has(s)) s = `${slug}-quiz`; if (existingSlugs.has(s)) s = `${slug}-questoes`; existingSlugs.add(s); return s; };

    await db.begin(async (sql) => {
      // 0. backups — created once; a later re-apply keeps the true "before" state
      for (const [t, q] of [
        ['pages', `SELECT * FROM pages WHERE view='quiz'`],
        ['quiz_questions', `SELECT q.* FROM quiz_questions q JOIN pages p ON p.id=q.page_id WHERE p.view='quiz'`],
        ['nav_items', `SELECT n.* FROM nav_items n WHERE n.source_page_id IN (SELECT id FROM pages WHERE view='quiz') OR n.target_page_id IN (SELECT id FROM pages WHERE view='quiz')`],
      ]) {
        const name = `${t}_bk_questoes_${BK}`;
        const [{ exists }] = await sql`SELECT to_regclass(${'public.' + name}) IS NOT NULL AS exists`;
        if (exists) continue;
        await sql.unsafe(`CREATE TABLE ${name} AS ${q}`);
        await sql.unsafe(`ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY`);
        await sql.unsafe(`REVOKE ALL ON ${name} FROM anon, authenticated`);
      }

      // 1. existing topics
      for (const p of plan) {
        const pageId = p.r.liveId;
        for (const o of p.ops) if (o.kind === 'dedupe') await sql`DELETE FROM quiz_questions WHERE id = ${o.liveId}`;
        // pass 1: park every surviving row far from the final range (UNIQUE page_id+position)
        await sql`UPDATE quiz_questions SET position = position + 10000 WHERE page_id = ${pageId}`;
        for (const o of p.ordered) {
          if (o.kind === 'insert') {
            await sql`INSERT INTO quiz_questions (page_id, position, question, answers, media_url, explanation_html)
                      VALUES (${pageId}, ${o.position}, ${o.q.question}, ${sql.json(o.q.answers)}, ${null}, ${o.q.explanation_html})`;
          } else if (o.kind === 'update') {
            await sql`UPDATE quiz_questions SET position = ${o.position}, question = ${o.q.question}, answers = ${sql.json(o.q.answers)}, explanation_html = ${o.q.explanation_html}
                      WHERE id = ${o.liveId}`;
          } else { // keep | unchanged
            await sql`UPDATE quiz_questions SET position = ${o.position} WHERE id = ${o.liveId}`;
          }
        }
        if (p.title && p.title !== p.page.title) {
          await sql`UPDATE pages SET title = ${p.title}, updated_at = now() WHERE id = ${pageId}`;
          await sql`UPDATE nav_items SET label = ${p.title} WHERE target_page_id = ${pageId}`;
        } else {
          await sql`UPDATE pages SET updated_at = now() WHERE id = ${pageId}`;
        }
        if (p.r.revive) {
          await sql`UPDATE pages SET status = 'publish', updated_at = now() WHERE id = ${pageId}`;
          const hub = hubBySpecId[specId[p.r.spec]];
          const [{ n: hasCard }] = await sql`SELECT count(*)::int n FROM nav_items WHERE source_page_id = ${hub} AND target_page_id = ${pageId}`;
          if (!hasCard) await sql`INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
                                  VALUES (${hub}, ${pageId}, ${nextNav(hub)}, ${p.title || p.page.title}, 'cards')`;
        }
      }

      // 2. new topics (+ card on the specialty's Questões hub)
      for (const n of newPlan) {
        const slug = pickSlug(n.c.localSlug);
        const id = ++pid;
        await sql`INSERT INTO pages (id, slug, title, type, status, view, content_module_id, specialty_id, wp_created_at, wp_modified_at)
                  VALUES (${id}, ${slug}, ${n.title}, ${'h5p-quiz'}::page_type, 'publish', ${'quiz'}::page_view, ${null}, ${specId[n.c.spec]}, now(), now())`;
        for (const q of n.questions) {
          await sql`INSERT INTO quiz_questions (page_id, position, question, answers, media_url, explanation_html)
                    VALUES (${id}, ${q.position}, ${q.question}, ${sql.json(q.answers)}, ${null}, ${q.explanation_html})`;
        }
        const hub = hubBySpecId[specId[n.c.spec]];
        await sql`INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
                  VALUES (${hub}, ${id}, ${nextNav(hub)}, ${n.title}, 'cards')`;
      }

      // 3. invariants — fail the whole transaction rather than commit something odd
      const [{ n: parked }] = await sql`SELECT count(*)::int n FROM quiz_questions q JOIN pages p ON p.id=q.page_id WHERE p.view='quiz' AND q.position >= 10000`;
      if (parked) throw new Error(`${parked} question(s) left parked at position >= 10000`);
      const gaps = await sql`SELECT page_id FROM quiz_questions WHERE page_id IN ${sql(plan.map((p) => p.r.liveId))} GROUP BY page_id HAVING max(position) <> count(*)`;
      if (gaps.length) throw new Error(`non-contiguous positions on page(s) ${gaps.map((g) => g.page_id).join(', ')}`);
    });

    // ── verify ──
    const [{ qn }] = await db`SELECT count(*)::int qn FROM quiz_questions q JOIN pages p ON p.id=q.page_id WHERE p.view='quiz' AND p.type='h5p-quiz' AND p.status='publish' AND p.track_id IS NULL AND p.content_module_id IS NULL`;
    const [{ tp }] = await db`SELECT count(*)::int tp FROM pages WHERE view='quiz' AND type='h5p-quiz' AND status='publish' AND track_id IS NULL AND content_module_id IS NULL`;
    const [{ med }] = await db`SELECT count(*)::int med FROM quiz_questions q JOIN pages p ON p.id=q.page_id WHERE p.view='quiz' AND p.type='h5p-quiz' AND p.status='publish' AND p.track_id IS NULL AND p.content_module_id IS NULL AND q.media_url IS NOT NULL`;
    console.log(`\n  ✓ APPLIED to ${target}: ${tp} topics, ${qn} questions, ${med} with an image.`);
    console.log(`    backups: pages|quiz_questions|nav_items _bk_questoes_${BK} (RLS on, anon/authenticated revoked)`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
