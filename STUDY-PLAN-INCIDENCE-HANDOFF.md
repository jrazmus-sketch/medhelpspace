# Incidence-Weighted Study Plan — Handoff

**Status (2026-07-02):** Phase 0 applied to prod (data). Phases 1–3 built and
committed **locally on `main`, NOT pushed / NOT deployed**. Validated at the
static + data level only — **not yet verified in a running app**.

**Commits (local, unpushed):**
- `90e1bfa` — Phase 0–2 (schema + engine + resource picker)
- `d19897f` — Phase 3 (roadmap view + onboarding)

---

## What this is

Ranks the member study plan by the **real Revalida topic incidence (2020–2025.2)**
— most-tested topics first, tiered A/B/C/D — instead of by specialty in ID order.
Extends the existing adaptive Study Plan and feeds the existing Revisão (SM-2)
system; it does **not** replace either. Karina's idea, arrived via a ChatGPT
prompt; her incidence numbers were **verified real** against our own DB (below).

---

## Verified: the incidence numbers are real

The real past-exam bank is `pages.view = 'quiz'` — 204 topic pages, 891 questions,
years 2020–2025 (parsed from each question's `(Revalida YYYY)` text). Computing
per-topic counts from our DB matched the prompt's numbers: ~13 of 22 tier-A topics
**exact**, the rest within ±1–3 (drift = broader Atenção Básica / Ética buckets,
duplicate pages, version). So incidence is **computable from our own data** and
**auto-updates** as new exam years are imported — no spreadsheet needed.

`view = 'simulados'` (294 pages, 4,889 questions) is a **separate** resource
(Karina's mock exams), NOT the past-exam bank.

---

## Data model (in prod)

`schema-patch-topics.sql` (applied). Two public-read / admin-write tables:

- **`topics`** — one row per exam topic. `incidence_count` = # past-exam questions
  on its `source_page_id`; `priority_tier` is a **STORED generated column**
  (A≥9 · B 6–8 · C 3–5 · D 1–2 · else NULL — thresholds live in the DDL's `CASE`).
  Also `is_pinned` (curated "start here"), `specialty_id`, `slug`, `notes`.
- **`topic_content`** — maps a topic to its content per resource. `resource_type`
  ∈ `quiz | simulado | flashcards | medvoice | revalida_up`; `page_id`;
  optional `question_filter` jsonb.

**Current data:** 202 topics (after 0b dedup). `topic_content`: quiz 202 (self-map),
flashcards 170, revalida_up 166, medvoice 148 (simulado not mapped — see below).

### Mapping grain (how topics → content works)
- **quiz** — each topic *is* a quiz page (self-map via `source_page_id`).
- **flashcards** — 1 deck per specialty, matched by `group_label` → deck page.
- **medvoice** — 1 page per specialty, matched by lesson title → deck page.
- **revalida_up** — 1 page per topic, matched by title.
- **simulado** — NOT topic-anchored (whole mock exams); scheduled as a standalone
  "Simulado do dia" item, not a per-topic link.

Mapping was done by normalized name-match within specialty (accents/plurals
handled). All fuzzy matches were verified correct. See
`parsed/map-topic-content-report.md` for unmatched topics (genuine content gaps
+ recoverable abbreviation misses — see 0d below).

---

## The engine (`app/src/lib/study-plan/derive.ts`)

Ranking = **incidence primary, weakness tilts** (Justin's choice):
`score = incidence_count + weakness×3 + focus(2) + pin(1)`. The tilt is capped so
incidence dominates — weakness only reorders comparable-incidence topics, never
leapfrogs a much-higher-yield one.

Per surfaced topic it emits: **quiz** (primary), **flashcards** (deduped per deck),
**MedVoice audio** (foundation only) — each gated by `preferred_content_types`.
A standalone **Simulado** item appears in intensification/taper. Generic narrative
"lesson" items were **dropped** (Karina: narrative stays out of the schedule).

**Outros guard:** topics in the `outros` specialty (Urologia/Oftalmo/Otorrino)
are **excluded from ranking** until 0c splits them — they'd otherwise masquerade
as top-yield (Urologia=30). The guard keys on `specialties.slug = 'outros'`.

`fetch.ts` and `lib/magnet/plan-preview.ts` (the free-funnel lead preview) are the
only two `derivePlan` callers; both load `topics` + `topic_content`.

---

## Resource picker (`calibrate-wizard.tsx`)

Wizard is now **4 steps**; step 4 lets the student pick **Questões Revalida /
Simulados / Flashcards / MedVoice** → saved to `preferred_content_types` via
`completeCalibration`. `memorecards` is always kept (a 60D auto-feature, not a
picker toggle). `simulado` was added to the `ContentType` union.

**Simulados already enroll into SM-2** (they're `quiz_questions` → `QuizPlayer` →
`/api/quiz-attempt` → `gradeReviewItem`), so no extra review wiring was needed.

---

## Roadmap view (`/app/plano/roteiro`)

Read-only whole-course arc: topics grouped **A→D**, incidence-sorted, with a
per-topic status pill (**Não iniciado / Em andamento / Dominado**), a status
filter, collapsible tiers, and an overall progress bar. Shows 199 non-Outros
topics (A20/B24/C84/D71). Status is a **v1 proxy** — derived from `quiz_attempts`
(answered ≥ all questions AND ≥70% accuracy = "dominado"), **not** SM-2 interval.
A future upgrade could use `review_schedule.interval_days ≥ 21`.

Onboarding: new `roteiro` coach key (`<Coachmark>` + `/app/comecar` guide entry)
+ a discovery link on `/app/plano`.

---

## Tested vs NOT tested — READ BEFORE DEPLOY

**Tested:** `tsc --noEmit` clean · `eslint` clean · data-level checks against prod
(ranking order, tier grouping, hrefs resolve).

**NOT tested — must do before pushing/deploying:**
1. **Production build** (`next build`) — skipped because dev servers were running
   on :3000/:3001 (a build clobbers `.next/`). Run it on a clean tree.
2. **In-app / mobile-check** — the plan/wizard/roadmap are auth-gated; couldn't be
   driven headless. Specifically check:
   - `/app/plano` — items lead with high-yield topics; flashcard + simulado items render.
   - `/app/plano/roteiro` — tiers, status pills, filter, collapse; mobile widths.
   - Calibration wizard **step 4** at 375/414px.

**Deploy-time behavior notes:**
- Existing users already have `flashcards` in prefs → **flashcard items start
  appearing** on deploy (intended).
- **Simulado items** only appear after a user re-runs the wizard (picks Simulados)
  or for new users — existing prefs don't contain `simulado`.

---

## Remaining work

- **Phase 4 — error-classification tags (NOT built).** Tag each wrong answer
  (conteúdo / distração / interpretação / conduta / memorização) + an error
  profile. Locked in for v1 but not yet implemented.
- **0c — split the Outros bucket (self-handleable, no Karina needed).** Create
  sub-topics from the prompt's verified counts (Urology: Prostate 6, Urogenital
  trauma 6, Bladder 4, Testicular 4, Penile 2, Phimosis 2, Stones 2; Ophthalmology:
  Ocular trauma 6, Chemical burn 3, Eyelid 3; ENT: Otitis 3, Cervicofacial 2),
  point them at the existing coarse quiz pages until questions are physically
  split, then remove the Outros guard in `derive.ts`. Currently SAFE (guarded).
- **0d — abbreviation aliases.** Recoverable unmatched content under different
  names: `TCE`↔Traumatismo Cranioencefálico, `HIV`↔HIV/AIDS, `DPOC`,
  `Patologias da Coluna Vertebral` (revalida_up), `Câncer de Colorretal`
  (revalida_up). Add a small alias map and re-run the mapper.
- **Revalida Up — deferred decision (Q2).** The `revalida-up` pages have 0 quiz
  rows, so we don't yet know if the content carries an active-recall signal.
  Decide enrollment AND whether to schedule it as a resource once its content
  type is known. Until then: NOT scheduled, NOT enrolled.
- **Duplicate pages.** 0b merged the topic rows but the underlying duplicate
  *pages* (`90243` bradiarritmias-copy, `685` valvulopatias) still exist in
  `pages` — separate content-hygiene cleanup.

---

## Locked decisions

- Adaptive engine + roadmap view — **NOT** a frozen day-by-day calendar.
- Full topic entity + per-resource content map.
- Error-classification in v1 (Phase 4).
- Ranking: incidence primary, weakness tilts.
- Q1 Simulados **enroll** into SM-2 (already do). Q2 Revalida Up **deferred**.
  Q3 roadmap gets onboarding.

---

## Key files

| File | Role |
|---|---|
| `schema-patch-topics.sql` | DDL for `topics` + `topic_content` (committed) |
| `app/src/lib/study-plan/derive.ts` | ranking engine (incidence + tilt) |
| `app/src/lib/study-plan/fetch.ts` | loads topics/topic_content for the plan |
| `app/src/lib/study-plan/roadmap.ts` | roadmap fetch (`getRoadmapForUser`) |
| `app/src/app/app/plano/roteiro/{page,roteiro-client}.tsx` | roadmap view |
| `app/src/app/app/plano/calibrate-wizard.tsx` | wizard + step-4 resource picker |
| `app/src/actions/study-plan.ts` | `completeCalibration` persists picks |
| `app/src/lib/onboarding/tips.ts` | `roteiro` coach key + guide entry |

---

## Operational

**Apply a migration:** `node scripts/run-sql.js <path/to.sql>`

**Refresh incidence** (after importing a new exam year): re-run
`node scratch/seed-topics.js` → `node scripts/run-sql.js parsed/seed-topics.sql`.
Upsert-on-slug, so it refreshes counts and preserves `is_pinned` / `notes`.
`priority_tier` recomputes automatically (generated column).

**Refresh the content map:** `node scratch/map-topic-content.js` →
`node scripts/run-sql.js parsed/map-topic-content.sql` (full-replace of the
medvoice/flashcards/revalida_up rows; leaves quiz + simulado intact).

**Ad-hoc read query:** `node scratch/q.js "SELECT …"`

> ⚠️ `scratch/` and `parsed/` are **gitignored** — the generator scripts and the
> seed/mapping SQL are NOT in git (regenerable; data lives in prod). Only the
> schema DDL (`schema-patch-topics.sql`) and app code are committed. If you need
> to reproduce the seed and the scripts are gone, regenerate from the DB with the
> logic above, or read the applied rows from prod.

## Invariants / gotchas

- **Outros guard** depends on `specialties.slug = 'outros'` (id 18). Removing it
  before 0c would surface the coarse 30/14/5-question buckets as top-yield.
- **Don't double-wire Simulado enrollment** — it already flows through
  `/api/quiz-attempt`.
- **AudioCards are never scheduled/enrolled** (passive; same content as flashcards).
- **Tier thresholds** are baked into the `topics.priority_tier` generated column —
  change them with an `ALTER` if the rubric changes.
- **`db.begin` nesting:** `run-sql.js` wraps files in a transaction, so the
  `BEGIN/COMMIT` inside patch files emits benign "already a transaction" notices.
