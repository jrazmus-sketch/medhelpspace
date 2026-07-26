/* Part of the simulado funnel suite — see tests/simulado/README.md.
   Requires: dev server on :3001 and the LOCAL Supabase stack. */
/* Exercises the REAL server actions (startSimulado / saveSimuladoAnswers /
   submitSimulado) over HTTP, so the grading path and the minimum-answers rule are
   tested as they actually run — not simulated in SQL. */
const postgres = require('postgres');

const BASE = process.env.TEST_BASE || 'http://localhost:3001';
const db = postgres(process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55322/postgres', { max: 1 });

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

// Next encodes each server action's id in an `__next_internal_action_entry_do_not_use__`
// comment inside the client chunk that imports it.
async function actionIds(pagePath) {
  const html = await (await fetch(BASE + pagePath)).text();
  const srcs = new Set([...html.matchAll(/"(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]));
  const map = {};
  for (const s of srcs) {
    let js;
    try { js = await (await fetch(BASE + s)).text(); } catch { continue; }
    for (const m of js.matchAll(/__next_internal_action_entry_do_not_use__\s*(\[.*?\])\s*\*\//gs)) {
      try {
        const [entries] = JSON.parse(m[1]);
        for (const [id, meta] of Object.entries(entries)) map[meta.name] = id;
      } catch { /* not an action manifest */ }
    }
  }
  return map;
}

async function callAction(pagePath, actionId, args, cookie) {
  const res = await fetch(BASE + pagePath, {
    method: 'POST',
    headers: {
      'Next-Action': actionId,
      'Content-Type': 'text/plain;charset=UTF-8',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(args),
    redirect: 'manual',
  });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

// The RSC flight response embeds the returned object; pull out the status field.
function statusFrom(text) {
  const m = text.match(/"status"\s*:\s*"(\w+)"/);
  return m ? m[1] : null;
}

(async () => {
  const email = `sim-act-${Date.now()}@local.test`;

  console.log('\n=== discover action ids ===');
  const gateIds = await actionIds('/simulado-revalida');
  check('found startSimulado action id', Boolean(gateIds.startSimulado), JSON.stringify(gateIds));

  console.log('\n=== 1. startSimulado creates the lead and opens a session ===');
  let cookie;
  {
    const r = await callAction('/simulado-revalida', gateIds.startSimulado, [{
      firstName: 'Karina',
      email,
      targetCohort: 'revalida-2027-1',
      honeypot: '',
      utm: { source: 'test', campaign: 'phase1' },
      context: { referrer: null, landingPath: '/simulado-revalida', sessionId: 'test-sid' },
    }]);
    check('startSimulado returns 200', r.status === 200, `status ${r.status}`);
    check('reports status "started"', statusFrom(r.text) === 'started', statusFrom(r.text) ?? r.text.slice(0, 200));

    const setCookie = r.headers.get('set-cookie') ?? '';
    check('sets an httpOnly session cookie',
      setCookie.includes('mhs_sim') && /httponly/i.test(setCookie));
    const m = setCookie.match(/mhs_sim=([^;]+)/);
    cookie = m ? `mhs_sim=${m[1]}` : null;

    const [lead] = await db`SELECT * FROM leads WHERE email = ${email}`;
    check('lead row created', Boolean(lead));
    check('source is simulado-100', lead?.source === 'simulado-100');
    check('first_name stored', lead?.first_name === 'Karina');
    check('target_cohort stored', lead?.target_cohort === 'revalida-2027-1');
    check('sim_set_version stamped', lead?.sim_set_version === 2);
    check('utm captured', lead?.utm_source === 'test');
    check('NOT yet marked started', lead?.sim_started_at === null);
    check('session cookie matches the lead token', cookie?.includes(lead?.result_token));
  }

  console.log('\n=== 2. honeypot + disposable e-mail are rejected ===');
  {
    const hp = await callAction('/simulado-revalida', gateIds.startSimulado, [{
      firstName: 'Bot', email: `bot-${Date.now()}@local.test`, targetCohort: 'revalida-2027-1',
      honeypot: 'gotcha',
    }]);
    check('honeypot submission rejected', statusFrom(hp.text) === 'error');

    const disp = await callAction('/simulado-revalida', gateIds.startSimulado, [{
      firstName: 'X', email: `x-${Date.now()}@mailinator.com`, targetCohort: 'revalida-2027-1',
      honeypot: '',
    }]);
    check('disposable e-mail rejected', statusFrom(disp.text) === 'error');
  }

  console.log('\n=== 3. exam actions ===');
  const examIds = await actionIds('/simulado-revalida/prova');
  check('found saveSimuladoAnswers id', Boolean(examIds.saveSimuladoAnswers));
  check('found submitSimulado id', Boolean(examIds.submitSimulado));

  const qs = await db`
    SELECT id, position, correct_index, area FROM simulado_questions
    WHERE set_version = 2 ORDER BY position
  `;

  console.log('\n=== 4. saving answers ===');
  {
    // 49 answers: one short of the minimum.
    const progress = {};
    qs.slice(0, 49).forEach((q) => { progress[q.id] = { a: q.correct_index }; });
    const r = await callAction('/simulado-revalida/prova', examIds.saveSimuladoAnswers,
      [{ answered: progress, flagged: [qs[0].id, qs[1].id] }], cookie);
    check('saveSimuladoAnswers returns 200', r.status === 200, `status ${r.status}`);

    const [lead] = await db`SELECT * FROM leads WHERE email = ${email}`;
    check('49 answers persisted', Object.keys(lead.sim_progress ?? {}).length === 49);
    check('sim_answered updated to 49', lead.sim_answered === 49);
    check('flags persisted', (lead.sim_flagged ?? []).length === 2);
    check('sim_started_at now stamped', lead.sim_started_at !== null);
    check('stored answers carry NO correctness key',
      Object.values(lead.sim_progress).every((v) => !('c' in v)));
  }

  console.log('\n=== 5. minimum-answers rule ===');
  {
    const r = await callAction('/simulado-revalida/prova', examIds.submitSimulado, [], cookie);
    check('submit with 49 answers is refused', statusFrom(r.text) === 'too_few', r.text.slice(0, 200));

    const [lead] = await db`SELECT sim_completed_at, sim_score FROM leads WHERE email = ${email}`;
    check('exam NOT marked submitted', lead.sim_completed_at === null);
    check('no score written', lead.sim_score === null);
  }

  console.log('\n=== 6. tampered answers cannot inflate the score ===');
  {
    // 70 answers: 55 correct, 15 deliberately wrong. The client also sends a
    // fabricated "c: true" on every entry — the server must ignore it entirely.
    const progress = {};
    qs.slice(0, 70).forEach((q, i) => {
      progress[q.id] = { a: i < 55 ? q.correct_index : (q.correct_index + 1) % 4, c: true };
    });
    await callAction('/simulado-revalida/prova', examIds.saveSimuladoAnswers,
      [{ answered: progress, flagged: [] }], cookie);

    const r = await callAction('/simulado-revalida/prova', examIds.submitSimulado, [], cookie);
    check('submit accepted at 70 answers', statusFrom(r.text) === 'submitted', r.text.slice(0, 200));

    const [lead] = await db`SELECT * FROM leads WHERE email = ${email}`;
    check('server-computed score is 55, not the claimed 70',
      lead.sim_score === 55, `got ${lead.sim_score}`);
    check('sim_answered is 70', lead.sim_answered === 70);
    check('sim_completed_at stamped', lead.sim_completed_at !== null);

    // Per-área totals must cover the WHOLE set, not just answered questions.
    const areas = lead.sim_area_scores ?? [];
    check('area scores cover all 5 grandes áreas', areas.length === 5, `got ${areas.length}`);
    const totalAcross = areas.reduce((s, a) => s + a.total, 0);
    check('area totals sum to 100', totalAcross === 100, `got ${totalAcross}`);
    const correctAcross = areas.reduce((s, a) => s + a.correct, 0);
    check('area correct sums to the score', correctAcross === 55, `got ${correctAcross}`);
    const answeredAcross = areas.reduce((s, a) => s + a.answered, 0);
    check('area answered sums to 70', answeredAcross === 70, `got ${answeredAcross}`);
  }

  console.log('\n=== 7. a submitted exam is immutable ===');
  {
    const r = await callAction('/simulado-revalida/prova', examIds.submitSimulado, [], cookie);
    check('second submit reports already_submitted', statusFrom(r.text) === 'already_submitted');

    const before = (await db`SELECT sim_score, sim_progress FROM leads WHERE email = ${email}`)[0];
    const cheat = {};
    qs.forEach((q) => { cheat[q.id] = { a: q.correct_index }; });
    await callAction('/simulado-revalida/prova', examIds.saveSimuladoAnswers,
      [{ answered: cheat, flagged: [] }], cookie);
    const after = (await db`SELECT sim_score, sim_progress FROM leads WHERE email = ${email}`)[0];
    check('answers cannot be changed after submission',
      Object.keys(after.sim_progress).length === Object.keys(before.sim_progress).length,
      `${Object.keys(before.sim_progress).length} -> ${Object.keys(after.sim_progress).length}`);
    check('score unchanged after tamper attempt', after.sim_score === before.sim_score);
  }

  console.log('\n=== 8. a stranger cannot hijack an in-progress exam ===');
  {
    const r = await callAction('/simulado-revalida', gateIds.startSimulado, [{
      firstName: 'Atacante', email, targetCohort: 'revalida-2027-1', honeypot: '',
    }]);
    check('re-entering an active e-mail does NOT start a session',
      statusFrom(r.text) === 'resume_emailed', statusFrom(r.text) ?? r.text.slice(0, 200));
    check('no session cookie handed out',
      !(r.headers.get('set-cookie') ?? '').includes('mhs_sim'));
    check('response masks the e-mail', !r.text.includes(email));
  }

  console.log('\n=== 9. actions reject a request with no session ===');
  {
    const r = await callAction('/simulado-revalida/prova', examIds.submitSimulado, []);
    check('submit without a session errors', statusFrom(r.text) === 'error');
    const s = await callAction('/simulado-revalida/prova', examIds.saveSimuladoAnswers,
      [{ answered: { 1: { a: 0 } }, flagged: [] }]);
    check('save without a session returns ok:false', /"ok"\s*:\s*false/.test(s.text));
  }

  console.log('\n=== cleanup ===');
  await db`DELETE FROM leads WHERE email = ${email} OR email LIKE 'bot-%@local.test' OR email LIKE 'x-%@mailinator.com'`;
  console.log('  test leads removed');

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fail) console.log('Failures:\n' + failures.map((f) => '  - ' + f).join('\n'));
  await db.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('\nHARNESS ERROR:', e.message, '\n', e.stack);
  await db.end().catch(() => {});
  process.exit(1);
});
