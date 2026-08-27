# ClinAct — Build Spec

Companion to the design proposal sent to Karina (2026-08-21). That document is the
*what and why* for her approval; this one is the buildable detail. Nothing here is
implemented yet — no code, no schema patch. Scope is frozen only after Karina
validates the panel + case schema (her point 15).

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
  access_until timestamptz NOT NULL,   -- THE authority; see invariant below
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product)
);
```

`user_has_product_access(p text)` — SECURITY DEFINER, same shape as the existing
`user_has_active_membership()`:

- `p = 'revalida'` → existing cohort check **OR** a live `user_product_access` row
  (so a bundle can grant Revalida without inventing a fake cohort).
- `p = 'clinact'` → `access_until > now()`.

App-side gate mirrors `lib/membership-gate.ts`: `requireProductAccess('clinact')`,
admin roles bypass, no access → `/clinact` (the sales page), not `/loja`.

**Do not** reuse `content_module_id` gating for ClinAct — that is cohort-date logic
and would couple the two products' unlock rules.

### Invariant (binding)

> Access is a **timestamp that only moves forward on a confirmed payment**, never a
> boolean flipped by a webhook.

Lost webhook cannot revoke; duplicate webhook cannot double-grant; PagBank downtime
cannot lock members out. Same defense-in-depth posture as `finalize.ts`.

---

## 2. Case engine schema

Six tables, prefix `clinact_`. `specialty_id` → existing `specialties`;
`topic_id` → existing `topics` (reuses the incidence weighting already built).

| Table | Key columns |
|---|---|
| `clinact_cases` | `slug` UNIQUE, `format`, `title`, `specialty_id`, `topic_id`, `difficulty`, `primary_skill`, `est_minutes`, `summary`, `takeaway`, `status`, `revision`, `published_at`, `created_by` |
| `clinact_steps` | `case_id`, `position`, `kind`, `enabled`, `scene_key`, `skill`, `content jsonb` |
| `clinact_options` | `step_id`, `position`, `label`, `is_correct`, `feedback`, `seduction`, `effect jsonb`, `next_scene_key` |
| `clinact_clues` | `case_id`, `position`, `label`, `detail`, `category`, `is_red_herring`, `cluster` |
| `clinact_attempts` | `user_id`, `case_id`, `case_revision`, `started_at`, `finished_at`, `score`, `duration_ms`, `state jsonb` |
| `clinact_step_events` | `attempt_id`, `step_id`, `option_id`, `skill`, `is_correct`, `confidence`, `time_ms`, `answered_at` |

Enums (as CHECK constraints, matching project convention):

- `format` ∈ `codigo_clinico | clinica_em_cena | decisao_30s | ponto_de_virada`
- `skill` ∈ `conectar | conduzir | priorizar | reavaliar`
- `status` ∈ `draft | published | archived`
- `confidence` ∈ `baixa | media | alta` — **fixed three levels, decided before case 1.**
  Variable scales destroy cross-cohort comparability.

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
which block is default/optional/absent per format is in the proposal document.

### Convergent branching (Clínica em Cena)

- Steps group by `scene_key`. `clinact_options.next_scene_key` is **NULL by default**
  → falls through to the next scene in `position` order. Convergence is the default;
  divergence is opt-in.
- `effect jsonb` = `{ revela: [{cat, texto}], estado: {...}, relogio: n }`.
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
   `assinaturas.pagseguro.uol.com.br` (sandbox:
   `sandbox.assinaturas.pagseguro.uol.com.br`) with its own token and its own public
   key — not a parameter on `api.pagseguro.com`. New env vars, new module, new
   webhook route. Note the existing footgun: the Connect public key in `.env.local`
   is unrelated to this one.
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
| `TRIAL` / `ACTIVE` | `access_until = period_end` |
| `OVERDUE` / `PENDING_ACTION` | keep access through a grace window (`period_end + GRACE_DAYS`); dunning emails |
| `SUSPENDED` / `CANCELED` | paid-through: access to `period_end`, no extension |
| `EXPIRED` | ended |

Only `subscription.recurrence` / `.activated` with a confirmed payment moves
`access_until` forward. Everything else adjusts intent, never grants.

Daily reconcile cron polls `GET /subscriptions/{id}` for drift and repairs — same
pattern as the existing `reconcile-pix` cron.

### Pix path

No recurrence. Reuse the existing Orders API path (`createPixOrder`) as a one-off
that pushes `access_until` by +30 days (monthly) or +12 months (annual). No
cancellation concept. Renewal reminders at D-5 / D-2 / D-0 / D+3 via the existing
drip infrastructure — route on a ClinAct-specific funnel field, **never** on
`leads.source` (see the drip-ownership invariant).

Card annual: PagBank yearly plan, auto-renew, with a reminder 7 days before each
renewal.

---

## 5. NFS-e — WebISS → Emissor Nacional

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
- [ ] `nfse_eligible_at` per order instead of the hardcoded 7-day guarantee: a
      subscription renewal has no guarantee window and is issuable on confirmation.
- [ ] CSV export per competência (buyer, CPF, address, amount, date, product), with
      pending rows flagged — Karina's point 5.

Automation trigger is a **volume**, not a date: **>50 notas in a month**. Monthly
subscriptions issue one nota per charge, so 100 subscribers = 100 notas/month on top
of Revalida. The Emissor Nacional has its own API (ICP-Brasil e-CNPJ A1/A3 cert,
mutual TLS), so doing the November cut-over *to it* means automation later is
plugging in an API at the same place — not a second migration.

---

## 6. Build order

1. Schema + engine + panel + bulk importer + authoring guide + **Decisão em 30
   Segundos** end-to-end. Gate: Karina registers one case in the panel *and* imports a
   3-case file, both unaided, and reports friction.
2. Remaining three formats — Clínica em Cena (branching + prontuário) last.
3. Subscription module, Pix one-off, ClinAct sales page, grace + dunning emails.
4. Import the 40 launch cases; live review per format.

**Parallel track:** NFS-e Nacional cut-over, hard date 2026-11-01.

---

## 7. Open — blocking on Karina / third parties

| Item | Needed from |
|---|---|
| Annual price (proposed R$ 299/yr vs R$ 29,90/mo) | Karina |
| Free trial vs one open case per format | Karina |
| Does the 7-day guarantee apply to monthly subscriptions | Karina |
| Bundle / existing-student pricing | Karina |
| Confirm confidence = 3 levels (irreversible after case 1) | Karina |
| Recurrence enabled on the PJ account + assinaturas token & public key | PagBank |
| National tributação code replacing 0802; Feira de Santana's national status | Accountant |
| Authoring guide + four templates + bulk importer, delivered before content production starts | Me → Karina |

---

## Sources

- PagBank Pagamentos Recorrentes — <https://developer.pagbank.com.br/docs/pagamentos-recorrentes>
- Assinaturas (statuses) — <https://developer.pagbank.com.br/docs/assinaturas>
- Retentativas — <https://developer.pagbank.com.br/docs/retentativas-assinaturas>
- Webhooks de assinaturas — <https://developer.pagbank.com.br/reference/webhooks-assinaturas>
- Autenticação (base URLs) — <https://developer.pagbank.com.br/docs/autenticacao-pagamentos-recorrentes>
- Receita Federal, Resolução CGSN 191/2026 — <https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026>
- Manual dos Contribuintes, Emissor Nacional API — <https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica>
