/* Part of the simulado funnel suite — see tests/simulado/README.md.
   Requires: dev server on :3001 and the LOCAL Supabase stack. */
/* Verifies the five simulado e-mails: stored copy matches the v2 product, every
   {{tag}} they use is declared and resolvable, and the non-finisher reminders
   never leak a diagnosis. */
const path = require('path');
const postgres = require('postgres');
const db = postgres(process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55322/postgres', { max: 1 });

let pass = 0, fail = 0;
const failures = [];
function check(n, c, d = '') {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); }
}

const KINDS = ['lead-sim-access', 'lead-sim-d2', 'lead-sim-d5', 'lead-sim-finish-1', 'lead-sim-finish-2'];
const NON_FINISHER = ['lead-sim-finish-1', 'lead-sim-finish-2'];

// Claims that described the v1 product and must not survive anywhere.
const STALE = [
  [/quest(õ|o)es reais/i, 'questões reais'],
  [/provas reais/i, 'provas reais'],
  [/\b202[0-5]\b/, 'a 2020–2025 edition year'],
  [/bloco/i, 'blocos (the set is interleaved now)'],
  [/corre(ç|c)(ã|a)o na hora/i, 'correção na hora (no feedback during the exam)'],
];

(async () => {
  const rows = await db`
    SELECT kind, name, subject, headline, body_html, cta_label, cta_href, variables, active
    FROM email_templates WHERE kind LIKE 'lead-sim%' ORDER BY sort_order
  `;

  console.log('\n=== 1. all five present and active ===');
  check('five simulado templates', rows.length === 5, `got ${rows.length}`);
  for (const k of KINDS) {
    check(`${k} exists`, rows.some((r) => r.kind === k));
  }
  check('all active', rows.every((r) => r.active));

  console.log('\n=== 2. no stale v1 claims ===');
  for (const r of rows) {
    const text = [r.subject, r.headline, r.body_html, r.cta_label, r.name].join(' ');
    for (const [re, label] of STALE) {
      check(`${r.kind}: no "${label}"`, !re.test(text));
    }
  }

  console.log('\n=== 3. every {{tag}} used is declared ===');
  for (const r of rows) {
    const declared = new Set((r.variables ?? []).map((v) => v.tag));
    const used = new Set(
      [...[r.subject, r.headline, r.body_html, r.cta_label, r.cta_href].join(' ')
        .matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]),
    );
    const undeclared = [...used].filter((t) => !declared.has(t));
    check(`${r.kind}: no undeclared tags`, undeclared.length === 0, undeclared.join(', '));
    const unused = [...declared].filter((t) => !used.has(t));
    check(`${r.kind}: no declared-but-unused tags`, unused.length === 0, unused.join(', '));
  }

  console.log('\n=== 4. the cron supplies every tag these templates need ===');
  {
    const fs = require('fs');
const path = require('path');
    const cron = fs.readFileSync(
      path.join(__dirname, '..', '..', 'app/src/app/api/cron/simulado-drip/route.ts'), 'utf8');
    const varsBlock = cron.slice(cron.indexOf('const vars: Record<string, string> = {'),
      cron.indexOf('// Reserve-first conditional claim'));
    const supplied = new Set([...varsBlock.matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]));

    // lead-sim-access is sent by the start action, not the cron.
    for (const r of rows.filter((x) => x.kind !== 'lead-sim-access')) {
      const used = new Set(
        [...[r.subject, r.headline, r.body_html, r.cta_label, r.cta_href].join(' ')
          .matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]),
      );
      const missing = [...used].filter((t) => !supplied.has(t));
      check(`${r.kind}: cron supplies all tags`, missing.length === 0, missing.join(', '));
    }

    const access = rows.find((r) => r.kind === 'lead-sim-access');
    const startAction = fs.readFileSync(
      path.join(__dirname, '..', '..', 'app/src/actions/simulado.ts'), 'utf8');
    const usedAccess = [...[access.subject, access.headline, access.body_html,
      access.cta_label, access.cta_href].join(' ').matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const missingAccess = usedAccess.filter((t) => !startAction.includes(`${t}:`));
    check('lead-sim-access: startSimulado supplies all tags',
      missingAccess.length === 0, missingAccess.join(', '));
  }

  console.log('\n=== 5. non-finisher reminders leak no diagnosis (Karina rule) ===');
  for (const r of rows.filter((x) => NON_FINISHER.includes(x.kind))) {
    const text = [r.subject, r.headline, r.body_html, r.cta_label].join(' ');
    check(`${r.kind}: no score tag`, !/\{\{simScore\}\}|\{\{score\}\}/.test(text));
    check(`${r.kind}: no per-área performance claim`,
      !/(seu|seus) desempenho em|voc(ê|e) acertou|% de acerto/i.test(text));
    check(`${r.kind}: uses the progress line`, /\{\{progressLine\}\}/.test(text));
    check(`${r.kind}: says the diagnosis unlocks on submission`,
      /ao entregar/i.test(text));
  }

  console.log('\n=== 6. progressLine covers every case ===');
  {
    const fs = require('fs');
    const cron = fs.readFileSync(
      path.join(__dirname, '..', '..', 'app/src/app/api/cron/simulado-drip/route.ts'), 'utf8');
    const fn = cron.slice(cron.indexOf('function progressLineFor'),
      cron.indexOf('export const dynamic'));
    check('handles "answered everything, not submitted"', /answered >= SIMULADO_TOTAL/.test(fn));
    check('handles "answered nothing"', /answered === 0/.test(fn));
    check('handles "below the submit minimum"', /SIMULADO_MIN_ANSWERS/.test(fn));
    check('never interpolates a score', !/simScore|sim_score/.test(fn));
  }

  console.log('\n=== 7. the D0 e-mail reads as a RESUME link, not a delivery ===');
  {
    const a = rows.find((r) => r.kind === 'lead-sim-access');
    const text = [a.subject, a.headline, a.body_html, a.cta_label].join(' ');
    check('frames itself as the return link', /link de retorno|voltar/i.test(text));
    check('does not tell them to start something they already started',
      !/come(ç|c)ar meu simulado|seu simulado est(á|a) pronto/i.test(text));
    check('mentions there is no time limit', /não há limite de tempo/i.test(text));
    check('mentions the gabarito unlocks on submission', /entregar/i.test(text));
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
