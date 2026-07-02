# Incidence-Weighted Study Plan — Handoff

**Status (2026-07-02):** Phase 0 applied to prod (data). Phases 1–3 built and
committed **locally on `main`, NOT pushed / NOT deployed**. **Now verified in a
running app** (production build + in-app/mobile drive) — see "Verified in-app"
below. Ready for the owner to push + deploy.

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

## Verified in-app (2026-07-02) — was "NOT tested"

Everything below now DONE. Method: synced prod `topics`/`topic_content` (exact ids)
into the local Supabase test DB, logged in as `dev@local.test` (active member),
forced intensification (`study_plans.intensification_start_days = 90` so 75 days-to-exam
lands in the intensification phase — otherwise simulado/memorecards stay gated),
drove Chrome DevTools at emulated 375 & 414.

1. **Production build** (`next build`) — **PASS**, exit 0, no type/lint errors;
   `/app/plano` and `/app/plano/roteiro` both present as dynamic routes.
2. **`/app/plano`** — **PASS**. Leads with high-yield: Atenção Básica (30) →
   Patologias da Coluna Vertebral (15) → Assistência Pré-Natal (15) → Tuberculose (14),
   pure incidence order. Quiz + flashcard (deduped per deck) + **simulado** ("Simulado
   do dia") + memorecards + SM-2 review items all render. Item cards 77px tall, no
   horizontal overflow, no console errors. Quiz deep-link resolves to the real
   30-question past-exam quiz.
3. **`/app/plano/roteiro`** — **PASS**. 4 tiers A/B/C/D = 20/24/84/71 = 199.
   Status = distinct lucide icons (Circle/CircleDashed/CheckCircle2 · muted/amber/green),
   NOT text pills. Filter works ("Em andamento" → the 1 started topic). Collapse works
   (chevron flips, tier's topics hide, siblings stay open). No overflow, no console errors.
4. **Calibration wizard step 4** — **PASS** at 375 & 414. Resource picker (Questões
   Revalida / Simulados / Flashcards / MedVoice), toggles work (4↔3 checks), sticky
   footer, no overflow, no console errors. Did NOT submit (would write prod prefs).

**Minor, non-blocking observations (not fixed):**
- Roteiro tier headers show `mastered/total` (e.g. 0/20) while the top bar shows
  `started` (1/199) — mastered vs started is a slight metric mix; intentional-looking.
- Roteiro status icon is `aria-hidden` with no text/aria status label → a screen
  reader can't announce a topic's status. Small a11y polish for later.
- Under heavy dev-machine memory pressure (firstslate's ~20 postcss workers + 2 Next
  servers) the 199-row roteiro tab OOM-crashed during rapid scripted clicks. A single
  real interaction is fine; no virtualization needed for 199 rows on a real device.

**Deploy-time behavior notes:**
- Existing users already have `flashcards` in prefs → **flashcard items start
  appearing** on deploy (intended).
- **Simulado items** only appear after a user re-runs the wizard (picks Simulados)
  or for new users — existing prefs don't contain `simulado`.

---

## Remaining work

- **Phase 4 — error-classification tags — DONE (2026-07-02).** After a WRONG quiz
  answer the player shows an optional "Por que você errou?" chip row (Conteúdo /
  Interpretação / Distração / Conduta / Memorização); the pick persists to a new
  nullable `quiz_attempts.error_category` (ASCII slugs, CHECK-constrained;
  `schema-patch-quiz-error-category.sql`, applied prod+local). `/api/quiz-attempt`
  now returns the `attemptId`; `setQuizErrorTag` (actions/quiz-attempts.ts) writes
  the tag ownership-guarded. Profile: an "Análise de erros" section on
  `/app/relatorio` (top-error insight + per-category bars). **Ranking tilt (Justin
  chose "also tilt the plan"):** derive.ts adds a bounded `gapWeight × ERROR_TILT(2)`
  term — only knowledge-gap errors (conteúdo/conduta/memorização) boost a specialty;
  interpretação/distração are test-taking issues and inform the insight text only.
  Shared vocab in `lib/quiz-errors.ts`. Verified in-app (tag persists; relatório
  renders; a specialty with more gap-errors ranked its equal-incidence topic above a
  peer while the 30-incidence topic stayed #1) + `next build` PASS. Code UNCOMMITTED
  (rides the study-plan push).
- **0c — split the Outros bucket — DONE (2026-07-02, applied to prod + local).**
  `parsed/split-outros-0c.sql` deleted the 3 coarse topics (Urologia 30 / Oftalmologia
  14 / Otorrino 5) and inserted **12 per-condition sub-topics** at their verified prompt
  incidence (Urology: Próstata 6 · Trauma urogenital 6 · Bexiga 4 · Testículo 4 · Pênis 2
  · Fimose 2 · Cálculos urinários 2; Oftalmo: Trauma ocular 6 · Queimadura química ocular 3
  · Pálpebra 3; Otorrino: Otite 3 · Infecções cervicofaciais 2). Each self-maps to its
  discipline's EXISTING coarse quiz page (`/app/outros/{urologia|oftalmologia|otorrinolaringologia}`)
  until questions are physically split; the top sub-topic per discipline keeps the
  flashcard deck + revalida_up mapping. **The Outros guard was removed from BOTH
  `derive.ts` and `roadmap.ts`.** Topics now 211 (tiers A20/B27/C89/D75). Verified in-app:
  sub-topics rank correctly, coarse buckets gone, deep-links resolve. `seed-topics.js` now
  excludes pages 90240/90241/90242 so a re-seed can't recreate the buckets (pipeline order:
  seed → 0b → **0c** → map). Reversible per the rollback note in the SQL.
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

- **Outros guard REMOVED (0c done).** The coarse 30/14/5-question buckets were split
  into per-condition sub-topics, so both `derive.ts` and `roadmap.ts` now rank Outros
  normally. If you ever re-seed, run `split-outros-0c.sql` after seed/0b (and keep the
  `seed-topics.js` page-exclusion) — otherwise the coarse mega-buckets return.
- **Don't double-wire Simulado enrollment** — it already flows through
  `/api/quiz-attempt`.
- **AudioCards are never scheduled/enrolled** (passive; same content as flashcards).
- **Tier thresholds** are baked into the `topics.priority_tier` generated column —
  change them with an `ALTER` if the rubric changes.
- **`db.begin` nesting:** `run-sql.js` wraps files in a transaction, so the
  `BEGIN/COMMIT` inside patch files emits benign "already a transaction" notices.
