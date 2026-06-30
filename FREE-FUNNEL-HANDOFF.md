# Free-Magnet Funnel — Handoff

**Status: SHIPPED & LIVE (2026-06-30).** Live at
**https://www.medhelpspace.com.br/simulado-honesto** (apex 308-redirects to `www`).
Commits on `main`: `0f3fc35` (funnel) + `caa1885` (lint fix), deployed via Vercel.

This is the paid-ads launch funnel: a free "Simulado Honesto" lead magnet → email
capture → cohort-segmented email drip that sells the cohort. Strategy/rationale:
`.marketing/run-20260629/04-final-report.md`. Architecture/spec: `FREE-FUNNEL-BUILD-SPEC.md`.

---

## 1. The flow

```
Google Ads ──► /simulado-honesto  (PUBLIC, indexable, OUTSIDE the /app gate)
   1. 5 free questions (server-rendered → SEO + instant)
   2. email gate  ──► captureLeadAndUnlock()  → insert leads row + AWAIT D0 email
   3. 10 gated questions revealed
   4. "Para qual prova?" (2026.2 / 2027.1)  ──► finalizeLeadResult(cohort)
   5. results: score + honest diagnostic + LOCKED personalized study-plan preview
      (reuses derivePlan) + "custo de reprovar" receipt + tailored offer
   6. CTA ──► /checkout?cohort=…&cupom=…&email=…  (email + coupon prefilled)

Daily cron /api/cron/lead-drip ──► advances each lead through D1…D7/final
On purchase: finalize.ts flips the lead to `converted` → drops out of the drip
```

Nobody is expected to buy R$3.990 on the first visit — the **drip does the selling**
over the following days; the results page just plants the offer at peak engagement.

---

## 2. File map

| Concern | File |
|---|---|
| Public landing page (server) | `app/src/app/simulado-honesto/page.tsx` |
| Quiz + gate + cohort + results (client) | `app/src/components/magnet/magnet-quiz.tsx` |
| The 15 question IDs (**edit to swap questions**) | `app/src/lib/magnet/questions.ts` |
| Capture + finalize server actions | `app/src/actions/magnet.ts` |
| Plan-preview (derivePlan wrapper) + exam dates | `app/src/lib/magnet/plan-preview.ts` |
| URL builders (checkout link, unsubscribe) | `app/src/lib/magnet/links.ts` |
| Drip cron | `app/src/app/api/cron/lead-drip/route.ts` |
| Unsubscribe route | `app/src/app/api/leads/unsubscribe/route.ts` |
| 6 drip email templates (code defaults) | `app/src/lib/email-render.ts` (kinds `lead-d0`…`lead-final`) |
| Buyer drip-exit (Guarantee A) | `app/src/lib/pagbank/finalize.ts` |
| Checkout email/coupon prefill | `app/src/app/checkout/{page,checkout-client}.tsx` |
| Cron schedule | `app/vercel.json` |
| DB migrations / seeds | `schema-patch-leads.sql`, `schema-patch-leads-target-cohort.sql`, `seed-magnet-coupons.sql`, `seed-magnet-email-templates.sql` |

---

## 3. Database (applied to PROD + LOCAL)

- **`leads`** — anonymous captures. Deny-all RLS; written only by the capture action +
  drip cron via service role. Cols: `email`, UTM, `score`, `weak_specialty_ids`, `result`,
  `target_cohort`, `drip_step`, `drip_status` (active/converted/unsubscribed/bounced),
  `unsubscribe_token`. NOT `auth.users` — a lead becomes a member only via `/checkout`.
- **`coupons`** — two new rows (see §4), cohort-scoped.
- **`email_templates`** — 6 `lead-*` rows so the drip emails show/editable in
  `/admin/email-templates` (preview + test-send).

All four SQL files are idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`) and safe to
re-run. To re-apply: `node scripts/run-sql.js <file>` (uses the prod pooler `DATABASE_URL`
in `app/.env.local`); for LOCAL prefix `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55322/postgres'`.

---

## 4. Pricing ladder & discount safety

| Surface | Price | Coupon | Window |
|---|---|---|---|
| Public (landing, /loja, Google) | **R$3.990** | — | always (anchor) |
| Post-quiz offer (captured leads) | **R$3.290** | `RETA2026` (R$700 off) | now → **Aug 30 2026** |
| Final-stretch email (PRIVATE) | **R$2.990** | `ULTIMA2026` (R$1.000 off) | **Aug 16 → Aug 30 2026** |

- **2027.1 is full price (R$4.990), no coupon, ever.** The offer + drip branch on the lead's
  chosen cohort; 2027.1 leads get full-price CTAs and **skip the final discount email**.
- Both coupons are **scoped to `revalida-2026-2`**, so `redeem_coupon()`/`preview_coupon()`
  raise `COUPON_NOT_VALID_FOR_COHORT` on any other cohort (verified). The DB physically
  refuses to discount 2027.1. **(Guarantee B.)**
- `ULTIMA2026` is **email-only** — never rendered on a public surface; only delivered in the
  final drip email.
- **Guarantee A:** a purchase flips the lead to `converted` in `finalize.ts`, AND the cron
  excludes any email matching a paid order/member — so an early R$3.290 buyer never receives
  the later R$2.990 email. (Built; **not yet exercised by a real purchase — see §8.**)
- When the 2026.2 sale closes (set `cohorts.sale_ends_at` ≈ Aug 30), surviving leads roll
  into a **full-price 2027.1 nurture (Phase 2 — not built).**

---

## 5. The email drip

| Step | When | Coupon (2026.2) | Coupon (2027.1) |
|---|---|---|---|
| `lead-d0` (delivery) | at capture, inline | — (links to magnet) | — |
| `lead-d1` (diagnostic) | +1 day | RETA2026 | none (full price) |
| `lead-d2` (cost of reprovar) | +2 days | RETA2026 | none |
| `lead-d4` (your plan) | +4 days | RETA2026 | none |
| `lead-d7` (anti-claim close) | +7 days | RETA2026 | none |
| `lead-final` (última chance) | +11 days | **ULTIMA2026** | **skipped** |

- **Cron:** `/api/cron/lead-drip`, daily **12:30 UTC (09:30 BRT)**, auth `Bearer CRON_SECRET`.
  Advances each lead by at most one step/run; per-step `offsetDays` enforces spacing. Stops on
  converted/unsubscribed. Dates in D1/D4 are parameterized (`{{examLabel}}`) per cohort.
- **Edit the copy:** `/admin/email-templates` (DB rows are the source; `email-render.ts` is the
  code fallback — keep them in sync if you edit code, or just edit in the admin UI).
- **Dependencies:** sending needs `RESEND_API_KEY` (prod — verified) + a verified Resend domain.
  Without it, sends are silent no-ops (capture still works). Unsubscribe: one-click via
  `/api/leads/unsubscribe?t=<token>`.

---

## 6. Attribution (Pix breaks the pixel)

- **Coupon = tracker.** Sales redeeming `RETA2026`/`ULTIMA2026` are 2026.2-magnet sales
  (`orders.coupon_id`). 2027.1 sales have no coupon → match by UTM + lead email.
- **Lead ↔ order match:** checkout prefills the lead's email, so `finalize.ts` matches
  `order.email` → `leads.email` (sets `converted_at`). Read magnet→sale in the DB by that join.
- **UTMs** flow ad → lead row → checkout. Organic visitors have no UTM (tag as `organic`).
- Honest read: with ~1–6 expected sales you can't statistically separate channels — measure
  **leads captured AND sales**, not a clean ROAS dashboard.

---

## 7. Point ads here

- **URL:** `https://www.medhelpspace.com.br/simulado-honesto` (use `www` — the apex
  308-redirects, and the hop can ding Quality Score).
- Keyword list / match types / negatives / RSA copy: `.marketing/run-20260629/04-final-report.md`
  (Option 1/2). Spend ~85–100% on Google Search long-tail; Meta only as a retargeting tail.

---

## 8. Remaining before / around launch

1. **Karina curates the 15 questions** — currently a SEED spread (10 specialties). Edit
   `MAGNET_FREE_IDS` (5) + `MAGNET_GATED_IDS` (10) in `app/src/lib/magnet/questions.ts`, redeploy.
   The funnel works now; the questions are just placeholder-quality.
2. **Smoke-test Guarantee A** — make one real purchase (or a 100%-off test coupon) and confirm
   the buyer's lead row flips `drip_status='converted'`. The only path not yet exercised live.
3. **Set `cohorts.sale_ends_at` ≈ 2026-08-30** for 2026.2 so the sale auto-closes 2 weeks pre-exam.
4. **(Optional) Phase-2 2027.1 nurture** — after the 2026.2 exam, a full-price sequence for the
   surviving 2027.1 leads. Not built.
5. **(Optional) Real flashcard deck asset** — D0 currently links `deckUrl` back to the magnet
   page; swap for a real downloadable deck when ready.

---

## 9. Quick reference

- **Env/secrets:** `RESEND_API_KEY`, `CRON_SECRET`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`
  (prod pooler, for `run-sql.js`). Local stack: `npx supabase start`; DB on `:55322`,
  Studio `:55323`; app→local via `app/.env.development.local`.
- **Verify a coupon scope:** `SELECT * FROM preview_coupon('RETA2026','revalida-2027-1',499000);`
  should raise `COUPON_NOT_VALID_FOR_COHORT`.
- **See the leads:** `SELECT email, score, target_cohort, drip_step, drip_status FROM leads;`
- **Related docs:** `FREE-FUNNEL-BUILD-SPEC.md` (full spec + §6.5 safety), `.marketing/run-20260629/`
  (research + plan).
