/* Part of the simulado funnel suite — see tests/simulado/README.md.
   Requires: dev server on :3001 and the LOCAL Supabase stack. */
/* Phase 2: the result page — diagnosis, cut-score verdict, temas discipline,
   two invitations, and the commented review of all 100 questions. */
const postgres = require('postgres');

const BASE = process.env.TEST_BASE || 'http://localhost:3001';
const db = postgres(process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55322/postgres', { max: 1 });

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function get(path, cookie) {
  const res = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  let body = res.status >= 300 && res.status < 400 ? '' : await res.text();
  body = body.replace(/<!--\s*-->/g, '');
  // The SiteContentProvider serializes the WHOLE site_content map into the page,
  // so both cut_above and cut_below appear in the payload regardless of which one
  // renders. Assertions about visible copy must ignore <script> contents.
  const rendered = body.replace(/<script[\s\S]*?<\/script>/g, '');
  return { status: res.status, body, rendered, headers: res.headers };
}

// Question text reaches the page twice — once as markup, once inside the RSC
// flight payload — and each escapes "<" its own way ("&lt;" and "<"). A
// comentário containing "K < 3,0 mEq/L" then matches neither. Decode both forms
// before looking for the raw database string.
function decodeForMatch(s) {
  return String(s)
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0026/gi, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Build a lead whose exam is already submitted, with a known answer pattern.
async function seed({ email, correct, wrong, blankFlagged }) {
  const qs = await db`
    SELECT id, position, correct_index, area, tema FROM simulado_questions
    WHERE set_version = 2 ORDER BY position
  `;
  const progress = {};
  qs.slice(0, correct).forEach((q) => { progress[q.id] = { a: q.correct_index }; });
  qs.slice(correct, correct + wrong).forEach((q) => {
    progress[q.id] = { a: (q.correct_index + 1) % 4 };
  });
  const flagged = qs.slice(correct + wrong, correct + wrong + blankFlagged).map((q) => Number(q.id));

  await db`
    INSERT INTO leads (email, source, target_cohort, first_name, completed_at,
                       sim_set_version, sim_progress, sim_flagged, sim_answered,
                       sim_started_at, sim_completed_at, sim_score, verified_at)
    VALUES (${email}, 'simulado-100', 'revalida-2027-1', 'Karina', now(), 2,
            ${db.json(progress)}, ${db.json(flagged)}, ${correct + wrong},
            now(), now(), ${correct}, now())
  `;
  const [lead] = await db`SELECT result_token FROM leads WHERE email = ${email}`;
  return { cookie: `mhs_sim=${lead.result_token}`, qs, progress, flagged };
}

(async () => {
  const emailBelow = `rep-below-${Date.now()}@local.test`;
  const emailAbove = `rep-above-${Date.now()}@local.test`;

  console.log('\n=== 1. BELOW the cut line (40 certas, 30 erradas, 30 em branco) ===');
  const below = await seed({ email: emailBelow, correct: 40, wrong: 30, blankFlagged: 5 });
  let body;
  {
    const r = await get('/simulado-revalida/resultado', below.cookie);
    body = r.body;
    check('returns 200', r.status === 200, `status ${r.status}`);
    check('shows score 40/100', body.includes('>40<') && body.includes('/100'));
    check('shows 40% de acerto', body.includes('40% de acerto'));
    check('counts certas/erradas/não respondidas', /40<\/strong> certas/.test(body) &&
      /30<\/strong> erradas/.test(body) && /30<\/strong> não respondidas/.test(body));
    check('cut-score verdict says 20 points short',
      /Faltaram 20 ponto/.test(body), 'expected the below-cut copy');
    check('does NOT show the above-cut copy', !/acima da nota de corte/.test(r.rendered));
    check('cut score reads 60 from site_content', /60\/100/.test(body));
  }

  console.log('\n=== 2. per-área section ===');
  {
    check('renders the área heading', /Desempenho por grande área/.test(body));
    const areas = await db`
      SELECT area, count(*)::int AS total FROM simulado_questions
      WHERE set_version = 2 GROUP BY area
    `;
    check('all five grandes áreas present', areas.length === 5);
    for (const a of areas) {
      const label = {
        'clinica-medica': 'Clínica Médica', cirurgia: 'Cirurgia Geral',
        go: 'Ginecologia e Obstetrícia', pediatria: 'Pediatria',
        'saude-coletiva': 'Saúde Coletiva',
      }[a.area];
      check(`área "${label}" shown`, body.includes(label));
    }
    check('shows best/worst summary', /Melhor desempenho em/.test(body));
    check('shows "Por onde começar"', /Por onde começar/.test(body));
  }

  console.log('\n=== 3. temas discipline (the statistical rule) ===');
  {
    check('temas section present', /Temas que merecem revisão/.test(body));
    check('temas carry the "not a verdict" caveat',
      /não como um diagnóstico definitivo/.test(body));

    // Every listed tema must belong to a question actually answered WRONG.
    const wrongTemas = new Set();
    for (const q of below.qs) {
      const pick = below.progress[q.id];
      if (pick && pick.a !== q.correct_index) wrongTemas.add(q.tema);
    }
    const correctTemas = below.qs
      .filter((q) => below.progress[q.id]?.a === q.correct_index)
      .map((q) => q.tema);

    // A tema whose question was answered CORRECTLY must not appear as needing
    // review. Compare EXACT chip text, not substrings — several temas are prefixes
    // of others ("Hipertensão arterial" vs "Hipertensão arterial com albuminúria
    // no diabetes"), and substring matching produces false leaks.
    const temaBlock = body.split('Temas que merecem revisão')[1]?.split('Por onde começar')[0] ?? '';
    const listed = new Set(
      [...temaBlock.matchAll(/ring-1 ring-border[^>]*>([^<]+)</g)].map((m) => m[1].trim()),
    );
    check('every listed tema comes from a MISSED question',
      [...listed].every((t) => wrongTemas.has(t)),
      [...listed].filter((t) => !wrongTemas.has(t)).slice(0, 3).join(' | '));
    check('every missed tema is listed',
      [...wrongTemas].every((t) => listed.has(t)),
      [...wrongTemas].filter((t) => !listed.has(t)).slice(0, 3).join(' | '));

    // The hard rule: no per-tema percentage anywhere.
    check('no per-tema percentage rendered',
      !new RegExp(`${[...wrongTemas][0]}[^<]{0,40}%`).test(body));
  }

  console.log('\n=== 4. two invitations, correctly placed ===');
  {
    const i1 = body.indexOf('Transforme esse diagnóstico em um plano');
    const i2 = body.indexOf('Esse nível de comentário');
    const review = body.indexOf('Gabarito comentado');
    check('invitation #1 present', i1 > -1);
    check('invitation #2 present', i2 > -1);
    check('review section present', review > -1);
    check('invitation #1 comes BEFORE the review', i1 > -1 && review > -1 && i1 < review);
    check('invitation #2 comes AFTER the review', i2 > -1 && review > -1 && i2 > review);
    check('diagnosis comes before invitation #1',
      body.indexOf('Desempenho por grande área') < i1);
    check('invitation #2 carries the offer/checkout',
      /Garantir minha vaga|Ver turmas com|Conhecer a plataforma completa/.test(body));
  }

  console.log('\n=== 5. commented review of all 100 ===');
  {
    const all = await db`
      SELECT position, comentario, distratores, conceito_chave, tema
      FROM simulado_questions WHERE set_version = 2 ORDER BY position
    `;
    check('all 100 questions rendered', all.every((q) => body.includes(`Questão ${q.position}<`)),
      'a question header is missing');
    const haystack = decodeForMatch(body);
    const missing = (field, len) =>
      all.filter((q) => !haystack.includes(q[field].slice(0, len))).map((q) => q.position);
    const missComentario = missing('comentario', 40);
    const missDistratores = missing('distratores', 40);
    const missConceito = missing('conceito_chave', 30);
    check('comentários present', missComentario.length === 0,
      `missing on Q${missComentario.join(', Q')}`);
    check('distractor analysis present', missDistratores.length === 0,
      `missing on Q${missDistratores.join(', Q')}`);
    check('conceito-chave present', missConceito.length === 0,
      `missing on Q${missConceito.join(', Q')}`);
    check('filters rendered', /Que eu errei/.test(body) && /Não respondidas/.test(body) &&
      /Marcadas/.test(body) && /Todas/.test(body));
    check('figures lazy-loaded', /loading="lazy"/.test(body));
  }

  console.log('\n=== 6. ABOVE the cut line (75 certas) ===');
  {
    const above = await seed({ email: emailAbove, correct: 75, wrong: 25, blankFlagged: 0 });
    const r = await get('/simulado-revalida/resultado', above.cookie);
    check('shows score 75/100', r.body.includes('>75<'));
    check('verdict says 15 points above the cut',
      /15 ponto\(s\) acima da nota de corte|acima da nota de corte/.test(r.body));
    check('does NOT show the below-cut copy', !/Faltaram \d+ ponto/.test(r.rendered));
    check('no "não respondidas" left', /0<\/strong> não respondidas/.test(r.body));
  }

  console.log('\n=== 7. the gate still holds ===');
  {
    // Un-submit and confirm the gabarito disappears again.
    await db`UPDATE leads SET sim_completed_at = NULL WHERE email = ${emailBelow}`;
    const r = await get('/simulado-revalida/resultado', below.cookie);
    check('un-submitted exam refuses the report', /ainda não foi entregue/.test(r.body));
    const [q1] = await db`
      SELECT comentario FROM simulado_questions WHERE set_version = 2 AND position = 1
    `;
    check('no comentário leaks when not submitted',
      !r.body.includes(q1.comentario.slice(0, 40)));
    check('no score leaks when not submitted', !/de acerto/.test(r.body));

    const noSession = await get('/simulado-revalida/resultado');
    check('no session leaks no comentário',
      !noSession.body.includes(q1.comentario.slice(0, 40)));
  }

  console.log('\n=== cleanup ===');
  await db`DELETE FROM leads WHERE email IN (${emailBelow}, ${emailAbove})`;
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
