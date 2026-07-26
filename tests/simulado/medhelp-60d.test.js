/* Part of the simulado funnel suite — see tests/simulado/README.md.
   Requires: dev server on :3001 and the LOCAL Supabase stack. */
/* MedHelp 60D → Simulados 100Q: the seven boxes, Simulado 3's content, the 60D
   gate, and — critically — that none of this leaked into the public catalogue. */
const postgres = require('postgres');

const BASE = process.env.TEST_BASE || 'http://localhost:3001';
const db = postgres(process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55322/postgres', { max: 1 });

let pass = 0, fail = 0;
const failures = [];
function check(n, c, d = '') {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); }
}

async function login() {
  const r = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@local.test', password: 'devpass1234' }),
    redirect: 'manual',
  });
  const raw = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')];
  return raw.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}

async function get(path, cookie) {
  const r = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  const body = r.status >= 300 && r.status < 400 ? '' : (await r.text()).replace(/<!--\s*-->/g, '');
  return { status: r.status, body, headers: r.headers };
}

(async () => {
  console.log('\n=== 1. the seven pages exist and are 60D-gated ===');
  {
    const pages = await db`
      SELECT id, slug, title, view, type, status, specialty_id, content_module_id
      FROM pages WHERE id BETWEEN 91001 AND 91007 ORDER BY id
    `;
    check('seven pages created', pages.length === 7, `got ${pages.length}`);
    check('all view=simulados', pages.every((p) => p.view === 'simulados'));
    check('all type=h5p-quiz', pages.every((p) => p.type === 'h5p-quiz'));
    check('all published', pages.every((p) => p.status === 'publish'));
    check('all cross-specialty', pages.every((p) => p.specialty_id === null));
    check('all tagged into MedHelp 60D', pages.every((p) => p.content_module_id === 1));
    check('titled Simulado 1..7',
      pages.map((p) => p.title).join(',') === 'Simulado 1,Simulado 2,Simulado 3,Simulado 4,Simulado 5,Simulado 6,Simulado 7');
  }

  console.log('\n=== 2. Simulado 3 carries the 100 questions ===');
  {
    const qs = await db`
      SELECT position, question, answers, media_url, explanation_html
      FROM quiz_questions WHERE page_id = 91003 ORDER BY position
    `;
    check('100 questions', qs.length === 100, `got ${qs.length}`);
    check('positions are 1..100',
      qs.every((q, i) => q.position === i + 1));
    check('every question has exactly 4 alternatives',
      qs.every((q) => Array.isArray(q.answers) && q.answers.length === 4));
    check('every question has exactly one correct answer',
      qs.every((q) => q.answers.filter((a) => a.correct).length === 1));
    check('every question has a comentário', qs.every((q) => /Comentário/.test(q.explanation_html)));
    check('every question has the distractor analysis',
      qs.every((q) => /Por que as outras/.test(q.explanation_html)));
    check('every question has the conceito-chave',
      qs.every((q) => /Conceito-chave/.test(q.explanation_html)));
    check('7 questions carry a figure', qs.filter((q) => q.media_url).length === 7);

    // The member copy must agree with the funnel source, answer for answer.
    const src = await db`
      SELECT position, correct_index, alternatives FROM simulado_questions
      WHERE set_version = 2 ORDER BY position
    `;
    const mismatched = src.filter((s) => {
      const m = qs.find((q) => q.position === s.position);
      if (!m) return true;
      const correctIdx = m.answers.findIndex((a) => a.correct);
      return correctIdx !== s.correct_index;
    });
    check('member copy agrees with the funnel gabarito on all 100',
      mismatched.length === 0, `${mismatched.length} mismatched`);
  }

  console.log('\n=== 3. the other six are empty placeholders ===');
  {
    const counts = await db`
      SELECT p.id, count(q.id)::int AS n FROM pages p
      LEFT JOIN quiz_questions q ON q.page_id = p.id
      WHERE p.id BETWEEN 91001 AND 91007 GROUP BY p.id ORDER BY p.id
    `;
    const empty = counts.filter((c) => c.n === 0).map((c) => Number(c.id));
    check('six simulados await content',
      empty.length === 6 && !empty.includes(91003), empty.join(','));
  }

  console.log('\n=== 4. nothing leaked into the public catalogue ===');
  {
    const [{ leaked }] = await db`
      SELECT count(*)::int AS leaked FROM pages
      WHERE view = 'simulados' AND content_module_id = 1 AND id NOT BETWEEN 91001 AND 91007
    `;
    check('no other simulado got tagged into 60D', leaked === 0, `${leaked} pages`);

    const [{ ungated }] = await db`
      SELECT count(*)::int AS ungated FROM pages
      WHERE view = 'simulados' AND type = 'h5p-quiz' AND status = 'publish'
        AND specialty_id IS NULL AND content_module_id IS NULL
    `;
    check('public Geral grid still has its 20', ungated === 20, `got ${ungated}`);
  }

  const cookie = await login();

  console.log('\n=== 5. member-facing pages ===');
  {
    const hub = await get('/app/simulados-100q', cookie);
    check('/app/simulados-100q returns 200', hub.status === 200, `status ${hub.status}`);
    check('renders the section title', /Simulados 100Q/.test(hub.body));

    const unlocked = !/Ainda não liberado/.test(hub.body);
    if (!unlocked) {
      console.log('  (dev cohort is outside its 60D window — grid intentionally locked)');
      check('locked state explains the unlock rule', /últimos 60 dias/.test(hub.body));
    } else {
      for (let n = 1; n <= 7; n++) {
        check(`box "Simulado ${n}" rendered`, new RegExp(`Simulado ${n}<`).test(hub.body));
      }
      check('Simulado 3 links to its page', /\/app\/geral\/simulado-100q-3/.test(hub.body));
      check('empty simulados are NOT linked',
        !/\/app\/geral\/simulado-100q-1"/.test(hub.body));
      check('Simulado 3 shows a question count', /0\/100 respondidas|100 respondidas/.test(hub.body));
    }

    const sixty = await get('/app/medhelp-60d', cookie);
    check('60D accordion links to the section', /\/app\/simulados-100q/.test(sixty.body));
  }

  console.log('\n=== 5b. Simulado 3 renders as a QUIZ, not memorecards ===');
  {
    // Regression guard: h5p-quiz + content_module_id=1 used to route
    // unconditionally to MemorecardsRenderer, because MemoreCards were the only
    // 60D quiz content. A 60D simulado hitting that branch renders empty.
    const page = await get('/app/geral/simulado-100q-3', cookie);
    check('simulado page returns 200', page.status === 200, `status ${page.status}`);
    check('does NOT fall through to the empty state',
      !/Conte\u00fado em prepara\u00e7\u00e3o/.test(page.body));
    const [q1] = await db`SELECT question FROM quiz_questions WHERE page_id = 91003 AND position = 1`;
    check('question 1 is rendered',
      page.body.includes(q1.question.replace(/<[^>]+>/g, '').slice(0, 60)));
    check('figures load from the CDN',
      /medhelpspace\.b-cdn\.net\/images\/simulado-100/.test(page.body));
    check('breadcrumb resolves to Simulados 100Q', /Simulados 100Q/.test(page.body));

    // The other 60D h5p-quiz pages (view='quiz') must be untouched by that fix.
    const [mc] = await db`
      SELECT slug FROM pages
      WHERE type = 'h5p-quiz' AND content_module_id = 1 AND view = 'quiz' LIMIT 1
    `;
    if (mc) {
      const other = await get(`/app/geral/${mc.slug}`, cookie);
      check(`other 60D quiz page (${mc.slug}) still renders`, other.status === 200);
    }
  }

  console.log('\n=== 6. the public simulados tab is unchanged ===');
  {
    const est = await get('/app/estudo-por-questoes?tab=simulados', cookie);
    check('estudo-por-questoes returns 200', est.status === 200, `status ${est.status}`);
    check('does NOT show the 60D simulados',
      !/simulado-100q-/.test(est.body), 'a 60D simulado leaked into the public tab');
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fail) console.log('Failures:\n' + failures.map((f) => '  - ' + f).join('\n'));
  await db.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('HARNESS ERROR:', e.message, e.stack);
  await db.end().catch(() => {});
  process.exit(1);
});
