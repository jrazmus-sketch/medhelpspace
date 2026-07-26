# Simulado funnel test suites

234 checks over `/simulado-revalida` (the free 100-question funnel) and the MedHelp
60D "Simulados 100Q" section. Plain Node scripts — no test framework — because they
assert against a running app and a real database rather than mocks.

```bash
node tests/simulado/run-all.js          # everything
node tests/simulado/pages.test.js       # one suite
```

## Prerequisites

- Dev server on **:3001** (`cd app && npx next dev -p 3001`)
- The **local** Supabase stack up (`npx supabase start`) — `npm run dev` reads
  `app/.env.development.local`, which points there
- The v2 question set imported locally (see `data/simulado-100-v2/README.md`)

Overridable: `TEST_BASE`, `DATABASE_URL`.

Every suite seeds its own leads and deletes them afterwards. They are safe to
re-run, and they never touch production.

## The suites

| Suite | Covers |
|---|---|
| `pages.test.js` | Landing copy, unauthenticated gating, magic-link session handoff, the exam payload, grading, the result page |
| `actions.test.js` | The **real server actions** over HTTP: start, save, submit, plus tamper, hijack and no-session paths |
| `report.test.js` | Diagnosis, cut-score verdict both directions, tema discipline, invitation placement, the commented review |
| `emails.test.js` | The five `lead-sim-*` templates: no stale v1 claims, every `{{tag}}` declared **and** supplied by its sender, the no-diagnosis rule |
| `medhelp-60d.test.js` | The seven 60D pages, Simulado 3's content, non-leakage into the public catalogue, renderer routing |
| `prod-smoke.js` | Runs against **production** with a temporary `is_test` lead, then deletes it |

## The invariants these exist to protect

Several were written after a real bug got through. Don't delete them casually.

- **The gabarito is never in the exam payload** — no comentário, conceito-chave,
  distractor text, `correct_index`, área or tema. The entire no-feedback design is
  decorative without this.
- **Correctness is never accepted from the client.** `actions.test.js` submits 70
  answers each falsely claiming `c: true` and asserts the score is what was
  actually earned.
- **Re-entering an e-mail that already has exam activity never hands out a
  session** — otherwise anyone could read a stranger's answers.
- **No partial diagnosis.** A non-finisher reminder may carry a progress count and
  nothing else: no score, no per-área performance, no comentário. Karina's rule.
- **Per-tema percentages are never rendered.** All 100 questions cover distinct
  temas, so any rate would be 0% or 100% from one question.
- **The 60D simulados never appear in the public catalogue**, and a 60D simulado
  renders as a quiz rather than as memorecards (that one *was* a live bug).

## Harness notes worth knowing

- **Server actions are driven over HTTP** by extracting the action id from the
  `__next_internal_action_entry_do_not_use__` comment in the client chunk, then
  POSTing with a `Next-Action` header. This is what caught the client-trusts-itself
  scoring bug — an HTTP-only test could not have.
- **Assertions run against rendered HTML, not source.** That is what caught
  `site_content` rows silently overriding component fallbacks and keeping false
  product claims live.
- Strip React's `<!-- -->` text-node separators before substring matching, and
  ignore the serialized site-content blob in the payload — it contains other
  funnels' keys and produces false positives.
- Prefer exact matches over substrings for content assertions: several temas are
  prefixes of others (*Hipertensão arterial* vs *Hipertensão arterial com
  albuminúria no diabetes*) and substring matching reported a leak that wasn't real.
- After deploying, production can serve the previous build for a minute or two.
  Poll for a marker unique to the new build with a cache-buster before concluding
  anything failed.
