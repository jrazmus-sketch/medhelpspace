# eNotas NFS-e Integration — Setup + Implementation Plan

> ⛔ **SUPERSEDED 2026-06-27 — eNotas being cancelled.** The eNotas REST API is gated
> to the **Plus plan (R$247/mo)**; the purchased **Básico** plan does NOT include API
> access (the visible key returns 401/AUT002 on every call — confirmed even in eNotas'
> own "Try It" console). Not worth R$247/mo at ~10-20 notas/month. **Decision: cancel
> eNotas** (refund within 30-day guarantee) and **issue NFS-e manually** on the WebISS
> Feira de Santana portal, assisted by the new **`/admin/notas-fiscais`** report
> (copy-paste-ready tomador + serviço fields, 7-day-guarantee gating, "marcar como
> emitida" tracking via `schema-patch-nfse-issuance.sql`). The fiscal config is proven
> (test nota authorized: código 0802, ISS 5%, Simples=Sim, RET 06). **For later** (≈50+
> notas/mo): cheaper API providers that support WebISS Feira de Santana — **Webmania
> ~R$69,90/mo**, **Focus NFe R$89,90/mo** (both ≪ eNotas Plus); A1 cert + config carry
> over. The Track B API design below is kept only as a reference for that future build.

**Status (historical):** Account purchased 2026-06-27. Digital certificate (A1 e-CNPJ
.pfx) acquired. API blocked by plan tier — see banner above.

**Decision basis:** NFS-e provider = **eNotas** (now part of Omie), locked 2026-06-04.
MedHelpSpace sells access to an online study platform — a *service* — so the document
is **NFS-e** (municipal), issued by **MEDHELPSPACE LTDA, Feira de Santana/BA**. Do NOT
hand-roll per-município integration.

Two tracks below run in order: **Track A** (fiscal/account setup — non-engineering,
do with the accountant once the account is active) gates **Track B** (the code build).
You cannot finish Track B until Track A produces a working sandbox test note.

---

## Track A — Account & fiscal configuration (today / with accountant)

Source: https://enotas.com.br/guiaconfiguracoes/ — the official setup guide.
None of this is engineering; it's data entry + accountant confirmation. **Track B
is blocked until step A7 (a real R$1,00 test note) succeeds.**

### A1. Create the eNotas account
- Complete the **Pessoa Jurídica** registration for MEDHELPSPACE LTDA (CNPJ).

### A2. National Portal registration (Portal Nacional NFS-e)
- Confirm with the accountant whether Feira de Santana/BA uses the **Portal Nacional
  de Gestão NFS-e**. (Many BA municípios have migrated to it.)
- If yes: register the CNPJ on the National Portal first (it asks for an IRPF receipt
  number or título de eleitor), create credentials, verify by email code, and set the
  retenção/destaque-de-impostos fields per the accountant.

### A3. Fill "Dados Municipais" in eNotas
In eNotas → **Empresa → Configurar Conta / Alterar Cadastro → aba Dados Municipais**,
enter (all from the accountant — see the input checklist below):
- **Inscrição Municipal**
- **Porte da empresa** + **Regime tributário** (and Simples Nacional Y/N)
- **Código de serviço municipal** + **alíquota de ISS**
- **Item da Lista de Serviços (LC 116/03)** — education is **item 8.x**
- **CNAE**
- **Percentual aproximado de tributos** (municipal + federal), for the IBPT line
- Authentication method the município requires

### A4. Upload the A1 digital certificate
- **Empresa → Configurar Conta → Certificado Digital A1** → upload the `.pfx` e-CNPJ
  and enter its password. (We already have this cert.)

### A5. Generate the API key
- In the eNotas dashboard, find the **API key** (Configurações / Integração / API).
  This is the secret Track B authenticates with. **Do not commit it** — it goes in
  `app/.env.local` and Vercel env (see B6).

### A6. Configure the webhook callback URL
- Point eNotas' status callback to our endpoint (built in B4):
  `https://medhelpspace.com.br/api/enotas/webhook`
- Note any signing secret / token eNotas provides for the callback so we can verify it.

### A7. Issue a R$1,00 test note (homologação)
- Issue one **R$1,00 test NFS-e** per configured type from the dashboard.
- Send the resulting **PDF + XML** to the eNotas onboarding agent for validation.
- ✅ **This is the gate.** Once a test note authorizes cleanly, Track B can go live
  against the sandbox/homologação ambiente, then flip to produção.

### Fiscal input checklist (collect from accountant before A3)
| Field | Value | Owner |
|---|---|---|
| Inscrição Municipal | _____ | accountant |
| Regime tributário (+ Simples?) | _____ | accountant |
| Código de serviço municipal | _____ | accountant |
| Alíquota ISS (%) | _____ | accountant |
| Item LC 116/03 (8.x — educação) | _____ | accountant |
| CNAE | _____ | accountant |
| % aproximado de tributos (IBPT) | _____ | accountant |
| Texto padrão "Descrição do serviço" | _____ | Justin + accountant |
| Retém ISS? (ISS retido na fonte) | _____ | accountant |

---

## Track B — Engineering implementation

Mirrors the existing PagBank provider structure exactly:
`app/src/lib/pagbank/` → new `app/src/lib/enotas/`; webhook under
`app/src/app/api/enotas/`; admin surface inside the existing
`app/src/app/admin/billing/`.

> **API note (verify against live docs during build):** eNotas Gateway **NFS-e v1**
> is REST/JSON. Auth = **HTTP Basic** with the API key as the *username* and an **empty
> password** → `Authorization: Basic base64(API_KEY + ":")`. Base host is
> `https://api.enotasgw.com.br/v1`. The docs host (`developer.enotasgw.com.br`) was
> unreachable when this plan was written, so confirm exact endpoint paths/field names
> in the dashboard's API reference before coding. Expected shape:
> - `PUT /empresas` — create/update the empresa (one-time; can also be done in dashboard)
> - `GET /empresas/{empresaId}` — read empresa config
> - `POST /empresas/{empresaId}/nfes` — **issue** (async; returns an nfeId)
> - `GET /empresas/{empresaId}/nfes/{nfeId}` — poll status
> - `GET .../nfes/{nfeId}/pdf` and `.../xml` — fetch documents
> - `DELETE /empresas/{empresaId}/nfes/{nfeId}` — **cancel** (needs justificativa)
> - Webhook: eNotas POSTs status changes to the URL set in A6.
> Issue body carries: `idExterno` (our order id, for idempotency), `ambienteEmissao`
> (`Homologacao` | `Producao`), `cliente` (nome, email, cpfCnpj, endereço), `servico`
> (descrição, aliquotaIss, itemListaServicoLC116, cnae, codigoServicoMunicipio),
> `valorTotal`.

### B1. Schema patch — `schema-patch-nfse-issuance.sql`
Use `/schema-patch`. Add to `orders` (idempotent guards + rollback notes):
- `nfse_status TEXT` — `null | 'pending' | 'authorized' | 'failed' | 'cancelled'`
- `nfse_enotas_id TEXT` — eNotas nfeId (the resource we poll/cancel)
- `nfse_number TEXT` — município's authorized número/código de verificação
- `nfse_pdf_url TEXT`, `nfse_xml_url TEXT`
- `nfse_error TEXT` — última mensagem de rejeição (admin-facing)
- `nfse_issued_at TIMESTAMPTZ`, `nfse_cancelled_at TIMESTAMPTZ`
- UNIQUE index on `nfse_enotas_id` (idempotency / webhook lookup)

The **tomador** data already exists on the order — no new capture needed
(`orders.billing_first_name/last_name/cpf/cep/address/number/neighborhood/city/state/phone`,
added in `schema-patch-billing-details.sql`). The issuer maps those → eNotas `cliente`.

RLS: `nfse_*` columns are read-only to members via existing order policies; writes are
service-role only (issuer + webhook). No new table needed.

### B2. eNotas client lib — `app/src/lib/enotas/`
- `types.ts` — request/response + webhook payload types (mirror `pagbank/types.ts`).
- `client.ts` — thin fetch wrapper: `issueNfse(order)`, `getNfse(nfeId)`,
  `cancelNfse(nfeId, justificativa)`, `getNfsePdfUrl(nfeId)`. Basic-auth header from
  `ENOTAS_API_KEY`. Reads `ENOTAS_ENVIRONMENT` (`homologacao` | `producao`) to set
  `ambienteEmissao` and pick the empresa id. Map `orders.billing_*` → `cliente`;
  pull `servico` constants (item LC116, CNAE, alíquota, descrição) from env/config so
  the accountant's values aren't hardcoded in component code.

### B3. Deferred issuance — schedule at payment, issue after the guarantee (LOCKED: Option B)
**Decided 2026-06-27.** We do NOT issue the nota at the moment of payment — we issue
it only after the **7-day guarantee window** closes, so a buyer who refunds inside
the guarantee never receives a nota (zero emit-then-cancel churn).

**B3a — schedule, in `finalizePaidOrder` (`app/src/lib/pagbank/finalize.ts`):**
- In the **single race-safe paid transition** (the `UPDATE ... WHERE status != 'paid'`
  winner-only branch, after membership grant + purchase email), set
  `nfse_status='scheduled'` and `nfse_eligible_at = now() + 7 days` on the order.
- This is a cheap DB write — **no eNotas HTTP call here**, so nothing for Vercel to
  freeze and nothing that can block the membership grant. Best-effort: a failed write
  just leaves `nfse_status` null (the reconcile/admin path can backfill).

**B3b — issue, in a daily cron (`app/src/app/api/cron/issue-nfse/route.ts`):**
- Select orders WHERE `nfse_status='scheduled'` AND `nfse_eligible_at <= now()` AND
  `status='paid'` (the index `idx_orders_nfse_due` serves this).
- For each: set `nfse_status='pending'`, call `issueNfse` (**awaited**), store the
  returned `nfse_enotas_id`. On throw → `nfse_status='failed'` + `nfse_error` + admin
  alert (`recordAdminAlert`), never blocking the others.
- Guarded by `CRON_SECRET` like the other cron routes. eNotas issuance is async →
  final authorized/failed status arrives via the webhook (B4).
- ⚠️ **Competência caveat:** day-8 issuance can push a late-in-month sale into the next
  tax period. Confirm with an accountant whether Feira de Santana's NFS-e deadline /
  ISS apuração cares about the month boundary; adjust the offset if so.

### B4. Webhook handler — `app/src/app/api/enotas/webhook/route.ts`
- Mirror `app/src/app/api/pagbank/webhook/route.ts`. Verify the eNotas signature/token
  from A6 (**fail-closed** — reject unsigned/invalid, like the PagBank webhook).
- Look up the order by `nfse_enotas_id` (or `idExterno` = order id). On
  authorized → store `nfse_number`, `nfse_pdf_url`, `nfse_xml_url`,
  `nfse_status='authorized'`, `nfse_issued_at`. On failed/rejeitada → `nfse_status='failed'`
  + `nfse_error` + admin alert. Idempotent (eNotas may retry).
- Optionally email the buyer their nota (PDF link) on authorize — reuse the email
  template system (`email_templates`) so it's editable; gate on a new `email_log` kind
  to avoid duplicates.

### B5. Cancel-on-refund — in `app/src/app/api/admin/billing/refund/route.ts`
- The 7-day guarantee means a refund must **cancel the NFS-e**. After the PagBank
  `/cancel` succeeds and `orders.status='refunded'`, if `nfse_status='authorized'` call
  `cancelNfse(nfse_enotas_id, justificativa)` with a standard justificativa
  ("Estorno - cancelamento da compra dentro da garantia de 7 dias"). Best-effort +
  audit-logged; a cancel failure shouldn't fail the refund (money already moved), but
  must raise an admin alert for manual cancellation in the eNotas dashboard.

### B6. Env vars (`app/.env.local` + `.env.local.example` + Vercel)
```
ENOTAS_API_KEY=<from A5 — never commit>
ENOTAS_EMPRESA_ID=<empresa GUID from eNotas>
ENOTAS_ENVIRONMENT=homologacao        # flip to 'producao' after A7 passes
ENOTAS_WEBHOOK_SECRET=<from A6, if provided>
# Serviço constants from the accountant (A3):
ENOTAS_SERVICO_ITEM_LC116=...
ENOTAS_SERVICO_CNAE=...
ENOTAS_SERVICO_ALIQUOTA_ISS=...
ENOTAS_SERVICO_DESCRICAO=...
```
Add placeholders to `.env.local.example`; real values to Vercel project env.

### B7. Admin UI — extend `app/src/app/admin/billing/`
- Add an **NFS-e column/badge** per order (status: pendente / autorizada / falhou /
  cancelada) with links to PDF/XML when authorized.
- A **"Reemitir nota"** action for `failed` orders (billing_admin/super_admin only)
  that re-calls `issueNfse`. Surface `nfse_error` so the operator sees *why* it failed.
- A **retroactive issuance** action for orders paid *before* this integration shipped
  (decide scope — see open decisions).
- All admin strings via i18n (pt-BR + en) — admin panel is bilingual; never hardcode.

### B8. Test & cutover sequence
1. Build B1–B7 with `ENOTAS_ENVIRONMENT=homologacao`.
2. Run a sandbox PagBank purchase end-to-end → confirm `nfse_status` goes
   `pending → authorized` via webhook, PDF/XML stored.
3. Run a sandbox refund → confirm the nota cancels.
4. Validate the homologação PDF/XML with the eNotas onboarding agent.
5. Flip `ENOTAS_ENVIRONMENT=producao`, redeploy, do one real low-value live purchase,
   verify the authorized nota, then enable for all.
6. `/mobile-check` the admin billing changes; `/pre-launch-audit` before flipping to prod.

---

## Decisions
1. ✅ **LOCKED (2026-06-27): Issuance timing = Option B (deferred).** Issue the nota
   *after* the 7-day guarantee window (schedule at payment, cron issues on day 8), with
   cancel-on-refund (B5) as a safety net. Reason: a guarantee refund then never produces
   a nota to cancel. Build ships first with `ENOTAS_ENVIRONMENT=homologacao`; flip to
   produção only after a validated live nota. See B3.

### Still to confirm before/while building (recommendations in **bold**)
2. **Retroactive notes** for orders already paid before go-live: issue for all historical
   paid orders, only since a cutoff date, or none? → **Recommend: none automatically;
   provide the admin "emitir nota" button (B7) so the accountant issues retroactively
   case-by-case.** Confirm with accountant re: competência/date rules.
3. **Email the nota PDF to the buyer** on authorize, or just store it for admin/accountant?
   → **Recommend: email it** (editable template), it's expected by BR buyers.
4. **CPF-only tomador**: all buyers are pessoa física (CPF). Confirm we never need to
   issue to a CNPJ tomador (would need a `cpfCnpj` branch + no address-required edge cases).

## Blocking dependencies
- ✅ **A7 CLEARED (2026-06-27):** test note authorized end-to-end (NFS-e nº
  2026000000001, WebISS Feira de Santana). Account live, A1 cert + fiscal config
  validated. Track B is unblocked. (Fix found during the test: company config had
  `Optante pelo Simples Nacional = Não` while RET = "ME EPP – Simples Nacional" — set
  Optante = Sim. Reforma-tributária fields NBS/CST/IBS-CBS were left blank and the
  note still authorized, so WebISS doesn't require them yet.)
- ⛔ A3 needs the **accountant's fiscal inputs** (table above).
- Related: `project_cnpj_followup` (the real CNPJ must be filled into email footers —
  same compliance surface).
