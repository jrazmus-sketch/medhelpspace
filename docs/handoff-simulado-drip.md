# Handoff — Simulado 100Q drip rebuild (Phases 3 + 4)

Paste this into a fresh session. Everything below is current as of 2026-07-25.

---

## What you're picking up

`/simulado-revalida` is a free 100-question Revalida simulado used as a lead funnel.
It was rebuilt end to end today and is **live in production**: landing → immediate
start → exam → submit → diagnosis + commented gabarito → offer. Cold paid traffic
has not been pointed at it yet.

The **content and the on-site experience are done**. The **follow-up sequence is
not** — the email copy was rewritten for the new product, but the cron still runs
the original two-step structure. That's the job.

Read `docs/simulado-drip-design.md` first. It is the agreed design and it is
current; this handoff tells you what's actually built versus what that doc still
describes as future.

---

## Current state of the drip

`app/src/app/api/cron/simulado-drip/route.ts`

- Two steps only: `+1 day` and `+3 days`, clocked from `leads.completed_at`.
- Branches solely on `sim_completed_at`:
  finisher → `lead-sim-d2` then `lead-sim-d5`;
  non-finisher → `lead-sim-finish-1` then `lead-sim-finish-2`.
- Coupon lands exactly once on either path.
- Reserve-first claim on `drip_step` so overlapping runs can't double-send;
  reverted on send failure. **Keep this pattern.**
- Buyer exclusion via `user_cohort_memberships` → `profiles.email`.
- Schedule in `app/vercel.json`; auth is `Bearer CRON_SECRET`.
- Already correct and reusable: `progressLineFor(answered)`, which builds the only
  performance sentence a non-finisher may receive.

All five `lead-sim-*` templates were rewritten for the v2 product in `b4733c4` and
are **factually correct** — don't rewrite them wholesale; extend.

Review any email rendered with sample data at **`/admin/email-templates/revisao`**.

---

## What to build

### Phase 3 — cohort intelligence (do this first; Phase 4 depends on it)

1. **`leads.target_cohort` CHECK → foreign key on `cohorts.slug`.** It's currently a
   hardcoded slug allowlist. The four live slugs work, but the day a new turma is
   added the funnel silently rejects signups for it. Historical rows stay valid
   because retired cohorts keep their row (`active` stays true; `is_for_sale` goes
   false).
2. **Exam-date phase engine.** Derive from the lead's turma `test_date`:
   `distante` >180d · `preparação` 180–90 · `reta final` 90–30 · `véspera` <30.
   `app/src/lib/cohort-timing.ts` already computes days-to-exam for urgency copy —
   extend it rather than starting fresh.
3. **Post-exam rollover.** A lead whose target exam date has passed must stop
   receiving prep mail and be rolled to the next turma or re-asked. Nothing
   prevents this today.
4. **"Ainda não decidi" track.** Those leads have no `test_date`, so no timing logic
   applies. Short sequence whose only goal is to obtain the turma, then merge into
   the timed track. `leads.previous_target_cohort` already records changes.

### Phase 4 — the sequence

5. **One sales spine, different on-ramps.** Not parallel finisher/non-finisher
   tracks — that's how non-finishers get forgotten. Everyone converges; what differs
   is how long before they enter and how personalised the opening is.
6. **Segment by engagement depth, not finished/unfinished:**
   cold (never started) · bounced (<10 answered) · engaged (10–59) · deep (60+,
   including finishers). Depth sets how long to wait before the ask; shallow
   segments get a longer value runway first.
7. **The ~7-day pivot.** Days 1–7 are finish nudges; after that stop asking and
   enter the sales sequence. The attempt itself stays open forever (see rules).
8. **Two cases the current templates can't express:**
   - answered all 100 but never submitted → "falta só entregar"
   - fewer than 50 answered → the nudge must name the 50-question threshold rather
     than invite a submission that will be refused.
   `progressLineFor()` already handles both — the *sequence* doesn't.
9. **Suppress sales for `véspera` and for all `revalida-2026-2` leads** until after
   the 13/09/2026 exam. That turma is closed for sale and their exam is imminent —
   they get content only, then roll to 2027.1.
10. **Template selection becomes (funnel step × phase)**, with vars
    `{{cohortName}}`, `{{testDate}}`, `{{daysUntilTest}}`, `{{phase}}`.

---

## Hard rules — do not violate

**Karina's rule, and it is absolute:** no partial diagnosis, ever. Nothing
auto-finalises, no attempt expires. A non-finisher reminder may carry a **bare
progress count only** — never a score, never per-área performance, never a
comentário. The diagnosis and gabarito are released strictly on submission.
There are tests asserting this; keep them passing.

**Never bulk-send to unverified addresses.** Domain reputation degrades every funnel
at once. Unverified leads go through the existing recovery flow first; the drip
engages only after a click.

**Await every email send.** Fire-and-forget is frozen by the serverless runtime.

**`lead-drip` and `lead-recovery` both exclude `source='simulado-100'`.** That
exclusion is what keeps `drip_step` exclusively owned by `simulado-drip`. Keep it.

**A `"use server"` module may export async functions only.** Exporting a type or
const from one crashes every route that imports it.

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
- **`site_content` DB rows beat component fallbacks.** Editing a fallback string
  changes nothing on a page whose key is seeded. Product claims need a patch with
  `ON CONFLICT (key) DO UPDATE`; the usual `DO NOTHING` seed will not fix wrong copy.
- **Re-running `schema-patch-simulado-revalida-content.sql` resets all five email
  templates to v1 defaults** (it uses `DO UPDATE`). Don't.
- **`postgres` JSONB:** pass `${db.json(obj)}`, never `JSON.stringify(...)::jsonb`.
- **Dev server is pinned to port 3001** for this project; leave 3000 free.
- **Commit by explicit path.** A blanket `git add` sweeps `dev/`, `supabase/`,
  `.next/` and screenshot folders into the repo.
- **Chrome:** the `chrome-devtools-mcp` profile is usually locked by a running
  browser. Do not kill it. `scripts/capture-simulado-shots.js` shows the safe
  pattern — puppeteer-core against a throwaway `userDataDir`.

---

## Data facts you'll need

- Cohorts: `revalida-2026-2` (exam 13/09/2026, `is_for_sale = false`, still
  `active`), `revalida-2027-1`, `revalida-20272`, plus the `undecided` sentinel.
- The turma picker reads every **active** cohort ordered by `test_date` —
  deliberately not filtered by `is_for_sale`, because its job is segmentation.
- Coupons per turma live in `WELCOME_COUPONS` / `RECOVERY_COUPONS`
  (`app/src/lib/magnet/links.ts`).
- Relevant `leads` columns: `sim_progress`, `sim_answered`, `sim_started_at`,
  `sim_completed_at` (= submitted), `sim_score`, `sim_area_scores`, `sim_flagged`,
  `sim_set_version`, `sim_reminder_step`, `drip_step`, `drip_status`,
  `target_cohort`, `previous_target_cohort`, `verified_at`.
- Question set: `simulado_questions` at `set_version = 2`, 100 rows, áreas
  39/18/17/16/10 (CM / GO / Pediatria / Cirurgia Geral / Saúde Coletiva).

---

## Testing

⚠️ **The 234 automated checks written today live in the session scratchpad, not in
the repo, and will be gone.** They covered page rendering, the real server actions
(including tamper/hijack paths), the report, the emails, and the 60D section.

Re-establishing them is worth doing — ideally committed this time. The patterns
that worked:

- Drive **real server actions over HTTP** by extracting the action id from the
  `__next_internal_action_entry_do_not_use__` comment in the client chunk, then
  POSTing with a `Next-Action` header. This is what caught the client-trusts-itself
  scoring bug.
- Assert on **rendered HTML**, not source — that's what caught the stale
  `site_content` copy. Strip React's `<!-- -->` separators first, and ignore the
  serialized site-content blob in the payload (it contains other funnels' keys and
  produces false positives).
- Seed leads directly in the local DB, then delete them in a `finally`.
- For the drip specifically: assert that a non-finisher email **never** contains a
  score or per-área figure, for every phase and depth combination.

Also verify on production after deploy — Vercel's rollout races, and a fetch
seconds after "deployed" can still return the previous build. Poll for a
marker unique to the new build, with a cache-buster.
