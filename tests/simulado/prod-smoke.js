/* Part of the simulado funnel suite — see tests/simulado/README.md.
   Requires: dev server on :3001 and the LOCAL Supabase stack. */
/* Production smoke test for the simulado report.
   Creates a lead flagged is_test, renders the live report, then deletes it. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const postgres = require('postgres');

for (const line of fs.readFileSync(path.join(ROOT, 'app/.env.local'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const e = t.indexOf('=');
  if (e === -1) continue;
  const k = t.slice(0, e).trim();
  if (!(k in process.env)) process.env[k] = t.slice(e + 1).trim().replace(/^["']|["']$/g, '');
}

const db = postgres(process.env.DATABASE_URL, { max: 1 });
const BASE = process.env.PROD_BASE || 'https://www.medhelpspace.com.br';
const email = `prod-smoke-${Date.now()}@medhelpspace-test.invalid`;

let pass = 0, fail = 0;
function check(n, c, d = '') {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); }
}

(async () => {
  const qs = await db`
    SELECT id, position, correct_index, tema FROM simulado_questions
    WHERE set_version = 2 ORDER BY position
  `;
  check('prod has the 100-question set', qs.length === 100, `got ${qs.length}`);

  const progress = {};
  qs.slice(0, 45).forEach((q) => { progress[q.id] = { a: q.correct_index }; });
  qs.slice(45, 80).forEach((q) => { progress[q.id] = { a: (q.correct_index + 1) % 4 }; });

  await db`
    INSERT INTO leads (email, source, target_cohort, first_name, completed_at,
                       sim_set_version, sim_progress, sim_flagged, sim_answered,
                       sim_started_at, sim_completed_at, sim_score, verified_at, is_test)
    VALUES (${email}, 'simulado-100', 'revalida-2027-1', 'Karina', now(), 2,
            ${db.json(progress)}, ${db.json([])}, 80, now(), now(), 45, now(), true)
  `;
  const [lead] = await db`SELECT result_token FROM leads WHERE email = ${email}`;
  const cookie = `mhs_sim=${lead.result_token}`;

  try {
    const res = await fetch(`${BASE}/simulado-revalida/resultado`, { headers: { cookie } });
    const body = (await res.text()).replace(/<!--\s*-->/g, '');

    check('report returns 200', res.status === 200, `status ${res.status}`);
    check('score 45/100 shown', body.includes('>45<') && body.includes('/100'));
    check('45% de acerto', body.includes('45% de acerto'));
    check('counts certas/erradas/branco', /45<\/strong> certas/.test(body) &&
      /35<\/strong> erradas/.test(body) && /20<\/strong> não respondidas/.test(body));
    check('cut-score verdict (15 short of 60)', /Faltaram 15 ponto/.test(body));
    check('per-área section', /Desempenho por grande área/.test(body));
    check('temas roadmap with caveat', /Temas que merecem revisão/.test(body) &&
      /não como um diagnóstico definitivo/.test(body));
    check('por onde começar', /Por onde começar/.test(body));
    check('invitation #1', /Transforme esse diagnóstico em um plano/.test(body));
    check('commented review heading', /Gabarito comentado/.test(body));
    check('all 100 questions rendered',
      qs.every((q) => body.includes(`Questão ${q.position}<`)));
    const [q1] = await db`
      SELECT comentario, conceito_chave FROM simulado_questions
      WHERE set_version = 2 AND position = 1
    `;
    check('comentário present', body.includes(q1.comentario.slice(0, 40)));
    check('conceito-chave present', body.includes(q1.conceito_chave.slice(0, 30)));
    check('invitation #2 with offer', /Esse nível de comentário/.test(body));
    check('figures lazy-loaded', /loading="lazy"/.test(body));

    // The gate, on production.
    await db`UPDATE leads SET sim_completed_at = NULL WHERE email = ${email}`;
    const gated = await (await fetch(`${BASE}/simulado-revalida/resultado`, { headers: { cookie } })).text();
    check('un-submitted exam refuses the report', /ainda não foi entregue/.test(gated));
    check('no comentário leaks when un-submitted', !gated.includes(q1.comentario.slice(0, 40)));
  } finally {
    await db`DELETE FROM leads WHERE email = ${email}`;
    const [{ count }] = await db`SELECT count(*)::int FROM leads WHERE email = ${email}`;
    console.log(`\n  cleanup: test lead removed (${count} remaining)`);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await db.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('ERROR:', e.message);
  await db`DELETE FROM leads WHERE email = ${email}`.catch(() => {});
  await db.end().catch(() => {});
  process.exit(1);
});
