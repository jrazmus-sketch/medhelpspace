# MedHelpSpace Migration — Project Context

## Development rules

- **Mobile-first layout**: Every layout change must be optimized for mobile in the same session. Think through the mobile experience deeply before finishing — don't leave responsive fixes for later.

## Skills to reach for

Four slash commands are wired up and auto-detect this project's conventions. Prefer them over hand-rolling each task.

- **`/schema-patch`** — when adding a column/table, RLS change, or any DB migration. Picks the next `schema-patch-<slug>.sql` filename, scaffolds with idempotent guards + RLS + rollback notes, runs via `node scripts/run-sql.js`, updates the Status tracker below.
- **`/new-query`** — when adding a typed data fetcher. Scaffolds `app/src/lib/queries/<table>.ts` (three-part pattern: keys + mock-aware fetch + optional hook). Defaults to **server-only** to honor the "browser client hangs" invariant in *Data fetching pattern* below.
- **`/mobile-check`** — invoke after any layout/UI edit to enforce the mobile-first rule above. Drives Chrome DevTools through 375/414/768 widths, screenshots each, checks overflow + tap targets + tiny text + console errors.
- **`/pre-launch-audit`** — when finishing a sprint or about to ship. Triaged P0/P1/P2 sweep for stray dev artifacts, auth gaps, env hygiene, error handling. Reports only; doesn't auto-fix.

## What this project is

Migrating medhelpspace.com.br — a Brazilian Portuguese medical exam prep
membership site for the Revalida licensing exam — from WordPress to a new stack.

Current stack: WordPress + Divi + WooCommerce + PagBank + PMPro + H5P +
ZoomSounds on IONOS shared hosting (US-based, serving Brazilian audience).
Target stack: **Next.js 16 App Router + Supabase** (confirmed). App lives in `app/` subfolder.

Working directory: `C:\Users\jrazm\claudebuilds\medhelpspace\`
Source data: UpdraftPlus database backup (`*.gz` file in this folder).
Content language: Brazilian Portuguese. Preserve all original text exactly.

## Project files

| File | Purpose |
|---|---|
| `db.sql` | UpdraftPlus dump, 136 MB, decompressed from the `.gz` backup |
| `page-inventory.csv` | Output of `build_inventory.py` — one row per page with type classification |
| `build_inventory.py` | Streams `db.sql`, classifies every page, writes the CSV |

## Page type taxonomy (verified via inventory)

| Type | Count | Description |
|------|-------|-------------|
| `plain-content` | 473 | Heading + `[et_pb_text]` modules, narrative content |
| `text-lesson` | 220 | Toggle-based lessons with prose body (203 `-simulados` + 17 MedVoice) |
| `h5p-quiz` | 204 | H5P embeds via `[h5p id=N]` shortcode OR `<iframe data-content-id=N>` |
| `blurb-nav-hub` | 63 | Topic hub pages using `et_pb_blurb` card grids with `post_link_url_page` |
| `skip` | 14 | WooCommerce, PMPro, mhs-dashboard, shop listing — NOT migrated |
| `audio-lesson` | 1 | cardiologia-medvoice (id 3606), has `[zoomsounds_player]` shortcode |
| `navigation-toggle` | 1 | Toggle bodies containing only `<a>` links |
| `unclassified` | 1 | Home page — OUT OF SCOPE (rebuild natively) |

## Site information architecture

- 12 medical specialties (Cardiologia, Pneumologia, Reumatologia, etc.)
- Each specialty has these per-specialty view types: main hub, `-resumos`, `-simulados`,
  `-formula`, and **Revalida Up** (`view='revalida-up'`, added 2026-06).
- Per-topic H5P quiz pages for each specialty
- MedVoice, Audiocards, and Flashcards are cross-cutting content tracks (each covers most specialties)
- MedHelp 60D is a date-gated content module. **As of 2026-06-20** it gates
  **Fórmula MedHelp** (`view='formula'`), MemoreCards, and Simulados 100Q.
  (Revalida Up was originally in 60D but was moved to day-1 main nav — see the swap
  note under *Decisions locked in*.)

## Decisions locked in

- **Orphaned H5P refs** (relacoes-uterofetais, rotura-prematura-de-membranas,
  tohchs — H5P IDs 176, 177, 163 don't exist in `wp_h5p_contents`):
  migrate as **drafts**, flagged in notes for content team review.
- **Incomplete blurb-nav-hubs** (14 OB-GYN + Pediatrics hubs with empty
  `link_option_url`): migrate as **drafts**, flagged for content team.
- **Home page**: out of scope. Rebuild natively in new stack.
- **WooCommerce/PMPro/dashboard (14 pages)**: skip entirely; rebuild natively.
- **Audio storage**: keep Bunny CDN (`medhelpspace.b-cdn.net`). Don't move files.
- **Membership model**: cohort-based (not PMPro level-based). Two cohorts seeded:
  `revalida-2026-2` and `revalida-2027-1`. Both grant identical base content access;
  they differ only in time windows and when the MedHelp 60D module unlocks.
- **MedHelp 60D module** (original migration): 37 pages (WP id 3018 + all `parent_id`
  descendants) were gated behind this module. Unlock date = `cohorts.test_date - 60 days`,
  maintained automatically by trigger. Identify descendants by recursive walk from id 3018
  (`slug = medhelp-60d`); tag every page in the subtree with `content_module_id = 1`.
- **Revalida Up ⇄ Fórmula MedHelp swap (2026-06-20)**: gating is driven entirely by
  `pages.content_module_id` (checked in the `[slug]` route via `requireActiveMembership`),
  NOT by the WP subtree. The swap flipped it: **Revalida Up → `content_module_id = NULL`
  (day-1, ungated)**, surfaced in the dashboard grid, the Estudar dropdown, and per-specialty
  cards, at `/app/revalida-up`; **Fórmula MedHelp → `content_module_id = 1` (gated in 60D)**,
  reached from the 60D accordion at `/app/formula-medhelp`. So the set of pages with
  `content_module_id = 1` is now Fórmula + the legacy MemoreCards/Simulados subtree, NOT
  Revalida Up. Patch: `schema-patch-swap-revalida-formula-gating.sql` (reversible).
- **Revalida Up: 5 GI topics re-filed Gastro → Cirurgia Geral (2026-09-13, prod + local)**:
  Câncer Colorretal, Câncer de Esôfago, Hemorragia Digestiva, Pancreatite, Tumor de Pâncreas
  (ids 90061, 90063, 90126, 90164, 90212). Karina's first ask in "Revalida Up Update"; same
  pattern as the two earlier move patches. Patch: `schema-patch-move-gastro-cirurgia-revalida-up.sql`.
  **Her v2 rewrite is LIVE on prod + local (2026-09-13 evening): 195 topics, 862 insights**
  (190 docx + 5 follow-up .md she sent for the topics missing from the first batch), imported
  by `scripts/import-revalida-up-v2.js` — UPDATE in place keyed by slug (165 `topic_content`
  study-plan links CASCADE on delete, so never delete+reinsert), 5 slug renames on the existing
  rows (incl. SUS back to the no-"e" spelling), explicit RETIRE list (now empty), titles
  normalised to "… Revalida Up", specialty from the FOLDER with `SPECIALTY_OVERRIDES` for what
  she stated in writing. Rollback snapshots: `parsed/revalida-up-rollback-2026-09-13-{prod,local}.sql`
  (gitignored). Karina confirmed in writing (2026-09-13): Oftalmo/Otorrino/Urologia stay in
  Outros and Chagas in Infectologia — the file headers were wrong; the FOLDER is authoritative.
- **Cohort 2026.2 retired from sale (2026-07-11)**: `cohorts.is_for_sale = false` for
  `revalida-2026-2` — the row stays `active = true`, so existing members keep full access
  (membership gating checks only the membership window, never sale flags). Sales focus is
  `revalida-2027-1` (+ `revalida-20272`): all funnel pickers/defaults/fallbacks now lead
  with 2027-1, `leads.target_cohort` default flipped, coupons REVALIDA5/VOLTA5 deactivated,
  and the 15 active 2026-2 leads were reassigned to 2027-1 (the 1 converted buyer kept
  2026-2). `leads_target_cohort_check` still allows the old slug for historical rows.
  Soft delete (`active = false`) is reserved for after the 13/09/2026 exam.
  Patch: `schema-patch-retire-cohort-2026-2.sql`. Reassigned leads keep their original
  pick in `leads.previous_target_cohort` (backfilled; `bulkAssignCohort` records it on
  first change), and /admin/leads renders "2026.2 → 2027.1" so history is never
  misreported. Patch: `schema-patch-leads-previous-cohort.sql`.
- **Condição especial de lançamento (Karina, live 2026-09-22 → 11/10/2026, extended from 05/10 before
  ads started — `schema-patch-promo-extend-2026-10-11.sql`)**: buying Turma
  2027.1 in the window (normal R$ 2.997, normal checkout) also moves the buyer onto 2027.2
  when 2027.1 closes. Stored as `cohort_promotions`; frozen on `orders.promotion_id` at charge
  time; copied onto the membership (`rollover_to_cohort_id`) in finalize's grant upsert.
  The membership row is MOVED (never a second concurrent membership — the app assumes one)
  by `apply_promotion_rollovers()`: daily cron `/api/cron/promotion-rollovers` (23:00 UTC) +
  a per-user fallback in `requireActiveMembership`. No coupons on the promo turma while open
  (enforced inside `preview_coupon`/`redeem_coupon`), and drip emails/reward pages that SHOW a
  coupon pause for it (`lib/cohort-promotions*`). **Never add a second FK from
  `user_cohort_memberships` to `cohorts`** — every `cohort:cohorts(*)` embed goes PGRST201.
  End early: `UPDATE cohort_promotions SET active = false`. Patch: `schema-patch-cohort-promotions.sql`.
  Public promo copy (Karina's v2): NO struck-through price, and NEVER an exam month ("prova de
  maio/setembro") — INEP hasn't announced 2027; `cohorts.test_date` is an internal reference.
- **Karina's September content — LIVE on prod + local (2026-09-22)**. Questões Revalida
  (2020 → 2026.1): 200 topics / 975 q via `scripts/apply-questoes-v2.js` — her rule: **never
  delete a live question** (what came replaces IN PLACE by "Questão N · Revalida YYYY", new is
  added, what did not come stays). Figures via `scripts/import-questoes-images-v2.js`, which only
  fills an EMPTY `media_url` and keeps a reviewed `TABLE_PICTURES` list: a picture of a lab table
  she also TYPED (`.quiz-table`) is never shown next to it — extend that list, by eye, whenever a
  delivery adds typed tables. Mini simulados: 125 / 3,125 q via `scripts/apply-mini-simulados.js`
  (full rewrite in place by slug+position, batched, advisory-lock guard); the 5 Emergência mini
  simulados were DELETED at her request and their hub unpublished (it parents 4 legacy drafts).
  Rollbacks: `scripts/rollback-questoes-v2.sql`, `scripts/rollback-mini-simulados.sql` (both
  restore from `*_bk_questoes_20260920` / `*_bk_minisim_20260922`). Still open: the annulled
  questions she fixed on Drive (fresh download → re-parse → re-run, both re-run safe).
- **Resumos Narrativos v2 — LIVE on prod + local (2026-10-05, `0acdb6d`)**. Karina's "Atualização
  resumos narrativos" (217 `.md.docx`, "excluir e substituir todos") via `scripts/import-resumos-v2.js`
  (generator → `parsed/resumos-v2-import.sql`). UPDATE in place, never delete: renamed files map onto
  the LIVE slug (`MATCH`) because Questões remediation (`lib/review/remediation.ts`) finds a resumo
  by `<question-slug>-resumos`; only 3 `RENAMES` where the NEW slug is the one it wants. 16 new
  topics, first **Outros** hub (`outros-resumos`, cards clustered oftalmo → otorrino → urologia),
  8 retired to draft (explicit `RETIRE`), every Resumos hub's cards rebuilt from the delivery.
  **Outros has AREA hubs (Karina 2026-10-06, "igual ao Revalida Up", `ca53274`)**: Resumos → Outros →
  `oftalmologia-` / `otorrinolaringologia-` / `urologia-resumos` → resumos. An area hub is a
  blurb-nav-hub of the same view + specialty whose `parent_id` is the specialty's hub;
  `lib/hub-nesting.ts topLevelHubs()` keeps it out of every hub list (accordion, specialty page,
  `findSpecialtyHub`) and `findAreaHub()` adds the area crumb. `AREAS` in the importer drives it.
  **2026-10-06 (`2fc8064`)**: Meningites only in Infectologia (Karina) — `SKIP_FILES` + RETIRE.
  Bradi/Taquiarritmias carry 8 ECG figures each: `FILE_REPLACEMENTS` reads her newer .docx, pictures
  go through `scripts/prepare-resumo-images.py --upload` (1400 px lossless WebP on Bunny,
  `images/resumos/v1/…`, manifest `parsed/resumos-images.json`) and render as `figure.resumo-figure`
  (phone: readable 680 px strip that scrolls inside its frame + tap to open; sm+: fills the column).
  216 resumos live.
  Specialty = FOLDER (moved: piloro + invaginação → Pediatria, febre reumática → Pediatria,
  neuroblastoma → Pediatria). Meningites came twice (Infecto + Neuro, different texts) → second
  page `meningites-neurologia-resumos`. Scene titles are `<h3>` (TOC on xl), Word Heading 4 /
  sub-headings → `<h4>`, Word lists → `<ol>/<ul>`. **CSS gotcha fixed:** `p:has(> br:only-child)`
  hid every paragraph with exactly ONE `<br>` (1,922 in this delivery) — never reintroduce it.
  Rollback: `node scripts/snapshot-resumos.js <db>` BEFORE apply → `parsed/resumos-rollback-2026-10-05-{local,prod}.sql`
  (gitignored; rollback tested exact on local).
- **NFS-e = national Emissor, MANUAL, one fiscal screen for all products (Karina 2026-10-27).**
  `/admin/notas-fiscais` lists Revalida `orders` (paid + refunded) AND `clinact_invoices` (one row
  per PAID PagBank invoice — first charge and every renewal), filters Produto × Situação. It only
  RECORDS what she did on https://www.nfse.gov.br/EmissorNacional (número + data de emissão,
  cancelada, ClinAct reembolsada) — never stores a certificate/credential, never issues anything.
  **Cancelada (the nota) ≠ Reembolsada (the money)**; no ISS rate on screen (paid inside the
  Simples/DAS); service code 080201; the installment surcharge is NEVER part of the service value.
  Checkout has PF (default) / PJ: a PJ order keeps the student (`billing_first/last_name`, `cpf`)
  separate from the tomador (`billing_company_name`, `billing_cnpj`); PagBank customer = the company.
  `clinact_invoices` is written best-effort by `lib/clinact/invoices.ts` from checkout + the renewal
  reconcile (cron/webhook), keyed by INVO_ id, DO NOTHING on conflict — never the access authority.
  Patch: `schema-patch-nfse-national-v2.sql`; backfill: `scripts/clinact-backfill-invoices.ts`.
  **v3 (Karina's third reply):** (a) **the ClinAct tomador is NEVER the cardholder** — the checkout's
  "Dados para a nota fiscal" block picks o próprio aluno / outra PF / PJ with the full address
  (`tomador_*` on `clinact_subscriptions`, copied onto each invoice; `billing_*` = cardholder =
  payment only); shared validator `validateNfseTomador` in `lib/br.ts`. (b) **`internal_test`** on
  orders + clinact_invoices: every record before 28/10/2026 is an internal test (no real sale yet) —
  listed only under "Testes internos", never a sale or a pending nota (screen, bell, dashboard); later
  test purchases are marked by hand in the modal. Her WebISS sentences are verbatim locale keys
  (`webissTestNota` / `webissTestRefunded`); a WebISS nota is NEVER auto-cancelled. ClinAct
  description is her text verbatim. Patch: `schema-patch-nfse-national-v3.sql` (also marks the
  25/09 R$ 29,90 invoice refunded).
  **v4 (Karina 2026-10-28):** the Revalida checkout has the SAME block — ONE component
  `components/checkout/nota-fiscal-fields.tsx` renders it for both checkouts (never fork it). Revalida
  orders snapshot `tomador_*` (patch `schema-patch-nfse-revalida-tomador.sql`); `billing_first/last_name`
  + `billing_cpf` are ALWAYS the student (`billingFromTomador`), the student block appears only for
  outra PF / PJ. Card holder CPF is sent apart ("O titular do cartão tem o mesmo CPF…" checkbox) and is
  the PagBank holder `tax_id`; the PagBank customer is the tomador. Orders without `tomador_type` are
  legacy: the fiscal screen derives them from `billing_person_type` as before.
  **v5 (Karina 2026-10-28, approval round):** a paid order with `amount_cents = 0` (100% coupon) is a
  **"Matrícula gratuita — sem cobrança", never a sale**: own filter on the fiscal screen (no nota form;
  the issue route refuses it), out of the NFS-e backlog (bell/digest/dashboard), dashboard sales totals,
  billing "Pagos", Google Ads OCI purchases (order AND lead path) and GA4 `purchase`; never attributed to
  an ambassador. Derived from the amount, no column. Still markable "Teste interno"; "Estornar" on it
  only revokes access (refund route `couponOnly`).
- **Meta Pixel + Conversions API (Karina 2026-11-04/09) — LIVE (`META_PIXEL_LIVE = true` in
  `lib/meta/config.ts`).** One Pixel/dataset `1642376477393533` ("MedHelpSpace | Web") for both products.
  Pixel only on an ALLOWLIST (`META_PIXEL_PATHS`: /, /revalida, /loja, /checkout, /signup, /clinact,
  /clinact/gratis, /clinact/assinar — never /app, /admin, member areas, /clinact/caso) and only after an
  EXPLICIT "Aceitar" (`mhs_ads_consent`, separate from GA's opt-out cookie). PageView + InitiateCheckout in the
  browser (`disablePushState` + `allowDuplicatePageViews` + autoConfig off — fbevents drops every PageView
  after the first without it). Each browser event is ALSO re-sent by the server via `POST /api/meta/event`
  with the SAME event_id (`3cad04f`) — the Pixel's own request can carry no Test Events code, so in test mode
  only server events show in Events Manager (Karina's TEST35482 run saw no PageView before this). The route
  allowlists PageView/InitiateCheckout + META_PIXEL_PATHS, re-checks consent. **Audit fixes (Karina 2026-11-09):**
  (A) the browser Pixel fires ONLY on an address whose query is nothing but `fbclid` and has no #fragment
  (`browserUrlSafeForMeta`) — any other address (`/signup?next=…`, `?cohort/cupom/plano`, utm links) goes
  SERVER-ONLY; the browser hands the server origin+path only, and an fbclid is kept as `_fbc` client-side;
  (B) site-wide `Referrer-Policy: strict-origin` (next.config) — never read the Referer for a page URL, the
  checkout routes name their page in `captureMetaContext(request, userId, pageUrl)`; (C) Purchase custom_data
  is an allowlist (`PURCHASE_CUSTOM_FIELDS`): no order id, no payment method. **Purchase is server-only** (CAPI): Revalida from `finalizePaidOrder`'s race
  winner, ClinAct from `recordPaidInvoices` for occurrence 1 only (never renewals); context (fbp/fbc/IP/UA)
  frozen at checkout on `orders.meta_capi` / `clinact_subscriptions.meta_capi` ONLY with ads consent;
  `meta_capi_events` (event_id PK = `revalida_<order>` / `clinact_<SUBS_id>`) is the dedupe claim. Skips R$ 0,
  `internal_test`, admins / `mhs_internal` browsers. Test mode: `?meta_test=TESTxxxx` on any public URL makes
  that browser a Test Events browser (Pixel loads; CAPI events carry the code). Token
  `META_CAPI_ACCESS_TOKEN` (system user, no expiry) in Vercel prod + `app/.env.local`. Went live together
  with Karina's approved /privacidade text (item 3 Meta paragraph, item 6 GA + Meta Pixel) via
  `schema-patch-privacidade-meta.sql` (rollback file restores the 2026-11-02 text; turn the constant off in the
  same deploy). `?meta_test=` still works after go-live for Test Events checks. Patches:
  `schema-patch-meta-capi.sql`, `schema-patch-privacidade-meta.sql` (prod + local).
  **Withdrawal (Karina 2026-11-10, item 4):** footer "Preferências de cookies" (`CookiePreferencesLink`, shown only
  where Meta is active) reopens the SAME banner; "Recusar" after a "granted"
  runs `withdrawMetaConsent()`: fbq consent revoke, `_fbp`/`_fbc` deleted (host-only + .medhelpspace.com.br), and
  `POST /api/meta/revoke` nulls `meta_capi` on ALL the signed-in user's orders + `clinact_subscriptions` row — so a Pix
  paid later sends no Purchase (capi.ts reads the context at send time). Signed out → cookie `mhs_meta_revoke=1`,
  finished by MetaPixel at the next sign-in. `track()` re-reads consent at send time (fbq outlives a withdrawal).
  Meta domain verification tag is in the root layout `verification.other` — keep it (Meta re-checks).
- **Single source Flashcards × AudioCards — LIVE on prod + local (Karina authorized 2026-11-14).**
  `flashcard_groups` holds each group and its DIRECT AudioCard link (`audiocard_lesson_id`, never matched by
  title again); every AudioCard transcript (`lessons.body_html` on `<spec>-audiocards`) is GENERATED from its
  cards by trigger — a direct write to it is REFUSED (`audiocard_transcript_generated`): edit the Flashcards.
  Every card change is logged (`flashcard_item_changes`, type editorial/clinica/nao_esclarecida, author).
  **No audio is ever suspended automatically** — the admin panel only warns; Karina decides
  (`confirm_audiocard_changes`, `set_audiocard_suspension`). Reorganizations move a group with
  `move_flashcard_group()` (same ids, AudioCard follows). Patches: `schema-patch-single-source-cards.sql` +
  `schema-patch-single-source-change-log.sql` (each with `-rollback.sql`); pre-switch backup
  `*_bk_ss_20261114` + `lessons_audiocards_bk_single_source`.
- **MemoreCards v2 — LIVE (2026-09-22, `33d7024`), stays in MedHelp 60D.** Replaces the legacy
  `*-memorecards` pages (those URLs now redirect). Image cards in `memorecard_items`, keyed to the
  **Revalida Up topic page** (`view='revalida-up'`) — Revalida Up's topic list IS the structure; a
  theme without cards shows "Em breve" and is skipped by the sequence. `/app/memorecards` +
  `/app/memorecards/[specialty]`; the 60D check (`get60dAccess`) runs before any card is read.
  Content: `scripts/prepare-memorecards.py` → `scripts/import-memorecards.js --upload` then `--apply`
  (replaces only delivered themes; bump the Bunny path version on a re-delivery). Sequence rules in
  `lib/memorecards-shared.ts`. Patch: `schema-patch-memorecards-v2.sql`.
- **Meu Plano = a time-budgeted schedule with a forecast to the exam — LIVE prod + local (Karina 2026-11-17).**
  `lib/study-plan/`: `derive.ts` builds a queue of per-material activities → `schedule.ts` fills every study day
  by MINUTES (never above the student's time: Revisão first ≤ half the day, no limit in the last 14 days → the
  week's MINI simulado in the last 60 days → new content) → today's list + the forecast on `/app/plano`
  ("Previstos até a prova: X de Y", partial progress, hints; her wording is "não previstos até a prova", NEVER
  "ficam de fora" — a test refuses it). Nothing is stored: re-derived from real progress on every load.
  **Each material finishes on its own evidence** (Questões all answered ≥70%; Flashcards every card of the group
  seen; Revalida Up page concluded; MedVoice lesson concluded) and a topic leaves only when every selected one is
  done. **Below 70%:** the wrong questions already in the Revisão are never asked again by the plan
  (`review-outcomes.ts` — a Revisão answer writes NO `quiz_attempts` row, so review outcomes are merged in for
  mastery, in the plan AND the Roteiro). Times live in `study_plan_settings` (one row, edited at `/admin/plano`,
  audited `plan_settings_update`); student "Ritmo de estudo" = `study_plans.pace_mode` (auto learns from the gaps
  between answers, clamped 0.5×–2×). MedVoice uses `lessons.audio_duration_seconds`
  (`scripts/measure-audio-durations.js` → re-run after new audios). **The MedHelp 60D materials (Fórmula,
  MemoreCards, Simulados 100Q) are NOT scheduled by Meu Plano** — she wants an own 60D schedule later (after her
  reorganization + a consolidated survey); the plan's "simulado" is the regular 25-question mini simulado, at most
  25% of the week's study time. Attempts are read paginated (`user-rows.ts`). Validation:
  `node --import ./app/tests/helpers/alias-hook.mjs scripts/plano-cenarios.ts [<DATABASE_URL>]` (read-only).
  Patches: `schema-patch-plano-cobertura.sql` (+ rollback), `schema-patch-medvoice-audio-durations.sql`.
- **Mini simulados no Meu Plano — o plano reserva o tempo, o aluno escolhe o simulado (Karina 2026-11-17, second round).**
  `lib/study-plan/simulado.ts` (pure). **Frequency** = `study_plans.simulados_per_week` (NULL = Automática, the 25%
  reference of `/admin/plano`; 1 | 2 = the student's choice, no 25% limit), picked in Meu Plano › Disponibilidade
  (`simulado-frequency-editor.tsx`): the impact (weekly time + forecast "de N para M") is shown BEFORE Confirmar, and a
  frequency whose sessions alone exceed the week's study time is **never viable** — refused in the editor AND in
  `setSimuladoFrequency`; a saved one that stops fitting falls back to Automática with a notice (`simulado.inForce`).
  **Split + resume:** a session that does not fit a day takes the whole QUESTIONS that fit and continues on the next
  study days; the block always shows the TOTAL "Tempo estimado" plus "Hoje: cerca de N min". A mini simulado in
  progress (answered in the last 7 days) becomes **"Continuar mini simulado"**, straight to its page; while one is open
  no new one is asked for, and one begun in an EARLIER week stands in for the new week's first session (never lost,
  never programmed twice). **Runs:** `quiz_runs(user_id, page_id, started_at)` — the current run is every answer since
  `started_at` (no row = whole history). The player (`QuizPlayer` `run` prop, mini simulados only — never a 60D
  Simulado 100Q or a `?tema=` view) reopens on the first unanswered question; "Recomeçar" / retaking a finished one
  sends `newRun` on the next answer and `/api/quiz-attempt` moves `started_at` to that answer's own DB timestamp —
  **`quiz_attempts` rows are never deleted**. Times are ESTIMATES (answers × pace; sessions are not timed) and the
  screens say so. View `study_plan_simulado_pages` (question ids per
  page). Scenarios 7–13 in `scripts/plano-cenarios.ts`.
  **Third round (Karina 2026-11-17, 23h06):** (1) the regular mini simulados are scheduled through the WHOLE preparation — the
  last-60-days window belongs to the MedHelp 60D, never tie them to the phase again; (2) a mini simulado left for more than 7 days
  is still the pending one (`inProgress.stale`): the block keeps "Continuar" and adds "Escolher outro mini simulado" under the card
  (`PlanItem.secondary`), that day opens no second session, and once ANY other mini simulado was answered after it the old one is
  no longer offered (the choice was made; `quiz_attempts` untouched); (3) a NEW session is opened only when it can be finished in
  the study time left before the exam (`simRoomAfter` in schedule.ts) — a session already begun is always continued. Patch: `schema-patch-mini-simulado-frequencia.sql` (+ rollback).
  **MedVoice (her note, same day):** the current set is outdated — she will send a full replacement and ALL old
  MedVoice get removed together with it; do not recover the 4 missing recordings (481, 579, 582, 583).
- **Meu Plano — tempo de estudo POR DIA + page presentation (Karina 2026-11-18, 12h00).** The student types hours and
  minutes per study day (`study_plans.daily_minutes`, 10–960, NULL = 60) and picks the days; the weekly total is derived
  and only shown ("Sua disponibilidade: 5 h por dia de estudo · 3 dias por semana · 15 h semanais"). `weekly_hours`,
  `intensity`, `temp_intensity*` are no longer read for the plan (kept in the table for rollback); "Intensidade base" is
  gone; "Reduzir o tempo de estudo por um período" = `temp_daily_minutes` + `temp_daily_until` (must be below the
  regular time). Saved plans were converted keeping their load (weekly × 60 ÷ study days, else leve 30 / padrão 60 /
  intenso 120 — never weekly hours turned into daily hours). One wording source: `lib/study-plan/availability.ts`
  (pure, client-safe); `DerivedPlan.routine` + `examDate` are what the page summary shows ("Sua rotina / Prova
  considerada / Editar meu plano" — the routine ACTUALLY used; an unconfirmed date is shown as "data estimada, ainda não
  confirmada"). The phase subtitle is not shown to the student (rules unchanged). Forecast = three separate lines
  (conclusão integral · avanço parcial · tempo que cabe); "Restante para hoje" vs "Tempo realizado hoje (estimativa)";
  cards say "N de M questões respondidas · K programadas para hoje"; "Áreas que você deseja priorizar" / "Áreas excluídas
  do planejamento" (her sentences, tested verbatim); "Onde focar": under 10 answers = "dados iniciais", none = "Ainda sem
  respostas para avaliar". Quick tip `onboarding.plano.body` = her text (DB row + `tips.ts`). Scenarios 14–16 in
  `scripts/plano-cenarios.ts`; tests `app/tests/plano-tempo-diario.test.ts`. Patch: `schema-patch-plano-tempo-diario.sql`
  (+ rollback).
- **MedHelp 60D — cronograma na página, checklist manual, uma só disponibilidade com o Meu Plano (Karina 2026-11-17 23h06;
  built 2026-11-18).** `lib/medhelp60/cronograma.ts` (PURE: `buildCronograma`, `d60Position`, `matchFormulaPages`) builds a
  FIXED sequence from the turma's exam date: 8 weeks of 7 days from the unlock day (exam − 60); the 4 days after week 8 hold no new item.
  Units = topics with a Fórmula MedHelp page and/or MemoreCards, in ranking order (frequency desc, then name; Fórmula pages
  that match no topic last), dealt evenly over the 8 weeks; Simulados 100Q 1–7 in weeks 1–7 (Simulado N in week N), each followed by its correction; **week 8 programmes NO new simulado
  (Karina 2026-11-19)** and keeps its topics — NO reserve of time is computed for it (she refused a fixed 5 h 50 min). The page
  says "organizada em oito semanas" (her sentence, tested verbatim) and never names a separate "reta final": the whole 60D IS
  the reta final, and there is no block after week 8. Checklist keys carry the simulado's NUMBER, not its week, so moving a simulado between weeks keeps the ticks.
  **Nothing is stored except the ticks** (`medhelp60_checks`, keys `formula:<page id>` / `memore:<Revalida Up page id>` /
  `sim:<n>` / `sim-correcao:<n>`, RLS own rows) — the schedule is rebuilt on every load, so a material delivered later appears
  in its place with the same key. A material not delivered = item shown as "Material pendente", not tickable, 0 minutes
  (today: Simulados 1, 2, 4–7 — only `simulado-100q-3` has questions). Fórmula pages have NO stored topic link: matched by
  address (slug minus `-formula` = topic slug or the stem of the topic's quiz / Revalida Up / resumo page). Loader
  `lib/medhelp60/cronograma-server.ts loadD60()`; action `actions/medhelp60.ts setD60Check`; UI
  `components/content/medhelp-60d-cronograma.tsx` on `/app/medhelp-60d` (week load × the student's weekly time; when it does
  not fit the page SAYS so — never removes or reorders). **Meu Plano (Karina 2026-11-19, 01h12 — binding):** during the WHOLE 60D period (`inD60` in derive.ts: exam − 60 days up to
  the eve, every week, Simulado 100Q available or pending, and the days after week 8) the plan adds NOTHING of the regular course:
  no mini simulado (not even one in progress), no Revisão, no content — `planMinutesForDay` is 0 there, so the FORECAST counts the
  regular course only up to the day before the 60D begins ("N dias de estudo até o início do MedHelp 60D"; panel hidden inside
  the 60D). The day shows ONE block "MedHelp 60D — semana N" (the week's unticked minutes over its study days, `signals.sixtyD`
  from `fetch.ts`, href `/app/medhelp-60d`), her notice "Durante o MedHelp 60D, o Meu Plano programa somente…", and never a
  number of "free minutes" (any such number would have to be the real balance of the day). Regular resources stay open by the
  student's choice. **Tests and `plano-cenarios.ts` that exercise the regular plan must use an exam MORE than 60 days away.**
  Time estimates: three `d60_*` columns on `study_plan_settings`, in
  `PLAN_SETTING_FIELDS` (group "d60" at /admin/plano); answering a Simulado 100Q = its questions × `minutesPerQuestion`.
  Distribution from any database: `node --import ./app/tests/helpers/alias-hook.mjs scripts/medhelp60-distribuicao.ts
  [<DATABASE_URL>] --exame <date>` (read-only). Tests: `app/tests/medhelp60-cronograma.test.ts`. Patch:
  `schema-patch-medhelp60-cronograma.sql` (+ rollback).
- **Revisão by the student's CHOICE for the 60D materials (Karina 2026-11-19, 13h27 EST).** Fórmula MedHelp: ONE
  "Quero revisar" box between "Concluir leitura" and "Próximo tópico" (`page-complete-footer.tsx`, Fórmula pages only) →
  `review_schedule` item_type **`formula`** (item_id = page id), re-reads on the MemoreCards ladder 3/7/14/30 but **NEVER moved to the eve** (her 19/11 20h21 rule: a step on/after the exam is simply not offered — `formulaRereadNext` / `formulaRereadOffered`, offered only while the student has an exam ahead; MemoreCards keep the eve cap);
  a due re-read is done when the student reaches the page's footer; listed in the Revisão as "Reler Fórmula MedHelp" with
  "Já domino isto" per row. **Concluding the page or ticking the 60D checklist NEVER enrols it.** Simulados 100Q: an answer NEVER
  enters the Revisão (`/api/quiz-attempt` skips `gradeReviewItem` by the question's OWN page); only a WRONG question the student
  ticks (correction step or result list) enters — next day, then SM-2. Unticking = `suspended = true` (same as "Já domino", so the
  box follows it); re-ticking an active item changes nothing (no duplicate, no reset); re-answering never touches it. MemoreCards
  stay automatic. Rules in `lib/review/revisao-escolha.ts` + `actions/review.ts` (`setSimuladoQuestionReviewChoice`,
  `setFormulaReviewChoice`, `completeFormulaReread`). The patch suspended every 100Q row created automatically before (backup
  `review_schedule_bk_100q_20261119`) — those were never a student's choice. Same e-mail: her 4-paragraph 60D transition text in
  the Meu Plano forecast (replaces the deadline sentence), the "Entram no cálculo…" footer REMOVED (rules unchanged), Meu Plano tip
  "estima o que cabe do curso regular até a abertura do MedHelp 60D", 60D tip section "Escolha o que deseja revisar"
  (`Tip.section`, site_content `onboarding.medhelp-60d.escolha.*`). Patch: `schema-patch-revisao-escolha-60d.sql` (+ rollback).
  Tests: `app/tests/revisao-escolha-60d.test.ts`.
- **Fase 2 — Karina's definitive Flashcards + AudioCards + recordings — PARTLY LIVE prod + local (2026-11-18).**
  `scripts/apply-fase2-2026-11-18.js` (`--db <url>` | `--prod`, `--apply`; one transaction, deck + group NAME lookups, 15
  checks; without `--apply` it runs and rolls back) + `scripts/rollback-fase2-2026-11-18.sql` (exact restore from
  `*_bk_fase2`, proven on the rehearsal copy). Inputs in gitignored `parsed/fase2/` (delivery.json, audio-urls.json).
  LIVE: 16 themes rewritten in place through `import-cards-single-source.js` (468 cards, same ids) with their recordings
  (Bunny `AudioCards-Audio/v3/<spec>/<slug>-A.mp3` — a NEW folder per delivery, so no cached old file plays); "Ortopedia" =
  the old group "Trauma e Infecções Musculoesqueléticas" renamed (Outros), "Artrite Infecciosa" archived, both topics open
  Ortopedia; Espondiloartrites new in Reumatologia + Meu Plano link; cards a definitive file no longer has (Urologia 31–55,
  Cirurgia Pediátrica 29–30) MOVED to archive groups in `retirados-*` decks (never deleted, Revisão rows suspended); old
  `artrite-infecciosa-revalida-up` unpublished; Urologia Revalida Up via `scripts/import-revalida-up-fase2.js`.
  **HELD, untouched, waiting for Karina:** (1) the NINE groups whose cards 1–2 are in the frozen free deck
  (`free_flashcard_deck` stores card IDS — a rewrite in place changes the free deck): Perioperatório, Assistência Pré-Natal
  (also came without a recording), Doenças Hepatobiliares, Anticoncepção, Ética Médica e Medicina Legal, Assistência Clínica ao
  Parto, Diarreia e Desidratação, Sangramento Uterino Anormal, Hérnia; (2) the new recordings of Triagem Neonatal and
  Cardiopatia Congênita — they say "ecocardiograma nas 24 horas seguintes" where the published Teste do Coraçãozinho card says
  "antes da alta"; (3) Anemia Falciforme (her order: touch nothing). **Before any card import, check the free deck** — the
  script's first check is "free deck identical". Narration check = Whisper `.srt` per recording + `audiocards-asr-check.js
  --srt-dir`. **Never `SET default_transaction_read_only` on the pooler connection** (transaction pooling: it sticks to the
  server connection and the next client's write fails) — use `sql.begin('read only', …)`.
- **Fase 2b + MedVoice of Cirurgia Geral / Emergência / Ginecologia — LIVE prod + local (Karina 2026-11-18 19h19).**
  Everything the Fase 2 bullet above lists as HELD is now published (`df2c914`, `scripts/apply-fase2b-2026-11-18.js`, 17
  checks): the nine free-deck themes (she authorized it — **the free deck keeps THE SAME 50 card ids, selection and order;
  its 17 cards of those themes only got the new texts; never recalculate it by ranking**), Assistência Pré-Natal and Anemia
  Falciforme (Flashcards + AudioCards + recording; their Revalida Up pages are now "Assistência Pré-Natal Revalida Up" and
  "Doença Falciforme Revalida Up", same pages), Triagem Neonatal card 7 = "nas 24 horas seguintes" + the two Teste do
  Coraçãozinho recordings. Reações Transfusionais stays questions-only; Sepse Neonatal card 17 unchanged.
  **MedVoice (her item 8, live 2026-11-19 00h24 BRT):** `scripts/apply-medvoice-2026-11-18.js` (`--db`/`--prod`, `--apply`,
  `--report`; 10 checks; rollback `scripts/rollback-medvoice-2026-11-18.sql` from `lessons_bk_medvoice_20261118`). 47 lessons
  UPDATED IN PLACE by page + title (same ids — `lesson_completions` / `lesson_progress` cascade and Meu Plano links point at
  the lesson id) + 2 NEW lessons: the old "Diverticulite" and "Hérnia" each held two scripts under one recording, so
  "Diverticulite Complicada" and "Hérnia Estrangulada" are now their own lessons right after the parent; **since 19/11
  (her 01h08 e-mail) they ARE in Meu Plano as ADDITIONAL lessons of the topics Diverticulite / Hérnias** — a second
  `topic_content` medvoice link each (`schema-patch-medvoice-aulas-adicionais.sql`, by page + title). **A topic may have
  several MedVoice links**: derive.ts schedules each as its own audio (link-id order, main first; the card names the
  lesson only when there are several) and the topic concludes only when all are heard.
  **Obstetrícia (same e-mail):** `scripts/apply-medvoice-obstetricia-2026-11-19.js` (14 of 16 lessons in place, Bunny
  `MedVoice-Audio/v2/obstetricia/`; rollback `scripts/rollback-medvoice-obstetricia-2026-11-19.sql` from
  `lessons_bk_medvoice_obst_20261119`). "Sífilis E Gestação" came WITHOUT a recording → left untouched (old text + old
  audio) until it arrives; never a new text over an old audio. "Prematuridade" HELD too: at 01:46 Whisper hears
  "36 horas e 6 dias" (also on the clip alone) where the script says "trinta e seis e seis dias" — Karina listens first. Recordings on Bunny `MedVoice-Audio/v2/<spec>/<stem>-m.mp3` (a NEW folder, as
  with AudioCards v3); durations by ffprobe into `audio_duration_seconds`. Inputs in gitignored `parsed/medvoice-2026-11-18/`.
  The MedVoice of every other specialty is untouched and still the old set. Narration check = Whisper `.srt` per recording
  against the script; **a stretch Whisper "does not hear" is usually a transcription gap** (a cue far longer than its text):
  cut that stretch with ffmpeg and transcribe the clip alone before calling it a difference (all 8 such stretches were in the
  recordings). **Whisper (CPU) + a simulation + `next dev` + Chrome at once locked the machine — run them one at a time.**
  **Meu Plano (same commit):** a topic that has ONLY MedVoice keeps its place in the count in every phase, and one whose
  audio does not fit before the last 60 days shows as "não previsto até a prova" (forecast and simulation use one rule);
  a lesson with `lessons.audio_unavailable` (Pediatria: Maus-tratos…, Neuroblastoma — 404, not recovered, her order) is
  never scheduled as an audio activity (`schema-patch-medvoice-audio-unavailable.sql`). Ledger v14 (P36–P40).
- **Fase 1 — Karina's 27 question decisions + 24 definitive Revalida Up — LIVE prod + local (2026-11-18).**
  `schema-patch-fase1-2026-11-17.sql` (+ `-rollback.sql`), run AFTER the generated `parsed/revalida-up-fase1-import.sql`
  (`scripts/import-revalida-up-fase1.js`; rollback order is the reverse). 17 records moved to another section (slot by
  edition/number, residents keep their order), 9 redundant copies UNPUBLISHED — a copy is never deleted: it goes to the
  draft page `questoes-copias-despublicadas` (same ids). **The Revisão does not look at the page status**, so history of
  an unpublished copy goes to the kept copy, or its Revisão row is `suspended`; same for cards of an archived group.
  Primary topic of the 27 originals set + `aprovado`; incidence/bands only via the P20 triggers. Topic 201 renamed
  "Saúde do Trabalhador"; new section + topic Hematologia › `reacoes-transfusionais` (questions only); new topic Outros ›
  `corpo-estranho-nasal` (section Otorrinolaringologia). **Archived, kept:** Microangiopatias Trombóticas (section, Revalida
  Up, Flashcards + AudioCard, topic out of Meu Plano), Ventilação Mecânica and Delirium (Revalida Up, Flashcards +
  AudioCard) on `retirados-<specialty>-flashcards/-audiocards`; Demências had none. Revalida Up: the FILE NAME picks the
  live page (id, address and specialty kept), the title comes from the file header; "Ortopedia" reuses the old "Trauma e
  Infecções Musculoesqueléticas" page (now `ortopedia-revalida-up`, Outros); Espondiloartrites is new. Fase 2 = her
  Flashcards/AudioCards/recordings, imported together per group. Ledger v12 (P26–P30).

- **Financeiro (Administração → Comercial) — period, CSV, internal tests (Karina 2026-11-19).** `/admin/billing` reads EVERY
  order (paged past the 1000-row cap) and filters in the browser by the ORDER date in Brasília (`lib/admin/billing-period.ts`,
  pure): todo o período / mês e ano / data / intervalo, combined with status, search and "Pedidos reais | Testes internos".
  Indicators follow the period only and never count a test or a R$ 0 enrollment. "Exportar CSV" = exactly the listed rows
  (`;`, decimal comma, UTF-8 BOM — Excel pt-BR). **A test is `orders.internal_test` — the SAME flag as the Notas Fiscais
  screen** (one meaning everywhere: not a sale); marked/unmarked in bulk with a confirmation by `/api/admin/billing/test`
  (billing roles, writes only that flag, audited `nfse_test_marked/unmarked` with `source: financeiro`). Never delete an order.

## Schema (see schema.sql for full DDL)

Tables and their purpose:

| Table | Purpose |
|---|---|
| `cohorts` | One row per exam cycle; holds `test_date` and membership window |
| `user_cohort_memberships` | User ↔ cohort join |
| `content_modules` | Named date-gated sections; `unlock_offset_days` drives the unlock date |
| `cohort_module_access` | Per-cohort unlock date for each module; trigger-maintained from `test_date` |
| `specialties` | 12 core specialties (seed rows in schema.sql) |
| `tracks` | Cross-cutting content series: `medvoice`, `audiocards`, `flashcards` |
| `pages` | All migrated pages; carries `specialty_id`, `view`, `track_id`, `content_module_id`, `notes` |
| `lessons` | One row per toggle (text-lesson / audio-lesson); `audio_url` nullable |
| `quiz_questions` | H5P QuestionSet → one row per MCQ; `answers` as JSONB `[{text, correct, feedback}]` |
| `flashcard_items` | H5P CoursePresentation+Dialogcards → one row per card; `text` / `answer`; `group_position` = slide index |
| `presentation_slides` | H5P CoursePresentation+AdvancedText/Image → one row per slide; for memorecards pages |
| `nav_items` | Blurb cards and link lists from hub pages; `target_page_id` null = incomplete |
| `review_schedule` | Unified SM-2 spaced-repetition state for the Revisão feature; one row per `(user, item_type, item_id)`, `item_type` ∈ flashcard/quiz_question/memorecard. Backfilled from `flashcard_progress`. Patch: `schema-patch-review-schedule.sql` |
| `ambassadors` | One row per contracted embaixador; carries `code` (?ref=), `coupon_id`, `status`, `contract_starts_on`/`contract_ends_on`, `commission_rate_bps`, and `access_cohort_id` (the "turma de acesso" that grants free access — NULL for non-student ambassadors). Patch: `schema-patch-ambassadors.sql` |
| `ambassador_clicks` | Referral-link landings, for the panel's click count and attribution disputes |
| `commissions` | The ledger. One `kind='sale'` row per attributed order plus negative `kind='adjustment'` rows for post-payout chargebacks. `rate_bps` is stamped at creation so rate changes never move history. Statuses are the contract's five: pendente/liberada/em_analise/paga/cancelada |
| `payouts` | One monthly repasse per ambassador; `nf_url` + status ladder already present so self-service withdrawal is a later form, not a migration |
| `flashcard_theme_topics` | Maps each flashcard theme `(specialty_id, group_label)` → `topics.id`, so `getWeightedRevalidaDeck` ranks themes by real incidence via a FK instead of fuzzy name-matching at query time (that silently dropped ~1 in 4 high-yield themes). Resolved offline by `scripts/backfill-flashcard-theme-topics.js` (exact + curated alias map); keyed by label (not card id) so it survives the full-replace flashcard regeneration — re-run the backfill after a regen. Patch: `schema-patch-flashcard-theme-topics.sql` |

**Access control** (RLS): pages with `content_module_id IS NULL` require active cohort
membership. Pages with a module set also require `cohort_module_access.unlock_date <= today`
for the user's cohort. Two helper functions (`user_has_active_membership`,
`user_has_module_access`) keep RLS policies readable.

**Track pages** get `track_id` set during import (identified by recursive `parent_id` walk from each track hub):
- medvoice: 19 pages (hub WP id 2985, slug `medvoice`)
- audiocards: 18 pages (hub WP id 3690, slug `audiocards`)
- flashcards: 18 pages (hub WP id 3767, slug `flashcards`)

Track pages may also carry `specialty_id` and `view`; the two fields are orthogonal.
The schema stores lessons as atomic toggle units; how they render (tabs, sub-pages, toggles)
is a frontend decision deferred to the new app.

**H5P routing** (library_id only): all 209 H5P rows are one of two library types:
- `library_id = 15` (H5P.QuestionSet) → `quiz_questions` rows
- `library_id = 35` (H5P.CoursePresentation):
  - slides contain H5P.Dialogcards → `flashcard_items` rows (all *-flashcards pages)
  - slides contain H5P.AdvancedText / H5P.Image → `presentation_slides` rows (all *-memorecards pages)

## Parser rules (for content extraction)

### Universal cleanup
- HTML entity decode: `&#8221;` → `"`, `&#8243;` → `"`, etc.
- Strip Divi attribute soup: `_builder_version`, `_module_preset`,
  `global_colors_info`, `border_radii`, `box_shadow_*`, `custom_padding`,
  `hover_enabled`, `sticky_enabled`, etc. Keep ONLY structurally meaningful
  attributes (e.g. toggle `title`, blurb `post_link_url_page`).
- Strip Notion paste artifacts: `<!-- notionvc: ... -->`.
- Strip empty `<a>` wrapper tags around images.
- Strip `wp-image-NNNN` classes from img tags.
- Strip emoji and stethoscope bullet-point images (decorative only;
  replace at render time in new app).
- Trim whitespace on toggle titles. Title-case inconsistent titles
  (some are ALL CAPS, some lowercase, some Title Case).

### Per-type rules
- **text-lesson with mixed-toggle-types**: distinguish content toggles
  (prose inside) from nav-link toggles (only `<a>` tags inside). Strip
  nav-link toggles during extraction; they're page-level navigation, not
  lesson content. Use the `RE_LINK_ONLY` pattern: `^\s*(<a\b[^>]*>.*?</a>\s*)*\s*$`.
- **audio-lesson**: ZoomSounds shortcode is `[zoomsounds_player ... source="URL"]`
  — attribute is `source=`, not `src=`. Audio is per-toggle: one shortcode lives
  inside each toggle body. Extract the URL from each toggle's raw content, assign to
  `lessons.audio_url` for that toggle, and strip the shortcode from `body_html` before
  cleanup so only the transcript remains.
- **h5p-quiz**: handle both `[h5p id="N"]` shortcode AND `<iframe
  data-content-id="N">` patterns. Both resolve to `wp_h5p_contents.id`.
  Parse the `parameters` JSON column for question content.
- **blurb-nav-hub**: extract `post_link_url_page` from each `[et_pb_blurb]`.
  Blurb card page links are encoded as `@ET-DC@<base64>@` in
  `_dynamic_attributes="link_option_url"` — not literal URLs. Decode at
  parse time. The decoded JSON is `{"dynamic":true,"content":"post_link_url_page",
  "settings":{"post_id":"NNNN"}}` — use `settings.post_id` directly as the WP
  post ID (no slug lookup needed). If empty, flag as incomplete (the 14 draft hubs).
- **flashcard_items schema**: `text` = front/prompt side (H5P `dialogs[].text`);
  `answer` = back/answer side (H5P `dialogs[].answer`); `group_position` = slide
  index within CoursePresentation; `position` = card index within the slide.
- **All internal links**: resolve URLs/slugs to target `pages.id`
  (foreign key) instead of storing URLs. Survives any future URL changes.
- **Bare-slug hrefs in body_html**: `RE_A_HREF` only resolves full
  `https://medhelpspace.com.br/...` URLs. Relative hrefs like
  `<a href="some-slug">` are left as-is. One known instance: page_id=261
  (`objetivas-comentadas`) body contains a bare-slug link to
  `manejo-inicial-do-desconforto-respiratorio-no-recem-nascido`. The new
  app's link renderer must handle bare-slug hrefs by looking them up in
  `pages.slug`.

### Slug deduplication: WordPress vs. flat schema

**Problem**: WordPress enforces slug uniqueness per parent (full URL path),
not globally. Two pages under different parents can share the same `post_name`.
Supabase uses a flat `pages.slug` column with a unique constraint, so these
collide on import.

**Affected pages** (patched directly in `parsed/pages.sql`; do NOT re-run
parser without adding `SLUG_OVERRIDES` — see below):

| WP id | Original `post_name` | Disambiguated slug | Parent | Type |
|-------|---------------------|-------------------|--------|------|
| 1450 | `manejo-inicial-do-desconforto-respiratorio-no-recem-nascido` | `…-quiz` | `objetivas-comentadas` | `h5p-quiz` |
| 3589 | `manejo-inicial-do-desconforto-respiratorio-no-recem-nascido` | `…-formula` | `formula-medhelp` | `plain-content` |
| 5279 | `neoplasias-do-sistema-nervoso` | `neoplasias-do-sistema-nervoso-resumos` | `neurologia-resumos` | `plain-content` |
| 5274 | `neoplasias-do-sistema-nervoso` | *(unchanged — canonical)* | `neurologia` | `plain-content` |

**Suffix convention**: append the page's `view` field value — `-quiz`,
`-formula`, `-resumos`, `-simulados`, `-hub` — to the non-canonical copy.
For id=5279 the title already said "Resumos" so `-resumos` was the natural choice.

**If the parser is ever re-run**, add this dict before the content-parsing loop
and substitute `SLUG_OVERRIDES.get(pid, slug)` when building `rows_pages`:

```python
SLUG_OVERRIDES = {
    "1450": "manejo-inicial-do-desconforto-respiratorio-no-recem-nascido-quiz",
    "3589": "manejo-inicial-do-desconforto-respiratorio-no-recem-nascido-formula",
    "5279": "neoplasias-do-sistema-nervoso-resumos",
}
```

## SQL parser gotcha

UpdraftPlus lines end with `); \n` (space before `\n`). Always use
`.rstrip()`, not `.rstrip("\n")`, or the INSERT buffer never flushes.

## Audio handling

- `audio_url` is nullable on lessons. Adding audio later is one UPDATE.
- New admin UI must support:
  - Per-lesson upload (one-off additions)
  - Bulk folder upload with filename-to-lesson matching (initial bulk add)
- Audio coverage dashboard: show % of lessons with audio per specialty.

### MedVoice audio — populated

Bunny CDN structure — two-tier:
- Original 7 specialties: `MedVoice-Audio/{specialty-slug}-feito/{title-slug}-m.mp3`
- 10 newer specialties: `MedVoice-Audio/clinica-medica-feito/{short-folder}/{title-slug}-m.mp3`
  - Folder names: `cardio-feito`, `dermato-feito`, `endocrino-feito`, `gastro-feito`,
    `hemato-feito`, `infecto-feito`, `nefro-feito`, `neuro-feito`, `pneumo-feito`,
    `psiquiatria-feito`, `reumato-feito`

- Title slug = lesson title lowercased, accents stripped (NFD), spaces→hyphens, `-m.mp3` suffix
- Script: `scripts/populate-medvoice-audio.js` — dry run by default, `--apply` to commit
- `PAGE_TO_SUBFOLDER` map stores full paths; `buildUrl` no longer appends `-feito`

**All 17 MedVoice specialties now have audio (156 lessons populated):**
`cirurgia-geral`, `clinica-medica`, `ginecologia`, `medicina-de-emergencia`, `obstetricia`,
`pediatria`, `saude-coletiva`, `cardiologia`, `dermatologia`, `endocrinologia`,
`gastroenterologia`, `hematologia`, `infectologia`, `nefrologia`, `neurologia`,
`pneumologia`, `psiquiatria`, `reumatologia`

**Gotcha:** the DB page slug for medicina-de-emergencia is `emergencia-medvoice` (not
`medicina-de-emergencia-medvoice`). The script has a manual mapping for this.

**Audiocards audio:** not yet uploaded to Bunny. Same approach will apply when ready —
update script with audiocards folder structure and re-run.

### MedVoice page type note

Only `cardiologia-medvoice` was classified `audio-lesson` by the parser (it had ZoomSounds
shortcodes). All other MedVoice pages are `text-lesson` type. Both are handled by
`TextLessonRenderer`, which will show an audio player per section when `audio_url` is set
(player not yet added to renderer — pending).

## Things explicitly NOT to migrate

- Divi inline styles (rebuild semantically in new theme)
- WordPress media library classes
- Emoji + bullet-point image decorations
- WooCommerce checkout/cart/account pages
- PMPro account/billing pages
- Dashboard pages with `[mhs_welcome_bar]` / `[mhs_updates_ticker]`
- The custom updates ticker plugin (rebuild as React component)

## Status tracker

- [x] Recon complete (page type universe identified)
- [x] Inventory CSV generated (`page-inventory.csv`)
- [x] Migration decisions made
- [x] Schema design finalized (schema.sql + schema-design.md — pending final team review)
- [x] Parser implemented (`parser.py` — smoke + full run; output in `parsed/`)
- [x] H5P content extracted
- [x] Migration dry run
- [x] Migration to target Supabase project
- [x] MedVoice audio URLs populated (156 lessons, all 17 specialties)

### Frontend phases

- [x] Phase A — Auth, routing, dashboard (server component; shows display_name, cohort badge, specialty grid, 60D countdown)
- [x] Phase B — Plain-content renderer (`PlainContentRenderer` + `TocPanel`; auto-TOC at 3+ headings)
- [x] Phase C — Text-lesson renderer (`TextLessonRenderer` + `LessonSidebar`; sidebar nav, "Próxima seção" button)
- [x] Phase C.5 — Audio player in TextLessonRenderer (`<audio>` per section when `audio_url` set)
- [x] Phase D — H5P quiz player (one question at a time, scoring, retry wrong answers; quiz images populated)
- [x] Phase E — Flashcard player (flip interaction, self-assessment, keyboard shortcuts, attempt tracking, retry mode)
- [x] Phase F — Memorecards carousel (presentation_slides; 7 broken image refs accepted as unmigratable legacy)
- [ ] Phase G — Audiocards section (same as MedVoice once files uploaded; blocked on Bunny CDN uploads)
- [x] Phase H — Blurb-nav-hub renderer (63 hub pages; verified on /app/cardiologia and track hubs)
- [x] Admin panel — Phase I complete: dashboard, members (role mgmt, password reset, session revoke), cohorts (edit, cascade preview, soft delete), module unlock date overrides, audit log, stub pages for content editors

### Programa de Embaixadores (pilot)

Contract terms are enforced in the DB, not in route code — see the commission trigger
in `schema-patch-ambassadors.sql`. Commission base is `base_amount_cents - discount_cents`
(installment interest excluded, PagBank fees NOT deducted); release is BR-today + 30 days.
The trigger is wrapped in an exception handler on purpose: it runs in the same transaction
as `finalizePaidOrder`'s status flip, so a commission bug must never be able to roll back a
payment that has already granted membership.

- [x] Schema — ambassadors, clicks, commissions ledger, payouts, order attribution (applied to prod AND local; trigger verified with 15 checks in a rolled-back transaction)
- [x] Attribution capture — `/r/<CODE>` records the click, sets a 30-day HttpOnly cookie, and redirects; the charge route freezes the attribution onto the order. Coupon outranks link; last click wins.
- [x] Release cron — `/api/cron/ambassador-commissions`, daily 08:00 UTC (05:00 BRT). Flips pendente → liberada at `release_on` using `todayKeyBR()`, re-checks the order is still `paid`, and re-asserts `status='pendente'` in the UPDATE so a concurrent run can't double-release.
- [x] Ambassador panel — `/embaixador`, read-only (cl. 8.1). Deliberately NOT under `/app`: that layout requires an active cohort membership and most ambassadors hold none, so the route does its own auth check and gates on having an `ambassadors` row. Dark-only (outside the `/app`+`/admin` theme-unlocked zone). Mobile-checked at 375/414/768.
- [x] Admin — `/admin/embaixadores` (billing tier only): create/edit ambassadors, per-ambassador totals, and the full cl. 7.5 cycle — close the month, record the NFS-e, mark paid, reopen. Closing takes commissions *released* up to the end of the reference month (later ones wait for the next cycle) and includes negative adjustments, so a chargeback reduces the payout. Reopen is refused once paid.
- [x] Cohort price/date changes are audited (`cohort_create` / `cohort_update` in `admin_audit_log`, before → after, money rendered as BRL)

### ClinAct (build step 1 — shipped 2026-08-28)

Spec: `CLINACT-BUILD-SPEC.md` (closed). Authoring contract: `docs/clinact/formato-de-conteudo.md`
(v1) — bundled copy in `app/src/content/clinact/` is kept byte-identical by a test.

- [x] Schema — `schema-patch-clinact.sql` (prod + local): `user_product_access` +
  `user_has_product_access(p)`, seven `clinact_*` tables, RLS. ONE write path:
  `clinact_save_case(jsonb, uuid)` (atomic replace, one transaction per case) and
  `clinact_publish_case`. Both snapshot the full document into `clinact_case_versions`
  whenever the published revision changes — every `attempts.case_revision` has a frozen copy.
- [x] Engine — `app/src/lib/clinact/`: `parse.ts` (format v1, line-numbered PT errors),
  `serialize.ts` (round trip), `validate.ts` (publish blockers; media missing = warn on
  import, BLOCK on publish via CDN HEAD), `scoring.ts` (weights 1/0.6/0.2/0 frozen; case
  score → per-format → overall, never over events), `engine.ts` (screens + state fold).
- [x] Admin — `/admin/clinact` (super_admin + content_admin): list, editor (`/novo`, `/[id]`:
  ficha · blocks · checklist, preview via signed 6h link, publish/unpublish/duplicate/archive,
  export .txt), importer (`/importar`: files + paste, dry-run table, partial import, always
  drafts, published skipped unless opted in). Audit: `clinact_publish/unpublish/archive/
  delete_draft/import`.
- [x] Member — `/clinact` (sales placeholder, public dark-only), `/clinact/treinar`,
  `/clinact/caso/[slug]`, `/clinact/preview/[token]` — all under `app/clinact/(membro)/`
  gated by `requireProductAccess('clinact')` (lib/clinact/access.ts), NOT under `/app`.
  Answers/feedback never reach the client before the decision is submitted.
- [x] Karina's gate feedback (2026-08-31): audio/video download hidden in the player
  (deterrence: controlsList + context-menu block), permanent delete allowed for any
  non-published case with NO real student attempts (preview attempts never protect;
  real attempts → archive only), and **Minha Evolução (simple) is LIVE** at
  `/clinact/evolucao` — treinos, desempenho geral, por formato, confiança,
  erros com alta confiança; all from canonical attempts (§2.2.1/§2.3), live queries.
- [x] Free sample cases (2026-08-31, supersedes "no free content"): `clinact_cases.is_free`
  ("Caso gratuito" toggle in the ficha; plan = ONE per format). The (membro) layout now
  requires only LOGIN; pages gate individually — free cases fully playable without a
  subscription, others lock + CTA to /clinact. Patch: `schema-patch-clinact-free-cases.sql`
  (also makes `clinact_save_case` PRESERVE is_free when the doc omits it — re-import safe).
- [x] Step 2 (shipped 2026-08-31): all four format players live. Código Decifrado map
  (components/clinact/codigo-decifrado.tsx — clusters linked, distratores dimmed with
  reason, CHAVE FINAL centre) and Prontuário Vivo (in case-player) are GENERATED, never
  authored. Clínica em Cena branching: a scene targeted by any `vai para` is a DETOUR —
  normal fall-through SKIPS it (matches the guide's inline template; documented in guide
  §7, both copies). Map spoilers (cluster/distrator/CHAVE FINAL) are stripped from the
  client payload until the attempt finishes — advanceAttempt returns them on finish.
- [x] Accepted media formats FROZEN (Karina 2026-09-01, "Formatos de audios"): audio
  mp3/m4a/wav, image jpg/png/webp/gif, video mp4/webm. `.ogg` is REFUSED — Safari only
  plays Ogg Vorbis from 18.4, so older iPhones get a silent player, which violates her
  own no-dead-media rule. One allowlist in `lib/clinact/media.ts` (ALLOWED_MEDIA_EXT +
  mediaRejectionReason) used by BOTH the importer (warning, case still imports) and the
  uploader (refusal with the PT reason). Before this the ClinAct uploader accepted ANY
  file type. Guide §8 carries the table (both copies).
- [x] Karina's step-2 test round (2026-09-02): **Código Clínico and Ponto de Virada
  APPROVED**; Clínica em Cena halted on a state bug, all fixed. Four fixes:
  (1) **`clinact_step_events.step_id` was ON DELETE CASCADE** and `clinact_save_case`
  replaces every step, so EVERY re-publish silently deleted the per-decision history
  (confidence, correctness, timing) of every past attempt — scores survived, which is why
  it looked like only confidence data vanished. Now `ON DELETE SET NULL`; lost events were
  rebuilt from `clinact_attempts.state.answered`, which held the same facts.
  Patch: `schema-patch-clinact-preserve-events.sql` (prod + local, backfill verified).
  (2) A saved case gives every step a NEW id, so an attempt started earlier held answers
  keyed to dead ids — resuming it pre-filled the Prontuário Vivo with unchosen conducts and
  double-counted the clock. `loadPlayer` now abandons an attempt whose answered keys no
  longer exist (an attempt with no answers still resumes).
  (3) The decision counter used the ANSWER COUNT, so it read "Decisão 2 de 2" during the
  first decision's feedback; it now tracks the decision being read.
  (4) Código Decifrado's "Não fecham o caso" block: discard is signalled by the card
  (dashed border, tinted panel, icon, struck-through label), never by faint text.
  Blank templates in all four `modelo-*.md` now put the text on the marker line
  (`- [pista]`, `* [alternativa correta]`) — a bare `-` made the importer say "Pista sem
  texto"; an unreplaced `[placeholder]` is now a loud import error.
- [x] CEC-01 re-test PASSED (Karina 2026-09-02): all four formats now **APPROVED**
  (routes, Prontuário on both, clock, reconvergence, no cross-route leakage, media,
  desktop + mobile). One UX fix shipped after it: **branching cases number decisions
  with NO total.** The old total counted every decision SCREEN, so CEC-01's normal
  route ended at "Decisão 3 de 4" — a denominator it cannot reach, which also admits
  a scene the student never visited. Counting only the committed route is worse: it
  cannot know a branch is coming without spoiling it, so it would read "1 de 3" and
  flip to "1 de 4" mid-feedback. `clinica_em_cena` → "Decisão N"; the linear formats
  keep "de N". Karina still has to publish CEC-01 and mark the four free cases.
- [x] **ETAPA 2 CLOSED by Karina 2026-09-02.** She published CEC-01, played it for real
  on Mac + phone (registered in Minha Evolução), confirmed the recovered CC-01 history,
  validated batch import of 4 separate .txt files (one per format → 4 drafts, right
  editor each) — her normal flow is small batches, up to ~4 — and marked the four free
  cases: D30-01 *A pressão não respondeu*, CC-01 *Um limite novo na rotina*,
  PV-01 *Dor pélvica no plantão*, CEC-01 *No início do plantão*. Four decisions shipped
  in `742d6ac`:
  (1) **Renaming a case moves its address.** The editor froze the slug once published,
  so retitling D30-01 (dropping "Choque", which gave the diagnosis away) left it at
  `/caso/choque-decisao-hemodinamica`. The slug now follows the title always;
  `clinact_case_slugs` keeps EVERY address a case ever had and the route
  `permanentRedirect`s a retired one. Patch: `schema-patch-clinact-slug-history.sql`
  (prod + local) — its trigger REFUSES a slug that is another case's alias, so a rename
  can never point an old link at the wrong case; the editor suffixes (-2, -3) first.
  **A rename cannot touch history**: attempts/step_events/review_schedule/Minha Evolução
  all key on `clinact_cases.id`, never the slug (test asserts no history table stores
  one). The IMPORTER still matches a re-imported file by slug — deliberately untouched.
  (2) **TEMA is withheld until the case is over** — reading "Pneumonia" in the library
  handed over the reasoning. Same finished-gate as the Código Decifrado spoilers; shown
  on the closing screen and on already-completed library rows. Still a full internal
  metadatum (filters, review queue, reports, admin). Before opening, the student sees
  format · specialty · title · difficulty · duration.
  (3) Guide: **confidence in Clínica em Cena is SELECTIVE** — never after every scene;
  none, one or several, by clinical weight (§9, both copies + the CEC model table).
  (4) Guide §2: **public title must not give the case away; TEMA organises it.**
  D30-01's slug updated on prod (7 attempts / 5 events verified unchanged).
- [x] **Biblioteca — two-door architecture FROZEN + BUILT (Karina 2026-09-02, `e847e50`).**
  `Porta A` formato → especialidade → caso (`/clinact/treinar/casos?formato=&especialidade=`);
  `Porta B` especialidade → formato → caso (`/clinact/treinar/[especialidade]`, modelled on
  Revalida's "Estude por especialidade"). **Both doors narrow the SAME library** and hand off
  to one filtered list — one id, one address, one history, never a copy (test asserts the two
  paths return the identical row). Format cards lead with the verb (CONECTAR/CONDUZIR/
  PRIORIZAR/REAVALIAR — `SKILL_LABELS` + `FORMAT_BLURBS` in types.ts). **TEMA is NOT a third
  public layer** — Cirurgia Geral → Clínica em Cena → "A dor mudou de lugar", never through
  Apendicite; tests assert no library screen renders or navigates by it. Only specialties with
  published cases are listed; a format with 0 cases reads "Em breve" and is unclickable.
  Files: `lib/clinact/library.ts` (loader, server-only) + `library-filters.ts` (pure, testable —
  library.ts imports access.ts which needs Next's runtime, so filters MUST stay separate),
  `components/clinact/case-list.tsx` (shared rows, theme gated on completion) and
  `library-cards.tsx`. `/clinact/treinar/casos` is a STATIC sibling of `[especialidade]`, so a
  specialty may never be slugged `casos`. Rendered against the local DB with a real session
  (both doors, chips, trail).
- [x] **Library restyled to read as the same platform as Revalida (Karina 2026-09-02, `31e2276`).**
  She confirmed the architecture and asked for Revalida's presentation: Casos = four format
  cards then the specialty grid; a specialty page = title → short orientation → the four
  formats (where Revalida shows its content types). Built against the REAL components
  (`app/app/page.tsx`, `app/app/[specialty]/page.tsx`), not her screenshots — the Gmail
  connector exposes no attachment bytes, so her prints could not be opened. Each format has a
  colour token in globals.css, mapped by `FORMAT_COLOR_VARS`. **Those four tokens are `var()`
  ALIASES of the Revalida palette, not colours of their own** (`9650259`, her follow-up): 1
  Código Clínico → `--c-questoes`, 2 Clínica em Cena → `--c-resumos`, 3 Decisão em 30 Segundos
  → `--c-revalida`, 4 Ponto de Virada → `--c-medvoice` — a FIXED order so a student learns the
  format-colour pairing. Because they are aliases they follow light/dark automatically: never
  redefine them in the dark block. An **"Em breve" card keeps its own colour** (a ghost: light
  tint of the hue, hue on icon + verb, normal reading text) — never greyed, never recoloured.
  **GOTCHA: an inline `opacity` on these cards is dead** — the `dash-fade-up` keyframe animates
  opacity with `fill-mode: both`, so the animation's end state wins; the "Em breve" card dims
  through `filter` instead. Also: Revalida's on-card text opacities (0.62/0.72/0.75) lose
  contrast against the DARK palette (light pastels), so ClinAct uses 0.82/0.88/0.92.
  **The visual mobile check DID run this time** (375 + 768, light + dark): no overflow, tap
  targets at min-h-11. Chrome DevTools MCP was reachable — the earlier "profile in use" error
  clears on its own; retry before assuming it is blocked.
- [x] **ETAPA 2 APPROVED AND CLOSED by Karina 2026-09-02** — four formats, four pilot cases,
  four free cases, individual + batch import, history protected across editorial revisions,
  spaced review, confidence + high-confidence-error tracking, the two-door library, the shared
  Revalida palette, and the spoiler rule tested live on a new case ("Antes mesmo da pulseira":
  `Emergência · Intermediária · 2 min` before, `Anafilaxia` shown only after finishing).
- [x] **INVESTIGAÇÃO block (Karina 2026-09-03), second half shipped 2026-10-06 (`217eadd`)** — engine was `9c6cba8`.
  Multi-select decision, Clínica em Cena only, ONE event per block (`payload.selected`), score = Σ quality ÷
  (ideals + extras). Player: no result before confirm; after, only ordered items' results (`Reveal.results`,
  rebuilt from the saved selection on resume); unordered items show verdict + feedback, never the result.
  Guide §7 "Investigação" (marked EM TESTE). Test case **CEC-INV-TESTE-01** = prod id 32 / local id 26, a
  non-free DRAFT from `docs/clinact/exemplos/cec-inv-teste-01.txt` via
  `scripts/clinact-create-investigation-test-case.ts` (fingerprints official CEC-01 before/after; re-run safe).
  Karina plays it via Admin → ClinAct → the case → Pré-visualizar. **Editorial rules:** feedback never contains
  the result; the scene after an investigation never restates results; two substitutable options never both
  ideal. Fixed on the way: parser dropped the block's question text; THREE more hardcoded decision lists
  (format-presets `isDecision`, validate.ts, editor) — derive from `DECISION_KINDS`, never copy it.
  **Karina's test round (2026-10-06 evening, `dcf5574`): engine/UI/conditional reveal APPROVED**, the three MVP
  decisions (unordered = verdict + feedback, never result; empty confirm = 0; Prontuário gets text, media stays on
  the result screen) and the one-shot confidence APPROVED. Shipped her asks: **permanent rule** in guide §7 — no
  later scene/option/feedback/text may assert, calculate, exclude or presuppose anything that depends on an exam
  the student may not have ordered (must work for EVERY combination, incl. none); summary says "itens da
  investigação ideal", never "essenciais" (`investigationSummary` in types.ts — ideal ≠ mandatory); TC
  prejudicial → inadequada (her final classifications are locked by a test). Her suggested gravidade feedback
  itself said "CURB-65 de 3", which needs the urea — rewritten with bedside CRB-65 de 2. Publish checklist now
  WARNS when a result-only number reappears later (mechanical half; inference stays editorial).
  Her three clinical calls (`faa8378`): new hemoculturas + TC feedbacks, "Colher hemoculturas" option replaced
  by "monitorização habitual", and a SECOND permanent rule — no later option may order again what the block may
  already have done. **OFFICIALLY APPROVED 2026-10-06 night**: all final tests passed (empty confirm, ⌘R resume,
  8-exam excess = 88%). Her one resume "bug" was a Continuar press 96 s after confirming (prod attempt 96,
  `updated_at`) — the load path never moves the cursor; regression test `c2ccf22`. "Em teste" removed from guide
  §7, block listed in "Blocos disponíveis", `modelo-clinica-em-cena.md` gained an optional INVESTIGAÇÃO section
  + copyable snippet (after the main template, so the blank-template tests are untouched). The test copy stays a
  DRAFT as the worked example (export .txt from the editor). Official CEC-01 untouched throughout.
- [x] **Own taxonomy + Cenário clínico (Karina 2026-10-12/14, approved for production 2026-10-14).** ClinAct NEVER
  reads Revalida's `specialties` / `topics` again: `clinact_specialties` (21, her alphabetical order, NO "Outros")
  and `clinact_topics` (240) — same ids the cases had, so no case moved; new rows from 101 (specialties) / 100000
  (topics). Read ONLY through `getTaxonomy()`; a test refuses `from("specialties"|"topics")` in ClinAct code.
  Admin `/admin/clinact/taxonomia` (content roles, audited `clinact_specialty_*` / `clinact_topic_*`): rename never
  touches the slug (cases link by id); deactivate refused while a PUBLISHED case uses it; delete refused while ANY
  case uses it (specialty: or has topics). The importer's "Especialidades e temas" list is GENERATED from it
  (`lib/clinact/taxonomy-doc.ts`; the static .md is gone) and TEMA matches only inside the case's specialty,
  accent-insensitive — **register a new topic in Taxonomia BEFORE importing**, or it imports "Sem tema ligado".
  `clinact_cases.scenario` (six slugs, CHECK; `lib/clinact/scenarios.ts`): ficha select, `CENÁRIO:` in the importer
  (absent = keep, unknown = blocking error listing the values), compact chips on /clinact/treinar, 3-way filter
  (formato + especialidade + cenário) in the query string, zero-case chips/specialties shown faded + not links
  ("Em breve"). `review_schedule.specialty_id` is written NULL for ClinAct (it FKs Revalida's table); history keeps
  specialty/topic/scenario in `clinact_case_versions` snapshots. PV platform blurb = "Reavalie quando um novo dado
  muda o caso." (sales page keeps hers). Patches: `schema-patch-clinact-taxonomia.sql` (tables + scenario, dropped
  the old FKs), `-temas.sql` (data), `-publish.sql` (FKs to the ClinAct tables, ON DELETE RESTRICT). Scenario
  backfill: `scripts/clinact-backfill-scenarios.ts`. Worktree dev server: `next dev --webpack` (Turbopack panics on
  the node_modules junction).
- [ ] Step 3 — subscriptions (PagBank recurrence), Pix one-off, card self-update, real
  sales page. **STARTED 2026-09-02** (`00fb2e2`): login AND signup now thread `next` end to
  end — `/login` declared `next` and ignored it, so the proxy's `?next=` landed everyone on
  `/app` (fatal for a ClinAct subscriber with no cohort), and `/auth/signup` hardcoded
  `emailRedirectTo`. Every hop re-runs `safeDestination()`. **PagBank recurrence (updated 2026-09-15):** a SEPARATE API
  (`sandbox.api.assinaturas.pagseguro.com` / `api.assinaturas.pagseguro.com`) with its own token
  + public key. **Proven end to end in SANDBOX (`4529f09`)** — plan → customer → card →
  subscription → invoice PAID → payment APPROVED → cancel — via `lib/pagbank/subscriptions.ts`,
  which is NOT imported anywhere yet: no subscription checkout, no webhook handler, and nothing
  writes `user_product_access`. Token `PAGBANK_SUBSCRIPTIONS_TOKEN_SANDBOX` lives in
  `app/.env.local` only. Gotchas: that host 403s (Cloudflare error 1010) without a browser
  User-Agent; the card registers on the CUSTOMER as a bare array; POST /subscriptions returns 201
  even when the first charge is DENIED (status OVERDUE), so access must follow the payment.
  **Browser-encrypted cards PROVEN in sandbox (2026-09-15).** The card is encrypted in the browser
  with `PagSeguro.encryptCard` using the Recurring-Payments public key (`GET /public-keys` on the
  assinaturas host — NOT the Orders key) and sent as `billing_info: [{type, card: {encrypted}}]` on
  POST /customers, which tokenises it; PUT `billing_info` with a new encrypted card changes it (new
  token). Approved card → ACTIVE / PAID / APPROVED; declined (`5200489065784203`) → 201 OVERDUE /
  DENIED. The raw-card path is REMOVED from the client — we are not PCI certified. **PagBank's one
  plaintext field:** POST /subscriptions answers 400 `security_code` mandatory for EVERY shape
  (card token, `card.encrypted`, inline customer), even though the reference says `encrypted`
  excludes other fields — so the CVV transits our server once, for that call; never store or log
  it. `getPublicKey()` reads the key; `createPublicKey()` (PUT) ROTATES it and breaks open checkout
  forms. A declined first charge schedules an automatic retry for the NEXT DAY
  (`retries: [{attempt: "FIRST", status: "SCHEDULED"}]` on the subscription). Changing the
  customer's card moves their subscription onto it, so that retry should charge the new card
  (not observed — it runs a day later); the subscription stays OVERDUE until then. Evidence for
  form field 17: `pagbank-homologacao-recorrencia.txt` (repo root, gitignored), regenerated from
  this encrypted run — 17 calls, approved + declined + card change, audited for
  token/PAN/CVV/blob/CPF/e-mail. Homologation has NOT been submitted. Per the spec, the sales page
  and the free-case path do NOT depend on that release — only the plan buttons do.
  **Karina's pre-homologation round (2026-09-17), `7ca4f11` + `b937b20`:** annual plan proven end to
  end (R$ 299,00 → ACTIVE / PAID / APPROVED). **Retries and the webhook URL are ACCOUNT-WIDE, not
  per subscription**: `GET|PUT /preferences/retries` (intervals only 1/3/5/7 days; `finally`
  SUSPEND or CANCEL, CANCEL when unset — now 3/5/7 + SUSPEND in sandbox) and
  `PUT /preferences/notifications` (`urls[]`, only the LAST url is notified). Both live on the
  credential, so PRODUCTION must be configured again after homologation. **`reference_id` does NOT
  deduplicate**: the same POST /subscriptions body twice created a second subscription and charged
  it again. `x-idempotency-key` is the only guard and the header name is CASE-SENSITIVE (lowercase
  only; other casings are refused with a message about the value's format); a replayed key answers
  409 `idempotency_key_in_use` — treat that as "already created", then look it up. **Recovery
  works**: declined → OVERDUE (+ a scheduled retry) → new encrypted card → `PUT /subscriptions/{id}/retry`
  (one per day) → invoice PAID ~90s later, subscription ACTIVE ~3min later — the payment clears
  BEFORE the status, so access must follow the PAID invoice. **Webhooks**: route
  `/api/pagbank/assinaturas/webhook` (separate from the Revalida one, grants nothing, re-reads the
  subscription from the API), events logged to `clinact_subscription_events`. Undocumented events
  arrive: `customer.created`, `customer.billing_info.updated` (their `resource.id` is a CUST_ id).
  **The signature is `x-payload-signature` — an ECDSA DER blob, NOT the Orders
  `x-authenticity-token` SHA-256 of `{token}-{body}`** (the commit message on `b937b20` says
  otherwise; it was written before a real delivery arrived). No PagBank public key is published for
  it, so it is identified and logged, never gated on — ask PagBank during homologation.
  **Item 1 DONE + verified** (fresh no-access account: signup → library → free case played in
  full → paid case redirects to /clinact). **Item 2 DONE (`441da86`)**: the sales page exists in
  full (her 14 sections, her copy, all via `SiteText`) and is NOT public — `site_pages.published`
  gates it, admins see it with a "não publicada" banner. New tables `site_pages` +
  `site_sections` (real booleans/ints, NEVER strings in site_content: "false" as text is truthy).
  Sections are declared in code (`components/clinact/sales/sections.tsx`) and only ordered/hidden
  by the table, so adding one is never a migration. **The gate fails CLOSED** — an unreadable
  layout renders the sections but keeps `published=false`. Prices live in `lib/clinact/plans.ts`
  (her decision 2) and "dez mensalidades"/"R$ 24,92" are COMPUTED so the claim cannot drift.
  Renewal text sits inside Planos with no toggle of its own (decision 3). Pure ordering lives in
  `lib/site-sections-order.ts` because `queries/site-sections.ts` is server-only (same split as
  `library-filters.ts`). Still to build: `/admin/clinact/pagina` (toggle + reorder) and the
  screenshot slots. **PagBank store URL answer: `https://www.medhelpspace.com.br`** — same
  merchant/account/domain, not /clinact (public still shows "Em breve"), not staging.
  **Sales page brief + architecture assessment: `CLINACT-SALES-PAGE-SPEC.md`**
  (Karina 2026-09-01 — brief AND her approval of all six open points; do not build before
  step 3). Decided: signup-first for the free cases (no anonymous play); prices read from
  the plan config, never an editable string; renewal/billing text exempt from the
  visibility toggle; screenshots admin-replaceable; case count computed, never typed; and
  **the page ships behind a page-level published flag — public only once signup + 4 free
  cases + subscription work end to end** (her call, overriding my "publish early" advice).
  **SUPERSEDED 2026-09-25 — the commercial flow is LIVE on production (gated only by the unpublished page):**
  PagBank production enabled (the EXISTING iBanking token works on the recurrence API — NEVER press "Gerar token", it
  invalidates the live Revalida token). Checkout `/clinact/assinar?plano=` (card encrypted in the browser; CVV transits
  once), `/clinact/assinatura` (cancel + card change, no ids accepted), renewals via cron `/api/cron/clinact-subscriptions`
  + webhook fast path; `grantAccess` writes `user_product_access` (`source='subscription'`, forward-only).
  Karina's real R$ 29,90 run + cancel PASSED; prod retries 3/5/7+SUSPEND and webhook URL set. Admins bypass the access gate,
  so test the checkout with a plain account. Signup confirmation e-mail is pt-BR and returns to `next` via
  `user_metadata.confirm_next` (source: `docs/auth-email-templates/`; `{{ .Type }}` renders empty — hardcode it).
  `/admin/clinact/pagina`: publish gate (super_admin), section order/visibility (Planos never hideable), two screenshot
  slots (`clinact.{casos,evolucao}.image`, set). Sandbox webhooks hit prod as `?ambiente=sandbox` and are dropped.
  OPEN (Karina): publish the page; logs to Nathalia (~01/10); refund; Pix-key check; Pix one-off for ClinAct yes/no.
  **Sales page v2 + editable platform (Karina 2026-10-08, `f560a4c`, prod + local seeded).** Her editing bug: a
  `<SiteText>` is only editable once its `site_content` row exists — the page had 41 keys in code and NONE in the DB.
  Now EVERY ClinAct string lives in `lib/clinact/site-copy.ts` (`CLINACT_COPY`, her text verbatim); `<ClinactText k>`
  is typed against it; `scripts/clinact-seed-site-content.ts <DB_URL>` creates missing rows (DO NOTHING — never
  overwrites her edits). **Adding a ClinAct key = add it to CLINACT_COPY, then run the seed on prod AND local.**
  Tests refuse `<SiteText>` in ClinAct files and any `k="clinact.…"` outside the map. Six sections (hero,
  competencias, casos, evolucao, gratuitos, planos — old keys kept for the admin ordering + image slots;
  `schema-patch-clinact-sales-v2-sections.sql` dropped the other 8 rows). Revalida-page look (black `--lp-base`,
  Bricolage, mono eyebrows, side-by-side demos alternating). Admins see the page AS A VISITOR (`has && !isAdmin`) —
  they pass the access gate and otherwise only see "Entrar nos casos". New token `--brand-text` (#7a1d91 light /
  #c084e8 dark): brand AS TEXT — `--brand` stays dark purple in dark (~2.4:1 as text). Screenshots = LIGHT-mode
  captures (clinact-assinante@local.test after decision 1 of CEC-01; demo.clinact for Minha Evolução), uploaded to
  Bunny `clinact/site/`. Casos shows her weekly line under the title. The checkout still says "10 mensalidades".

## Theme requirements (non-negotiable)
- Light and dark mode supported from day one
- Semantic color tokens only; no literal colors in component code
- Theme defined in one central file (`theme.ts` or equivalent)
- WCAG AAA contrast for body text (7:1 minimum)
- User preference persisted in profiles table
  (`theme_preference`: 'light' | 'dark' | 'system'; default 'system')
- Apply theme inline before React hydration to prevent flash
- Brand purple shifts: `#7a1d91` (light mode), `#c084e8` (dark mode)
- Media (images, EKG strips) renders with subtle framing in dark mode

## Admin panel requirements

### Multi-admin support (built in from day 1, tiered when needed)

Schema designed for role-based access control from the start. For V1, only the
two operational roles are used (Justin + Karina). The other roles are defined
but unused until you need them.

**Roles:**
- `super_admin` — full access to everything (Justin, Karina)
- `content_admin` — edit pages, lessons, quizzes, modules, audio uploads; no
  access to payments, member PII beyond what's needed for content work
- `support_admin` — view member accounts, handle access issues, password resets,
  cohort assignments; no content editing or financial data
- `billing_admin` — manage payments, refunds, cohort dates, PagBank operations;
  no content access
- `member` — default for all signups; no admin access

**Schema:**
- `users.role` enum with values above; default `'member'`
- RLS policies use role checks (e.g., editing pages requires role IN 
  ('super_admin', 'content_admin'))
- Same authentication for all users; role determines what admin UI is visible
- Admins can also be members (e.g., Justin can hold a cohort membership for
  testing) — the role field is independent of cohort membership

**Future-proofing note:** if you ever need fine-grained permissions beyond
these tiers (e.g., "content admin who can edit lessons but not quizzes"),
migrate to a proper `roles` + `permissions` + `role_permissions` table
structure. Don't preemptively build that for V1.

### Admin panel bilingual support (Portuguese / English)

The admin UI must support a per-user language toggle. Justin reads Portuguese
slowly and needs English in the admin panel; Karina prefers Portuguese.

- All admin UI strings use i18n from day 1 (recommend `react-i18next` for React
  + Supabase stack)
- Translation files: `locales/admin/pt-BR.json`, `locales/admin/en.json`
- Toggle stored as `users.admin_locale` enum: `'pt-BR' | 'en'` (default `'pt-BR'`)
- Toggle accessible from the admin header (e.g., language icon in user menu)
- Switching takes effect immediately, persists across sessions and devices

**Critical:** never hardcode admin UI strings. Every label, button, error
message, table header, and tooltip in the admin panel goes through a
translation key from day 1. Retrofitting i18n later means touching every
component — much worse than the small overhead of doing it right initially.

### Member-facing site: Portuguese only (no i18n)

This is an intentional decision. The member-facing site (everything outside
`/admin`) will always be Portuguese only. No i18n infrastructure for
member-facing components. Strings are hardcoded in Portuguese directly in
components.

If this ever changes (e.g., expansion to other Portuguese-speaking markets or 
an English version for international Brazilian doctors abroad), revisit then.
For now: simpler is better.

## Frontend gotcha: shadcn v4 uses Base UI, not Radix

When CC ran `npx shadcn@latest`, it installed v4 components built on Base UI
(`@base-ui/react`) instead of Radix. Base UI does NOT support the `asChild` 
prop pattern that's standard in Radix-based shadcn.

**Workarounds used:**
- `<Button asChild><Link>` → `<Link className={buttonVariants(...)}>`
- `<DropdownMenuTrigger asChild><Button>` → directly-styled `<DropdownMenuTrigger>`
- `<DropdownMenuItem asChild><Link>` → `onClick={() => router.push(...)}` with `useRouter`

If a future session adds new shadcn components and hits "asChild is not a prop" 
errors, this is why. Either pin to an older shadcn version (Radix-based) for 
new installs, or apply the same workaround patterns.

## Frontend auth architecture

### Stack

- **Supabase Auth** (email/password) via `@supabase/ssr`
- **`createBrowserClient`** for client components (`lib/supabase/client.ts`)
- **`createServerClient`** for server components and middleware (`lib/supabase/server.ts`)
- **Next.js proxy** (`src/proxy.ts` — Next 16 renamed the `middleware` file convention to
  `proxy`) refreshes session cookies on every request; uses `auth.getUser()` (server-validated),
  not `getSession()` (cookie-only, unvalidated). Its matcher deliberately excludes `/api/*`.
- **`AuthProvider`** (`providers/auth-provider.tsx`) is the React context that holds
  `user` (Supabase `AuthUser`) and `profile` (our `profiles` table row); wraps all app routes

### Profiles table and auto-creation

Every `auth.users` INSERT fires `handle_new_user()` (SECURITY DEFINER trigger) which
inserts a `profiles` row. The `profiles` table extends auth with:
`role`, `admin_locale`, `theme_preference`, `display_name`.

### `current_user_role()` — why SECURITY DEFINER

RLS policies on `profiles` call `current_user_role()` to determine the acting role.
Without SECURITY DEFINER, evaluating those policies would try to read `profiles` again,
causing infinite recursion. The function is defined as SECURITY DEFINER so it reads
the table with superuser rights, bypassing RLS entirely.

**Never** call `current_user_role()` from client code — it only works server-side
(Postgres functions). Use `profile.role` from the React context instead.

### Role escalation prevention

The `profiles_update_own` RLS policy uses `WITH CHECK`:
```sql
current_user_role() IN ('super_admin') OR NEW.role = OLD.role
```
`current_user_role()` reads the stored value (pre-update), `NEW.role` is the
attempted value. A non-super_admin changing their own `role` fails this check.

### `USE_MOCK_DATA` flag

Set automatically in dev when `NEXT_PUBLIC_SUPABASE_URL` is absent.
Every auth call, query function, and middleware check gates on this flag.
Set `NEXT_PUBLIC_USE_MOCK_DATA=true` to force mock mode even with a Supabase URL.

### Side effects on profile load

`AuthProvider` calls `setTheme(profile.theme_preference)` and
`i18n.changeLanguage(profile.admin_locale)` immediately after fetching the profile.
`ThemeProvider` must be the outermost wrapper (it is) for `setTheme` to work here.

## Data fetching pattern

### CRITICAL: Always use server components for Supabase reads

`createBrowserClient` (from `@supabase/ssr`) hangs indefinitely on REST queries in
this app — the fetch initiates but never resolves. Root cause: concurrent token refresh
race condition between multiple browser client instances (refresh tokens are single-use).

**Rules:**
- All Supabase reads → `async` server components using `createClient()` from `lib/supabase/server.ts`
- Never use `useQuery` / TanStack Query hooks for Supabase reads in member-facing pages
- The only `"use client"` code that reads Supabase: `AuthProvider` (auth state subscription only)
- `lib/queries/` functions exist but are unused for member pages — don't reach for them

The server-side client works reliably (middleware proves this at ~400ms per request).

### TanStack Query + `lib/queries/`

All Supabase reads go through typed functions in `src/lib/queries/`:

```
lib/queries/
  profiles.ts      — getCurrentProfile(), useCurrentProfile()
  cohorts.ts       — getCurrentUserCohort(), getCohortModuleAccess(), use* hooks
  specialties.ts   — getSpecialties(), useSpecialties()
  pages.ts         — getPagesBySpecialty(), getPageBySlug(), use* hooks
  lessons.ts       — getLessonsForPage(), useLessonsForPage()
  quiz.ts          — getQuizQuestionsForPage(), useQuizQuestionsForPage()
  flashcards.ts    — getFlashcardsForPage(), useFlashcardsForPage()
  nav.ts           — getNavItemsForPage(), useNavItemsForPage()
  index.ts         — re-exports all of the above
```

Each file exports:
1. A query key constant (array) — use these for cache invalidation
2. An async fetch function — call directly in server components or mutations
3. A `use*` hook wrapping `useQuery` from TanStack Query v5

### Mock bypass pattern

Every fetch function checks `USE_MOCK_DATA` first and returns mock data
without hitting Supabase. This lets the entire UI run offline in dev.

```ts
export async function getLessonsForPage(pageId: number): Promise<Lesson[]> {
  if (USE_MOCK_DATA) return MOCK_LESSONS.filter((l) => l.page_id === pageId);
  const supabase = createClient();
  const { data, error } = await supabase.from("lessons").select("*")...
  if (error) throw error;
  return data ?? [];
}
```

### staleTime defaults

- Reference data (specialties, tracks): 60 min
- Cohort / module access: 10 min
- Content (pages, lessons, quiz, flashcards, nav): 5 min
- Profile: 5 min

## Running migration SQL files

Use `scripts/run-sql.js` to execute any of the `parsed/*.sql` files against Supabase
in a single atomic transaction — the whole file succeeds or rolls back entirely.

**One-time setup:**
1. `npm install` from `medhelpspace/` (installs the `postgres` package)
2. Add your DB password to `app/.env.local`:
   ```
   SUPABASE_DB_PASSWORD=<password from Supabase dashboard → Project Settings → Database>
   ```

**Usage:**
```bash
node scripts/run-sql.js parsed/pages.sql
node scripts/run-sql.js parsed/lessons.sql
node scripts/run-sql.js schema-patch-001.sql
```

The script connects via the direct Postgres URL (`db.<project-ref>.supabase.co:5432`),
derived automatically from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_DB_PASSWORD`.
To use the Transaction Pooler instead, set `DATABASE_URL` directly in `app/.env.local`.
(The direct `db.<ref>.supabase.co` host no longer resolves — `DATABASE_URL` via the
pooler is the working path.)

**Apply every patch to BOTH databases.** `app/.env.development.local` overrides `.env.local`
in dev, so `npm run dev` talks to the **local** Supabase while `run-sql.js` targets **prod**.
A patch applied only to prod makes dev fail with PostgREST `PGRST205 ... not found in the
schema cache`, which looks exactly like a stale-cache bug but isn't:

```bash
node scripts/run-sql.js schema-patch-foo.sql                            # prod
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
  node scripts/run-sql.js schema-patch-foo.sql                         # local
```

Local PostgREST does not auto-reload; follow up with `NOTIFY pgrst, 'reload schema';`.

## Content rendering design decisions (locked in)

### Text-lesson pages (220 pages) — BUILT
- `TextLessonRenderer` (server) + `LessonSidebar` (client, IntersectionObserver)
- Section anchors: `id="section-{lesson.id}"` with `scroll-mt-24`
- Mobile: hamburger toggle above content; desktop: sticky left sidebar (w-52)
- "Próxima seção" link at bottom of each section except the last
- Audio player: **not yet added** — fetch `audio_url` per lesson, show `<audio>` when set

### H5P quiz pages (204 pages)
- One question at a time with next/prev navigation
- Immediate feedback after each answer (correct/incorrect + explanation)
- Score summary at end with breakdown
- "Refazer as erradas" (retry incorrect) button after summary
- Store quiz attempt history per-user — surface "last score" on hub pages
- Explanations come from the H5P parameters extracted during migration

### Plain-content pages (473 pages) — BUILT
- `PlainContentRenderer` (server) + `TocPanel` (client, IntersectionObserver)
- Auto-TOC: 3+ `<h2>`/`<h3>` headings → sticky right-side TOC; otherwise pure prose
- Heading IDs injected server-side (slugified, dedup-aware)
- WP inline `#b046e9` color → `.prose-brand-color` class (remapped in processHtml)

### Flashcards (3,506 items across ~12 decks)
- Card flip interaction: click/tap or space to flip
- After flip: "Errei" / "Acertei" buttons (self-assessment)
- Respect group_position from migration — render groups separately with 
  group_la