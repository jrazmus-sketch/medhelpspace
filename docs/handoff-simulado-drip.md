# Simulado 100Q drip — status and operating notes

Phases 3 + 4 (cohort intelligence and the sequence) were **built 2026-07-26**.
This file was the handoff that specified them; it is now the record of what was
built, plus the environment notes that are still worth an hour each.

Read `docs/simulado-drip-design.md` for the design and the file map.

---

## What `/simulado-revalida` is

A free 100-question Revalida simulado used as a lead funnel, live in production:
landing → immediate start → exam → submit → diagnosis + commented gabarito →
offer. Cold paid traffic has not been pointed at it yet, and at the time of
writing production has **zero** `source='simulado-100'` leads.

---

## The sequence, as built

`app/src/app/api/cron/simulado-drip/route.ts` does the I/O;
`app/src/lib/magnet/simulado-drip.ts` makes every decision and is pure.

**Ladder.** Rungs at days 1, 3, 6, 9, 13, 18, 25, 33 from `leads.completed_at`
(stamped when the exam starts). One rung fires at most one email. A rung that
resolves to *hold* is not claimed, so a suppressed lead resumes where they left
off instead of silently burning the sequence.

**Three counters, not one.** `drip_step` is the rung and the reserve-first claim
token; `sim_reminder_step` counts finish nudges; `sim_sales_step` counts the
sales spine. Conflating them is what made "one spine, different on-ramps"
impossible to express before.

**Depth sets the pivot, not whether we ask.**

| Depth | Answered | Pivots to selling at |
|---|---|---|
| cold | 0 | never — nudges only, then stops |
| bounced | 1–9 | day 8 |
| engaged | 10–59 | day 5 |
| deep | 60+, or submitted | day 2 (a finisher is never nudged) |

**One spine.** Rungs 1–2 of the sales sequence are the on-ramp and differ only in
whether the lead has a diagnosis to talk about (`lead-sim-d2`/`d5` for a
finisher, `lead-sim-sales-1`/`-2` for everyone else). Rungs 3–4 are identical for
the whole list.

**Suppression.** A turma with `is_for_sale = false`, or any lead in `véspera`
(<30 days to the exam), receives `lead-sim-valor` — content, no coupon, no
checkout link — at most twice, then the sequence holds. This is the general rule,
not a hardcoded 2026.2 check: when that turma's exam passes, the rollover moves
its leads onto the next turma and the suppression lifts by itself.

**Post-exam rollover.** A lead whose turma's `test_date` has passed is moved to
the soonest active future turma, keeps their original pick in
`previous_target_cohort`, and gets `lead-sim-rollover` — which says so and offers
a one-click correction. Rolling makes the condition false, so it cannot repeat.

**Undecided track.** Rungs 1 and 3 send `lead-sim-turma`, a block of one-click
turma buttons. Clicking one hits `/api/leads/turma`, which validates, records,
stamps `verified_at`, hands over the exam session cookie and redirects to
`/simulado-revalida/turma` — no token left in the address bar. Answering makes
the second ask never happen; the lead merges into the timed track.

**Deliverability gate.** The scan excludes leads with neither `verified_at` nor
`sim_started_at`. An address that has never clicked anything and never did
anything on site is not a lead yet.

---

## Hard rules — do not violate

**Karina's rule, and it is absolute:** no partial diagnosis, ever. Nothing
auto-finalises, no attempt expires. A non-finisher message may carry a **bare
progress count only** — never a score, never per-área performance, never a
comentário. `simScore` is populated only for a submitted attempt.
`scripts/test-simulado-drip.mjs` walks every phase × depth combination and
asserts no reachable template can leak a diagnosis. **Keep it passing.**

**Never bulk-send to unverified addresses.** Domain reputation degrades every
funnel at once. See the deliverability gate above.

**Await every email send.** Fire-and-forget is frozen by the serverless runtime.

**`lead-drip` and `lead-recovery` both exclude `source='simulado-100'`.** That
exclusion is what keeps `drip_step` exclusively owned by `simulado-drip`.

**A `"use server"` module may export async functions only.** Exporting a type or
const from one crashes every route that imports it.

**The welcome coupon may now repeat** (finish-2 and the later sales rungs both
carry it). The old "exactly once" rule existed to stop a lead falling between two
forked tracks and getting none; with one spine everybody reaches it.

---

## Environment gotchas that will cost you an hour each

- **`scripts/run-sql.js` targets PRODUCTION.** `npm run dev` reads
  `app/.env.development.local`, which points at the **local** Supabase stack
  (API `127.0.0.1:55321`, Postgres `127.0.0.1:55322`, `postgres/postgres`).
  Apply every patch to **both**:
  `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/run-sql.js <file>`
- **`run-sql.js` reporting "0 rows affected" on an UPDATE is a display bug.** Verify
  with a SELECT before concluding nothing happened.
- **After DDL on the local stack, run `NOTIFY pgrst, 'reload schema'`** or
  service-role selects on new columns fail silently.
- **Email templates: generate the SQL, don't transcribe it.**
  `node scripts/gen-email-template-seed.js <kind>…` emits an idempotent seed block
  straight from `EMAIL_TEMPLATE_DEFAULTS`, which is where the "keep in sync"
  note on every email patch actually gets honoured.
- **`site_content` DB rows beat component fallbacks.** Editing a fallback string
  changes nothing on a page whose key is seeded. Product claims need a patch with
  `ON CONFLICT (key) DO UPDATE`; the usual `DO NOTHING` seed will not fix wrong copy.
- **Re-running `schema-patch-simulado-revalida-content.sql` resets all five original
  email templates to v1 defaults** (it uses `DO UPDATE`). Don't.
- **`postgres` JSONB:** pass `${db.json(obj)}`, never `JSON.stringify(...)::jsonb`.
- **Dev server is pinned to port 3001** for this project; leave 3000 free.
- **Commit by explicit path.** A blanket `git add` sweeps `dev/`, `supabase/`,
  `.next/` and screenshot folders into the repo.
- **Chrome:** the `chrome-devtools-mcp` profile is usually locked by a running
  browser, so `/mobile-check` fails to attach. Do not kill it.
  `scripts/capture-simulado-shots.js` shows the safe pattern — puppeteer-core
  (`npm i --no-save puppeteer-core`) against a throwaway `userDataDir`.

---

## Data facts you'll need

- Cohorts (prod): `revalida-2026-2` (exam 13/09/2026, `is_for_sale = false`, still
  `active`), `revalida-2027-1`, `revalida-20272`, `test-cohort-2028` (inactive),
  plus the `undecided` sentinel — which is **not** a cohorts row.
- `leads.target_cohort` is validated by the `leads_target_cohort_valid` trigger
  against the live `cohorts` table (plus the sentinel), NOT by a slug allowlist.
  A turma added in the admin panel is selectable the same day. Renaming a
  `cohorts.slug` cascades into `leads` via `cohorts_slug_rename_cascade`.
- The turma picker reads every **active** cohort ordered by `test_date` —
  deliberately not filtered by `is_for_sale`, because its job is segmentation.
- Coupons per turma live in `WELCOME_COUPONS` / `RECOVERY_COUPONS`
  (`app/src/lib/magnet/links.ts`).
- Relevant `leads` columns: `sim_progress`, `sim_answered`, `sim_started_at`,
  `sim_completed_at` (= submitted), `sim_score`, `sim_area_scores`, `sim_flagged`,
  `sim_set_version`, `sim_reminder_step`, `sim_sales_step`, `drip_step`,
  `drip_status`, `target_cohort`, `previous_target_cohort`, `verified_at`.
- Question set: `simulado_questions` at `set_version = 2`, 100 rows, áreas
  39/18/17/16/10 (CM / GO / Pediatria / Cirurgia Geral / Saúde Coletiva).

---

## Testing

`node scripts/test-simulado-drip.mjs` — 25 assertions over the pure sequence
logic and the template copy. No DB, no network, no test runner: both modules are
type-only at runtime, so Node loads the TypeScript directly.

Review any email rendered with sample data at **`/admin/email-templates/revisao`**.

Still worth re-establishing (these were written in a session scratchpad on
2026-07-25 and are gone): the HTTP-level checks that drove the **real server
actions** by extracting the action id from the
`__next_internal_action_entry_do_not_use__` comment in the client chunk and
POSTing with a `Next-Action` header — that is what caught the
client-trusts-itself scoring bug. Assert on **rendered HTML**, not source (that
is what caught stale `site_content` copy); strip React's `<!-- -->` separators
first and ignore the serialized site-content blob, which contains other funnels'
keys and produces false positives.

Verify on production after deploy — Vercel's rollout races, and a fetch seconds
after "deployed" can still return the previous build. Poll for a marker unique to
the new build, with a cache-buster.

---

## Open

- **Deployed 2026-07-26** (`bf76171`), DB patch applied to prod and local.
  Verified live: `/simulado-revalida/turma` returns 200 with its own copy and
  `/api/cron/simulado-drip` 401s without the Bearer secret. The **first
  scheduled run** (14:30 UTC, `app/vercel.json`) has not happened yet — with zero
  `source='simulado-100'` leads in production it should report `sent: 0`.
- **`bulk-assign-cohort-modal.tsx` still lists turmas by hand.** The server
  action behind it now validates against `cohorts`, so a new turma is *accepted* —
  it just isn't *offered* in that admin modal until someone edits the array.
- **The ~7-day pivot is a guess** and is the single most testable number in the
  funnel. Instrument it before tuning it.
- **Karina's review of the área weighting** and the answer-letter bias
  (`docs`/memory: 33/136 pages skewed) are still open from the v2 build.
