# ClinAct — Build Spec

Companion to the design proposal sent to Karina (2026-08-21). That document is the
*what and why*; this one is the buildable detail. Nothing here is implemented yet —
no code, no schema patch.

**Karina approved the architecture on 2026-08-27.** Her changes are folded in and
marked with that date where they overrode an earlier decision: published-version
snapshots, no grace period, card self-update in Phase 1, a simple Minha Evolução at
launch, a configurable `final_key` instead of a mandatory diagnosis, and NFS-e gated
on the 7-day guarantee. Two corrections she caught apply to the **proposal artifact**,
not this file: `clinact_clues` describes the case (four tables describe, two record),
and only **two** blocks are system-generated, not three.

**Closed 2026-08-28** on her second pass: media generalised to image + audio in all
four formats and revealable mid-case (§2.1); `quality` scoring for scene conducts
(§2.2); first-completed-attempt analytics (§2.3); autosave confirmed (§2.4); the timer
never blocks (§2.5); annual card renews yearly until cancelled (§4). She considers the
architecture closed for implementation. Two answers still outstanding — the `quality`
weights and who records the clinical audio.

Product: **MedHelpSpace ClinAct** — clinical reasoning that ends in a decision.
Sold **separately** from Revalida; access independent in both directions.

---

## 1. Access control — two products, one gate

Revalida access stays exactly as it is (`user_cohort_memberships` + cohort window).
ClinAct is NOT a cohort. Add a product-scoped access table and route both through
one helper.

```sql
CREATE TABLE user_product_access (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product      text NOT NULL CHECK (product IN ('revalida','clinact')),
  source       text NOT NULL,          -- 'subscription' | 'pix_oneoff' | 'bundle' | 'grant'
  starts_at    timestamptz NOT NULL DEFAULT now(),
  paid_until   timestamptz NOT NULL,   -- THE authority; see invariant below
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product)
);
```

`user_has_product_access(p text)` — SECURITY DEFINER, same shape as the existing
`user_has_active_membership()`:

- `p = 'revalida'` → existing cohort check **OR** a live `user_product_access` row
  (so a bundle can grant Revalida without inventing a fake cohort).
- `p = 'clinact'` → `paid_until > now()`.

App-side gate mirrors `lib/membership-gate.ts`: `requireProductAccess('clinact')`,
admin roles bypass, no access → `/clinact` (the sales page), not `/loja`.

**Routing: subdirectory, not subdomain** (decided 2026-08-27). ClinAct lives at
`medhelpspace.com.br/clinact` inside the existing Next.js app — one deployment, one
domain, one session cookie. A subdomain would have meant cookie-domain juggling for
no gain, and bundles are on the roadmap, so a Revalida member arriving at ClinAct
should already be logged in. It also inherits the main domain's search authority.

**The ClinAct member area must NOT live under `/app`.** That layout requires an
active *cohort* membership, and a ClinAct subscriber will usually hold none — the
exact reason `/embaixador` sits outside `/app`. ClinAct routes do their own
`requireProductAccess('clinact')` check. Slot the new routes into
`lib/theme-scope.ts` deliberately: `/clinact` (sales) is public and dark-only; the
member area joins the theme-unlocked zone.

**Do not** reuse `content_module_id` gating for ClinAct — that is cohort-date logic
and would couple the two products' unlock rules.

### Invariant (binding)

> Access is a **timestamp that only moves forward on a confirmed payment**, never a
> boolean flipped by a webhook.

Lost webhook cannot revoke; duplicate webhook cannot double-grant; PagBank downtime
cannot lock members out. Same defense-in-depth posture as `finalize.ts`.

---

## 2. Case engine schema

Seven tables, prefix `clinact_`. `specialty_id` → existing `specialties`;
`topic_id` → existing `topics` (reuses the incidence weighting already built).

| Table | Key columns |
|---|---|
| `clinact_cases` | `slug` UNIQUE, `format`, `title`, `specialty_id`, `topic_id`, `difficulty`, `primary_skill`, `est_minutes`, `summary`, `takeaway`, `final_key`, `status`, `revision`, `published_at`, `created_by` |
| `clinact_steps` | `case_id`, `position`, `kind`, `enabled`, `scene_key`, `skill`, `content jsonb` |
| `clinact_options` | `step_id`, `position`, `label`, `is_correct`, `quality`, `feedback`, `seduction`, `effect jsonb`, `next_scene_key` |
| `clinact_clues` | `case_id`, `position`, `label`, `detail`, `media jsonb`, `category`, `is_red_herring`, `cluster` |
| `clinact_attempts` | `user_id`, `case_id`, `case_revision`, `started_at`, `finished_at`, `score`, `duration_ms`, `state jsonb` |
| `clinact_step_events` | `attempt_id`, `step_id`, `option_id`, `skill`, `is_correct`, `confidence`, `time_ms`, `answered_at` |
| `clinact_case_versions` | `case_id`, `revision`, `published_at`, `snapshot jsonb`, UNIQUE(`case_id`,`revision`) |

Four tables describe the case (`cases`, `steps`, `options`, `clues`), two record what
the student did (`attempts`, `step_events`), and one preserves history
(`case_versions`).

`final_key` is the centre of the Código Decifrado map — **not necessarily a
diagnosis** (Karina, 2026-08-27). It can be a syndrome, mechanism, complication,
priority, investigation or conduct. Authored as `CHAVE FINAL:` in the import format.

### Published versions are snapshotted, not just numbered

`clinact_attempts.case_revision` alone is a number pointing at content that may no
longer exist. On every publish of an already-published case, write the full case —
steps, options, clues — as a JSONB snapshot into `clinact_case_versions` **before**
the edit lands.

Without it, editing one option on a case 300 students already took makes their
attempts unreadable: you know they answered "B", not what "B" said. This matters
most in the exact situation the product is built for — a medical guideline changes
and the case is rewritten.

**Cheap now, impossible later.** Retrofitting cannot recover overwritten content.
Ship it before the first case is ever published.

Enums (as CHECK constraints, matching project convention):

- `format` ∈ `codigo_clinico | clinica_em_cena | decisao_30s | ponto_de_virada`
- `skill` ∈ `conectar | conduzir | priorizar | reavaliar`
- `status` ∈ `draft | published | archived`
- `confidence` ∈ `baixa | media | alta` — **fixed three levels, decided before case 1.**
  Variable scales destroy cross-cohort comparability.
- `quality` ∈ `ideal | aceitavel | inadequada | prejudicial` — nullable; see §2.2.

### 2.1 Media is a JSONB shape, not a table

One object, used in three places, every field but `type` and `url` optional:

```json
{ "type": "image|audio|video", "url": "…", "caption": "…",
  "alt": "…", "transcript": "…" }
```

Where it appears:

| Place | How | Schema impact |
|---|---|---|
| A `midia` / `narrativa` / `novo_dado` step | inside `content jsonb` | none |
| A clue that *is* an image | `clinact_clues.media` | **new column** |
| A conduct that *reveals* media | `effect.revela[].midia` | none (JSONB) |

Available in **all four formats** (Karina, 2026-08-28). The block inventory listed
`midia` but the per-format matrix omitted it, so this had no documented answer.

`type` is an open string, not a two-value enum: video is out of the MVP but must not
require a migration to add. `alt` and `transcript` are the accessibility fields —
optional, but the panel should nudge for them.

**Files live on Bunny CDN**, same as MedVoice and AudioCards. No new storage.

The requirement that matters is not "support audio" — it is that **media can be
revealed by a decision**, not only shown at the top of a case. Auscultating produces
a sound; ordering a film produces an image. That is why `revela` entries carry
optional media: revealing a finding and revealing a sentence are the same act.

### 2.2 Scoring — `quality` where nuance is real, `is_correct` where it is not

A scene conduct is rarely right or wrong. `clinact_options.quality` carries the
nuance; it is **nullable**, and when null the option falls back to `is_correct`. So an
ordinary multiple-choice question is authored exactly as before, and only scene
conducts carry an explicit quality.

| `quality` | Weight |
|---|---|
| `ideal` | 1.0 |
| `aceitavel` — reasonable, not the priority | 0.6 |
| `inadequada` | 0.2 |
| `prejudicial` — potentially harmful | 0.0 |

Case score = mean of the weights of the options actually chosen. Binary questions
score 1.0 / 0.0 through the same path, so Minha Evolução compares formats without a
per-format special case.

**The weights freeze before the first published case.** Changing them later silently
rewrites the meaning of every historical percentage — the identical argument that
fixed the confidence scale at three levels. Pending Karina's explicit confirmation.

### 2.3 Repetition — the first *completed* attempt is canonical

Every attempt is stored. Minha Evolução reads only the first completed attempt per
`(user_id, case_id)`; repeats are retained for retention analysis later.

No new column: `DISTINCT ON (user_id, case_id)` over attempts with `finished_at NOT
NULL`, ordered by `finished_at`. A flag would be one more thing to fall out of sync.
An abandoned first try never becomes the reference, which is what "concluída" means.

Report the canonical attempt **with its `case_revision`** — with version snapshots in
place, "60% on revision 1" stays meaningful after a guideline rewrite.

**UI consequence:** a repeat that scores 100% against a dashboard still showing 60%
reads as a bug. Repeat runs must be visibly marked as not counting.

### 2.4 Autosave and resume

Already the design, restated because it is load-bearing for Clínica em Cena: runtime
state is folded from chosen effects into `clinact_attempts.state` and written on every
step event. Scene, prior decisions, revealed clues, patient state, narrative clock,
locked hypothesis, confidences given, blocks completed — all of it lives in that one
field.

Because it is **server-side, not browser storage**, resume survives a closed tab, a
dropped connection, a reload, *and a different device*. No case is ever restarted by
accident.

"Reiniciar" is a deliberate, separate action that opens a **new** attempt and leaves
the original registered — so the canonical-attempt rule above still holds.

### 2.5 The timer is pressure, not a lock

At zero the `cronometro` does **not** submit, does **not** disable the options, does
**not** mark the answer wrong, and does **not** end the case. The student answers
normally afterwards. `clinact_step_events.time_ms` already records how long they took,
so the data exists without the timer ever gating anything.

"Decisão em 30 Segundos" names the *experience* of prioritising under pressure, not a
time-eliminated exam.

### Why `content` is JSONB

Per-`kind` field sets differ wildly; 80 mostly-null columns and a migration per new
block type is the alternative. Validation lives in a Zod schema **per kind**, and the
admin form is generated from that same schema — so a new block type is one schema
file, zero DB work, and the field appears in the panel automatically.

`skill` lives on the **step**, not the case: a Ponto de Virada can open with a
`conectar` question. Per-step is what makes the Perfil de Raciocínio Clínico honest.

### Block kinds (16)

`narrativa`, `pistas`, `pergunta`, `ordenar`, `cena_conduta`, `novo_dado`,
`reavaliacao`, `confianca`, `feedback`, `seducao`, `custo_do_atraso`, `midia`,
`cronometro`, `leve_deste_caso`, plus two **generated, never authored**:
`prontuario` (Prontuário Vivo) and `codigo_decifrado`.

Format → default step stack lives in code (`lib/clinact/format-presets.ts`), not the
DB: picking a format seeds the stack, every block toggles per case. The matrix of
which block is default/optional/absent per format is in the proposal document —
with one correction: **`midia` is available in all four formats** and was missing
from that matrix. See §2.1.

### Convergent branching (Clínica em Cena)

- Steps group by `scene_key`. `clinact_options.next_scene_key` is **NULL by default**
  → falls through to the next scene in `position` order. Convergence is the default;
  divergence is opt-in.
- `effect jsonb` = `{ revela: [{cat, texto, midia?}], estado: {...}, relogio: n }`.
  `cat` ∈ `sabemos | encontramos | fizemos | estado` — that is the entire Prontuário
  Vivo authoring surface. Nothing is written per step.
- Runtime state is derived by folding chosen options' effects over the attempt;
  persisted in `clinact_attempts.state` so a refresh resumes.
- `codigo_decifrado` renders from `clinact_clues` alone (`cluster` draws the links,
  `is_red_herring` dims with the reason). One layout for every case.

**Publish validator refuses** when: a scene is unreachable, `next_scene_key` points
at a non-existent scene, any path never reaches the terminal scene, or a detour runs
deeper than 1 scene before reconverging. Errors are named by scene, in Portuguese —
the panel audience is a content producer, not a developer.

---

## 3. Admin panel — `/admin/clinact`

Three-column editor (ficha · step stack · live preview + publish checklist).
Follows the existing admin conventions: i18n keys for **every** string in both
locales, `super_admin` + `content_admin` only, audit-log entry per publish/unpublish.

| Action | Behavior |
|---|---|
| Save draft | No validation. Always saves incomplete. |
| Preview | Signed temporary URL, runs the real player, attempt flagged `is_preview` and excluded from stats. |
| Publish | Runs validator; sets `status='published'`, stamps `published_at`. |
| Edit published | Saves in place, `revision += 1`. Attempts store `case_revision`. |
| Unpublish | Back to `draft`. Attempts and stats retained. |
| Duplicate | Deep copy (steps + options + clues), new slug, `status='draft'`. |
| Archive | Out of circulation, nothing deleted. Hard delete only for never-published drafts. |

`revision` on the attempt is not optional: editing an option on a case 300 students
already took would otherwise blend two versions into one lying accuracy number.

### 3.1 Content intake — two doors, one parser

| Door | For | Route |
|---|---|---|
| Editor | One case, authored in the panel | `/admin/clinact/novo` |
| Bulk importer | Many cases, authored in her writing tool | `/admin/clinact/importar` |

Both write the same tables through the same validator. The importer is not a lesser
path — it is how the 40 launch cases land, and it is the screen Karina keeps
afterwards for weekly production.

### 3.2 Bulk importer

Reuse the quiz bulk-paste builder pattern (NFC normalization + the emoji `u`-flag
gotcha are already solved there).

- **Input:** paste box **and** file upload, several files at once, `.md` / `.txt`.
  One file may hold many cases, separated by a delimiter line `=== CASO ===`.
- **Two-phase, always:** parse → dry-run report → confirm → import. Nothing is
  written to the DB before she confirms.
- **Dry-run report** is one row per detected case: title, format, specialty, block
  count, status `OK | avisos | erro`. Every error names the case and the line number,
  in Portuguese — the audience is a content producer, not a developer.
- **Partial import is the default.** Valid cases import; broken ones are listed with
  their errors and block nothing. One typo in case 17 must never cost her the other 39.
- **One transaction per case**, not per batch — case 17 failing cannot roll back 1–16.
- **Always drafts.** The importer never publishes. Publishing stays a deliberate,
  validated, audit-logged act in the editor.
- **Re-import is keyed on `slug`:** an existing draft is overwritten; an existing
  **published** case is skipped by default, with an explicit “atualizar mesmo assim”
  opt-in that bumps `revision`. Never silently overwrite published content.
- **Input normalization is non-negotiable** — she authors in Google Docs / Word.
  NFC normalize, straighten smart quotes and apostrophes, convert non-breaking spaces,
  normalize autocorrected en/em dashes, strip comment and tracked-change residue.
  Text that looks identical on screen must parse identically.
- **Media:** cases reference images by filename; the same screen has an upload
  dropzone and resolves them by name. An unresolved filename is a **warning**, not an
  error — the case imports with an empty media slot.
- **Audit log** entry per batch: who, how many, which slugs, how many rejected.
- **Media tags** `[imagem: arquivo.jpg]` / `[audio: arquivo.mp3]` are standalone lines
  that attach to whatever precedes them — the same upward-attaching rule as
  `feedback:`. Optional `legenda:`, `alt:`, `transcricao:` follow. Valid inside a
  block, inside a clue, and under a conduct (where it becomes a revealed finding).
- **`qualidade:`** on a scene conduct maps to `clinact_options.quality`. Absent, the
  option falls back to `*` / `-`.

### 3.3 The authoring format is a deliverable, not a convention

The accepted text format is a contract with Karina and must exist in writing
**before she writes case 1**.

- `docs/clinact-formato-de-conteudo.md` — PT-BR, versioned in the repo. Every labeled
  section, which are obligatory per format, what a valid option / clue / scene looks
  like, and one complete worked example per format.
- Four fill-in-the-blank templates, one per format, to copy into her writing tool.
- Both reachable **from the importer screen itself** — “Baixar modelo” per format and
  “Ver exemplo completo”. Instructions that live only in an e-mail are lost by case 12.
- **Round-trip export:** any case exports back to the exact format it imports from.
  This makes the template self-documenting (edit a real case in a doc, re-import it)
  and is the escape hatch if the panel is ever unavailable.
- The guide is versioned **with the parser**. If the accepted format changes, the guide
  changes in the same commit and the importer states which version it accepts.

**Gate:** Karina imports a 3-case file unaided, working from the guide alone, before
she starts producing the 40.

---

## 4. PagBank recurrence

### Findings from the current docs (2026-08-21)

1. **Separate API, separate credentials.** Recurrence lives at
   `api.assinaturas.pagseguro.com` (sandbox: `sandbox.api.assinaturas.pagseguro.com`)
   — not a parameter on `api.pagseguro.com`. New env vars, new module, new webhook
   route. Note the existing footgun: the Connect public key in `.env.local` is
   unrelated to this one.
   **The public key is genuinely separate** and is created by us via
   `PUT /public-keys`; keys minted for the recurring API do not work for any other
   PagBank service. The **token** is the same account token, gated by account
   release — confirm in writing with PagBank before touching any credential.
   **Production requires the Integrations team to release the PJ account**, then a
   homologação form after sandbox testing. Neither is automatic; see §8.
2. **Credit card only.** Pagamentos Recorrentes accepts card exclusively today
   ("novas formas de pagamento estarão disponíveis em breve"); retry config is
   documented as card-only. **No Pix Automático in the subscriptions API** — not in
   the endpoint index, not in the webhook events. PagBank does offer Pix Automático
   commercially via payer-side adhesion to a proposal, but no documented receiver
   API. → **Do not block launch on it.**
3. **Retry default is CANCEL.** Up to 3 attempts at 1/3/5/7-day intervals with a
   final action. Unset, PagBank cancels — and CANCELED/EXPIRED are terminal, so the
   student must re-subscribe. **Configure 3 attempts at 3/5/7 days, final action
   SUSPEND.** A declined charge sets `PENDING_ACTION`, which halts auto-retries until
   a new card or a manual retry (max 1/day/subscription).

### Tables

```sql
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  product text NOT NULL DEFAULT 'clinact',
  plan text NOT NULL CHECK (plan IN ('monthly','annual')),
  pagbank_subscription_id text UNIQUE,   -- SUBS_…
  pagbank_plan_id text,
  status text NOT NULL,                  -- mirror of PagBank, verbatim
  payment_method text NOT NULL CHECK (payment_method IN ('credit_card','pix')),
  current_period_end timestamptz,
  next_invoice_at timestamptz,
  canceled_at timestamptz,
  raw jsonb
);

-- append-only; idempotency key on the PagBank event id
CREATE TABLE subscription_events (
  id bigserial PRIMARY KEY,
  subscription_id uuid REFERENCES subscriptions(id),
  pagbank_event_id text UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
```

### Webhook events → access

Events: `subscription.initial`, `.updated`, `.activated`, `.suspended`,
`.recurrence`, `.expired`, `.canceled`, `.migrated`.

| PagBank status | Access rule |
|---|---|
| `PENDING` | none until first authorization |
| `TRIAL` / `ACTIVE` | `paid_until = period_end` |
| `OVERDUE` / `PENDING_ACTION` | **no extension.** Access runs out at `paid_until`; dunning emails |
| `SUSPENDED` / `CANCELED` | paid-through: access to `paid_until`, no extension |
| `EXPIRED` | ended |

Only `subscription.recurrence` / `.activated` with a confirmed payment moves
`paid_until` forward. Everything else adjusts intent, never grants.

**No grace period** (Karina, 2026-08-27). Access exists exactly as far as payment
reaches. A failed renewal does not extend anything: PagBank keeps retrying at 3/5/7
days in the background, and if one succeeds, access is restored and `paid_until`
jumps to the new period. Retries are *billing recovery*, never *access tolerance*.

The trade she accepted knowingly: a student whose card fails for a bank-side reason
is locked out for up to a week while still intending to pay. That is support load and
some churn, priced in deliberately — which is why §4.1 is Phase 1 and not later.

No `grace_until` column. No `GRACE_DAYS` constant.

### 4.1 Card self-update — Phase 1, not later

A subscriber whose card is declined must be able to fix it themselves. Nobody should
have to email support to replace an expired card.

- Endpoint: `PUT /customers/{customer_id}/billing_info` — card only. Note it sits on
  the **customer**, not the subscription: updating the card updates it for every
  subscription that customer holds.
- Needs client-side encryption with the recurring public key, so it **cannot be built
  before PagBank releases the account.** This is what moves the release request onto
  the Phase 1 critical path rather than Phase 3's.
- Dunning email → a page that takes a new card → PagBank retries (or
  `POST` a manual retry, max 1/day/subscription).
- On the next confirmed payment, access restores automatically. Restoration is the
  same code path as any renewal: a confirmed payment moves `paid_until` forward. There
  is no separate "reactivate" branch to get wrong.

Daily reconcile cron polls `GET /subscriptions/{id}` for drift and repairs — same
pattern as the existing `reconcile-pix` cron.

### Pix path

No recurrence. Reuse the existing Orders API path (`createPixOrder`) as a one-off
that pushes `paid_until` by +30 days (monthly) or +12 months (annual). No
cancellation concept. Renewal reminders at D-5 / D-2 / D-0 / D+3 via the existing
drip infrastructure — route on a ClinAct-specific funnel field, **never** on
`leads.source` (see the drip-ownership invariant).

Card annual: PagBank yearly plan, **auto-renewing yearly until cancelled**, exactly
as monthly auto-renews monthly, with a reminder 7 days before each renewal. Cancel in
June on a plan paid in January and access runs the full twelve months — only the next
renewal stops. Pix never auto-renews in either term (Karina, 2026-08-28).

### Commercial rules (confirmed 2026-08-27)

- **R$ 29,90/mês · R$ 299/ano.** Annual ≈ ten months paid for twelve.
- **No free trial and no free cases inside ClinAct.** Access begins at purchase. The
  sales page carries demos and screenshots instead — which makes it load-bearing for
  conversion in a way it would not have been with a trial.
- **Cancellation keeps paid-through access.** Cancel on the 10th with a period ending
  the 25th → access until the 25th, no renewal after. Same rule as `SUSPENDED`, so no
  extra branch: cancelling sets intent, never revokes a paid period.
- **7-day guarantee** on the initial purchase; see §6 for how it gates NFS-e.

## 5. Minha Evolução — simple version ships at launch

The full Perfil de Raciocínio Clínico stays Phase 2. A plain progress screen ships in
Phase 1 (Karina, 2026-08-27): treinos concluídos, desempenho geral, per-format counts
and accuracy, a confidence tally, and **erros com alta confiança**.

Cheap, because nothing new is stored: every number is an aggregate over
`clinact_step_events` joined to `clinact_attempts` and `clinact_cases.format`, all of
which are written from case 1 regardless. Build it as live queries, not a stats table,
until volume argues otherwise. Estimated cost: about a day.

`erros com alta confiança` is one predicate — `is_correct = false AND confidence =
'alta'` — and is the single most diagnostically interesting number the product has.
It is available from the first case whether or not anything renders it.

---

---

## 6. NFS-e — WebISS → Emissor Nacional

**Deadline: 2026-11-01.** Resolução CGSN nº 191/2026 (2026-08-04) revoked
189/2026 (which said 2026-09-01). ME/EPP under Simples Nacional issuing NFS-e must
use the Emissor Nacional, "seja pela aplicação web, seja por integração via API".
2026-11-01 → 2026-12-31 is emitter-change only; CBS/IBS rules from 2027-01-01.

**This is a Revalida obligation, not a ClinAct one** — it applies to the CNPJ and to
sales happening today. Run it as a parallel track with its own date.

Current state: `orders.nfse_*` columns (status/number/verificacao/issued_at/by/notes),
backlog rule = paid + 7-day guarantee, `/admin/notas-fiscais` copy-paste helper
pointed at `feiradesantanaba.webiss.com.br`, service code hardcoded `0802`.
Issuance stays **manual** (Karina's decision).

Migration checklist:

- [ ] `orders.nfse_provider` (`webiss` | `nacional`) — so history is never
      misreported. Same pattern as `leads.previous_target_cohort`.
- [ ] New columns: `nfse_chave_acesso` (50 digits), `nfse_dps_numero`, `nfse_serie`.
      Keep `nfse_number` / `nfse_verificacao` for historical WebISS rows.
- [ ] `/admin/notas-fiscais`: portal link + copy-block switch on the **competência**
      of the order, not on today's date. Services through 2026-10-31 stay WebISS;
      2026-11-01 onward go to the Emissor Nacional. Both lists visible during the
      overlap.
- [ ] Replace the hardcoded `0802` with the national tributação code — **blocked on
      the accountant.** Also confirm whether Feira de Santana is on SEFIN Nacional
      or a convênio.
- [ ] `nfse_eligible_at` per order instead of the hardcoded 7-day guarantee. The rule
      (Karina, 2026-08-27): **initial purchase** → eligible at payment + 7 days, if no
      refund was requested; **renewals** → no guarantee window, eligible on
      confirmation. The platform's job is computing *when a sale becomes issuable*,
      not issuing it. Surface the state in the pending list so it is obvious at a
      glance which charges have cleared the guarantee.
- [ ] CSV export per competência (buyer, CPF, address, amount, date, product), with
      pending rows flagged — Karina's point 5.

Automation is deferred by volume, not scheduled — and the threshold is deliberately
**not** hardcoded (Karina, 2026-08-27): watch the manual operation and decide when it
stops being efficient. Monthly
subscriptions issue one nota per charge, so 100 subscribers means 100 notas/month on
top of Revalida — the load grows linearly with the thing we are trying to grow. The Emissor Nacional has its own API (ICP-Brasil e-CNPJ A1/A3 cert,
mutual TLS), so doing the November cut-over *to it* means automation later is
plugging in an API at the same place — not a second migration.

---

## 7. Build order

1. Schema (including `clinact_case_versions`) + engine + panel + bulk importer +
   authoring guide + **Decisão em 30 Segundos** end-to-end.
   **Gate:** Karina registers a case from scratch → previews → publishes, *and*
   imports a multi-case file, both unaided, and reports friction.
2. Remaining three formats: **Código Clínico**, **Ponto de Virada**, then **Clínica em
   Cena** (branching + prontuário) last.
3. Subscription module, access control, Pix one-off, retries, **card self-update**,
   **Minha Evolução**, dunning emails, ClinAct sales page.
4. Import the 40 launch cases; live review per format.

**Parallel track:** NFS-e Nacional cut-over, hard date 2026-11-01.

**Off the critical path but gating step 3:** the PagBank account release. It has two
approval gates with third-party latency, and card self-update cannot be built without
it. File it early — the URL is now settled (`medhelpspace.com.br/clinact`), which was
the only thing it was waiting on.

---

## 8. Open — blocking on Karina / third parties

| Item | Needed from | State |
|---|---|---|
| Bundle / existing-student pricing | Karina | **still open** — needed for the sales page |
| Confirm the `quality` weights (frozen before case 1 publishes) | Karina | **open** |
| Clinical audio files — who records them, and when | Karina | **open** — cases can reference sounds that do not exist yet |
| PJ account released for the recurring API + homologação | PagBank | **open** — file now; URL settled |
| Karina's pilot case passes the importer | Karina | **open** — gates the other 39 |
| Templates for the other three formats | Me → Karina | **open** — held until the pilot passes |
| Annual price · free trial · guarantee scope · confidence levels | Karina | closed 2026-08-27 |
| National tributação code | Accountant | closed — `080201` national, `0802` stays municipal |
| Feira de Santana's national status | Accountant | adhered to ADN, still routes via WebISS; **confirm the CNPJ's habilitação before switching** |
| Authoring guide + four templates | Me → Karina | shipped `126597b`; guide + 30s model sent |

---

## Sources

- PagBank Pagamentos Recorrentes — <https://developer.pagbank.com.br/docs/pagamentos-recorrentes>
- Assinaturas (statuses) — <https://developer.pagbank.com.br/docs/assinaturas>
- Retentativas — <https://developer.pagbank.com.br/docs/retentativas-assinaturas>
- Webhooks de assinaturas — <https://developer.pagbank.com.br/reference/webhooks-assinaturas>
- Autenticação (base URLs) — <https://developer.pagbank.com.br/docs/autenticacao-pagamentos-recorrentes>
- Receita Federal, Resolução CGSN 191/2026 — <https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026>
- Manual dos Contribuintes, Emissor Nacional API — <https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica>
