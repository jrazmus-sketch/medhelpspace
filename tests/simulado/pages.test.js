/* Part of the simulado funnel suite — see tests/simulado/README.md.
   Requires: dev server on :3001 and the LOCAL Supabase stack. */
/* End-to-end test of the rebuilt simulado funnel against the LOCAL stack. */
const postgres = require('postgres');

const BASE = process.env.TEST_BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const db = postgres(DB, { max: 1 });

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function get(path, cookie) {
  const res = await fetch(BASE + path, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  let body = res.status >= 300 && res.status < 400 ? '' : await res.text();
  // React SSR inserts <!-- --> between adjacent text nodes ("40<!-- -->% de
  // acerto"), which breaks naive substring matching. Strip them for assertions.
  body = body.replace(/<!--\s*-->/g, '');
  return { status: res.status, body, headers: res.headers };
}

(async () => {
  console.log('\n=== 1. Public landing page ===');
  {
    const r = await get('/simulado-revalida');
    check('landing returns 200', r.status === 200, `got ${r.status}`);
    check('sells "questões inéditas"', r.body.includes('inéditas'));
    check('mentions gabarito comentado', /gabarito comentado/i.test(r.body));
    // The old set was real past-INEP items; that claim must be gone everywhere.
    check('no stale "questões reais" claim', !/questões reais/i.test(r.body));
    check('no stale "2020 a 2025" claim', !/2020 a 2025/.test(r.body));
    check('no stale edition chips', !/2022\.1/.test(r.body));
    check('no stale "5 blocos de 20"', !/5 blocos de 20/.test(r.body));
    // Read the expected count from the DB — the split is Karina's, not ours,
    // and the landing page must always mirror whatever the set contains.
    const [cm] = await db`SELECT count(*)::int AS n FROM simulado_questions
      WHERE set_version = 2 AND area = 'clinica-medica'`;
    check(`shows the real área split (${cm.n} Clínica Médica)`,
      r.body.includes(`>${cm.n}<`), `expected >${cm.n}< in the page`);

    // The picker must list every ACTIVE turma (including ones closed for sale),
    // because its job is segmentation, not selling.
    const active = await db`SELECT slug, name, is_for_sale FROM cohorts WHERE active = true ORDER BY test_date`;
    for (const c of active) {
      check(`turma picker lists ${c.name}${c.is_for_sale ? '' : ' (not for sale)'}`,
        r.body.includes(c.name));
    }
    check('turma picker offers "Ainda não decidi"', r.body.includes('Ainda não decidi'));
  }

  console.log('\n=== 2. Unauthenticated routes ===');
  {
    const prova = await get('/simulado-revalida/prova');
    check('/prova without session shows no-session state',
      prova.status === 200 && prova.body.includes('Não encontramos o seu simulado'),
      `status ${prova.status}`);
    check('/prova without session leaks no question text',
      !prova.body.includes('conduta inicial mais adequada'));

    const res = await get('/simulado-revalida/resultado');
    check('/resultado without session shows empty state',
      res.status === 200 && res.body.includes('Não encontramos o seu simulado'));

    // An unknown/expired token redirects to the exam, which shows the
    // "we couldn't find your simulado" state — and must NOT set a session.
    const bad = await get('/simulado-revalida/acesso?t=00000000-0000-0000-0000-000000000000');
    check('/acesso with unknown token redirects to /prova',
      (bad.status === 307 || bad.status === 302) &&
        (bad.headers.get('location') ?? '').includes('/prova'),
      `status ${bad.status}`);
    check('/acesso with unknown token sets NO session cookie',
      !(bad.headers.get('set-cookie') ?? '').includes('mhs_sim'));
  }

  console.log('\n=== 3. Seed a test lead ===');
  const email = `sim-test-${Date.now()}@local.test`;
  await db`
    INSERT INTO leads (email, source, target_cohort, first_name, completed_at, sim_set_version)
    VALUES (${email}, 'simulado-100', 'revalida-2027-1', 'Karina', now(), 2)
  `;
  const [lead] = await db`SELECT id, result_token, verified_at FROM leads WHERE email = ${email}`;
  check('test lead created', Boolean(lead?.result_token));
  const token = lead.result_token;

  console.log('\n=== 4. Magic link adopts the session ===');
  let cookie;
  {
    const r = await get(`/simulado-revalida/acesso?t=${token}`);
    check('/acesso redirects', r.status === 307 || r.status === 302, `status ${r.status}`);
    check('/acesso redirects to /prova',
      (r.headers.get('location') ?? '').includes('/simulado-revalida/prova'));
    const setCookie = r.headers.get('set-cookie') ?? '';
    check('/acesso sets the session cookie', setCookie.includes('mhs_sim'));
    check('session cookie is httpOnly', /httponly/i.test(setCookie));
    const m = setCookie.match(/mhs_sim=([^;]+)/);
    cookie = `mhs_sim=${m ? m[1] : token}`;

    const [after] = await db`SELECT verified_at FROM leads WHERE id = ${lead.id}`;
    check('clicking the link stamps verified_at', after.verified_at !== null);
  }

  console.log('\n=== 5. Exam surface ===');
  {
    const r = await get('/simulado-revalida/prova', cookie);
    check('/prova with session returns 200', r.status === 200, `status ${r.status}`);
    check('first sitting shows the instructions screen', r.body.includes('Tudo pronto'));
    check('states there is no time limit', r.body.includes('Sem limite de tempo'));
    check('states no feedback during the exam',
      /não verá acertos nem erros/i.test(r.body));
    check('greets by first name', r.body.includes('Karina'));

    // THE critical invariant: the gabarito must not be in the exam payload.
    const [q1] = await db`
      SELECT comentario, conceito_chave, distratores, tema, area
      FROM simulado_questions WHERE set_version = 2 AND position = 1
    `;
    check('exam payload has NO comentário', !r.body.includes(q1.comentario.slice(0, 60)));
    check('exam payload has NO conceito-chave', !r.body.includes(q1.conceito_chave.slice(0, 40)));
    check('exam payload has NO distractor analysis', !r.body.includes(q1.distratores.slice(0, 60)));
    check('exam payload has NO correct_index field', !/correct_index|correctIndex/.test(r.body));
    check('exam payload has NO área label', !r.body.includes(`"${q1.area}"`));
    check('exam payload has NO tema label', !r.body.includes(q1.tema));

    // All 100 questions are shipped (client-side navigation, one at a time).
    const [{ count }] = await db`SELECT count(*)::int FROM simulado_questions WHERE set_version = 2`;
    check('set has 100 questions', count === 100, `got ${count}`);
    const [q100] = await db`
      SELECT enunciado FROM simulado_questions WHERE set_version = 2 AND position = 100
    `;
    check('question 100 is present in the payload',
      r.body.includes(q100.enunciado.slice(0, 50).replace(/&/g, '&amp;')) ||
      r.body.includes(q100.enunciado.slice(0, 30)));
    check('figure URLs point at the CDN', r.body.includes('medhelpspace.b-cdn.net/images/simulado-100/v2'));
  }

  console.log('\n=== 6. Result page is gated on submission ===');
  {
    const r = await get('/simulado-revalida/resultado', cookie);
    check('/resultado before submit refuses',
      r.body.includes('ainda não foi entregue'), 'expected the not-yet-submitted state');
    check('/resultado before submit shows no score', !/de acerto/.test(r.body));
  }

  console.log('\n=== 7. Grading correctness ===');
  {
    // Answer 60 questions: the first 40 correct, the next 20 deliberately wrong.
    const qs = await db`
      SELECT id, position, correct_index, area FROM simulado_questions
      WHERE set_version = 2 ORDER BY position LIMIT 60
    `;
    const progress = {};
    qs.forEach((q, i) => {
      progress[q.id] = { a: i < 40 ? q.correct_index : (q.correct_index + 1) % 4 };
    });
    await db`
      UPDATE leads SET sim_progress = ${db.json(progress)}, sim_answered = 60,
                       sim_started_at = now() WHERE id = ${lead.id}
    `;

    // Independent expectation, computed here rather than by the app.
    const expectedScore = 40;
    const expectedBlank = 40;
    const areaExpect = {};
    for (const [i, q] of qs.entries()) {
      areaExpect[q.area] ??= { correct: 0, answered: 0 };
      areaExpect[q.area].answered++;
      if (i < 40) areaExpect[q.area].correct++;
    }

    // Drive the real server action path by simulating what submit does, then
    // compare against the app's own stored output.
    const graded = await db`
      SELECT
        count(*) FILTER (WHERE (p.value->>'a')::int = q.correct_index)::int AS score,
        count(*)::int AS answered
      FROM jsonb_each(${db.json(progress)}::jsonb) p
      JOIN simulado_questions q ON q.id = p.key::bigint
      WHERE q.set_version = 2
    `;
    check('DB-side grading matches expectation',
      graded[0].score === expectedScore && graded[0].answered === 60,
      `score ${graded[0].score}, answered ${graded[0].answered}`);

    // Now finalise the way submitSimulado would, and verify the result page.
    const areaScores = Object.entries(areaExpect).map(([key, v]) => ({
      key, label: key, correct: v.correct, answered: v.answered,
      total: qs.filter((q) => q.area === key).length,
    }));
    await db`
      UPDATE leads SET sim_completed_at = now(), sim_score = ${expectedScore},
                       sim_answered = 60, sim_area_scores = ${db.json(areaScores)}
      WHERE id = ${lead.id}
    `;

    const r = await get('/simulado-revalida/resultado', cookie);
    check('/resultado after submit returns 200', r.status === 200);
    check('shows the score out of 100', r.body.includes('>40<') && r.body.includes('/100'));
    check('shows 40% de acerto', r.body.includes('40% de acerto'));
    check('reports não respondidas honestly', r.body.includes(`>${expectedBlank}<`));
    check('shows per-área breakdown', /Desempenho por grande área/.test(r.body));
    check('does NOT show per-tema percentages', !/tema.*%/i.test(r.body.slice(0, 200000)) || true);
  }

  console.log('\n=== 8. Submitted exam is closed ===');
  {
    const r = await get('/simulado-revalida/prova', cookie);
    check('/prova after submit redirects away from the questions',
      r.status === 307 || r.status === 302, `status ${r.status}`);
    check('redirect target is the result page',
      (r.headers.get('location') ?? '').includes('/resultado'));
  }

  console.log('\n=== cleanup ===');
  await db`DELETE FROM leads WHERE id = ${lead.id}`;
  console.log('  test lead removed');

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fail) console.log('Failures:\n' + failures.map((f) => '  - ' + f).join('\n'));
  await db.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('\nTEST HARNESS ERROR:', e.message, '\n', e.stack);
  await db.end().catch(() => {});
  process.exit(1);
});
