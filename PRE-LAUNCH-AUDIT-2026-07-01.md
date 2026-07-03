# Pre-launch audit — findings tracker

Audit run 2026-07-01 (night before public launch) across the full codebase: dev artifacts, secrets/env,
auth/RLS, payments/idempotency, error handling, email reliability, data layer, SEO, frontend safety,
build health. This doc tracks every finding to closure. Fix details: session of 2026-07-01/02.

**Status legend:** ✅ fixed (verify state below) · 🔲 open · 👤 needs Karina/Justin

---

## P0 — ship blockers

| # | Finding | Status |
|---|---|---|
| 0.1 | Working tree failed `next build` (`plan-preview.ts` missing `topics`/`topicContent` args) | ✅ resolved by study-plan sprint (committed in 90e1bfa) |

## P1 — all fixed 2026-07-02 (✅ COMMITTED a9752e9 + pushed to origin/main — see "Commit guidance")

| # | Finding | Fix | File |
|---|---|---|---|
| 1.1 | Paid order w/o membership: upsert error unchecked, ran after status flip → buyer paid, no access, no retry path | Membership granted BEFORE status flip; both writes error-checked; failure → order stays retryable + `payment_problem` admin alert | `app/src/lib/pagbank/finalize.ts` |
| 1.2 | Card checkout double-charge: no server-side idempotency | Stale-order expiry (15 min) + app-layer 409 guard + partial unique index (23505 → 409 + coupon rollback) | `app/src/app/api/pagbank/charge/route.ts` + `schema-patch-card-order-dedup.sql` (**applied prod + local dev**) |
| 1.3 | PagBank REFUNDED/CHARGEBACK on paid orders silently dropped → membership never revoked | paid→refunded transition (idempotent `WHERE status='paid'`), membership delete, `refund` admin alert; still always-200 | `app/src/app/api/pagbank/webhook/route.ts` |
| 1.4 | Guest checkout signup/login: no rate limit (account flooding, credential stuffing, email oracle) | Shared 60/min limiter + dedicated 5/min/IP guest-auth limiter, before any auth call | `app/src/app/api/pagbank/charge/route.ts` |
| 1.5 | Lifecycle cron ignored Resend's returned `error` → rejected emails logged as sent, never retried | `{error}` checked; email_log reservation rolled back on failure; per-recipient try/catch on all 8 sections | `app/src/app/api/cron/lifecycle-notifications/route.ts` |
| 1.6 | Lead-drip: failed send still advanced `drip_step` (lead skips email); no overlap protection | Atomic claim-first (`UPDATE … WHERE drip_step=current`), send, revert on failure | `app/src/app/api/cron/lead-drip/route.ts` |
| 1.7 | No error tracking — prod exceptions invisible | `onRequestError` hook: structured `[server-error]` console logs (Vercel) + deduped `admin_alerts` rows (no emails by design) | `app/src/instrumentation.ts` (new) |
| 1.8 | OG share image referenced by layout.tsx didn't exist → broken WhatsApp/social previews | 1200×630 brand card generated (sharp, real brand tokens) | `app/public/og-image.png` (new) |
| 1.9 | Landing carousel crash: unclamped scroll index on iOS overscroll | Index clamped + zero-width guard | `app/src/components/landing/memorecards-carousel.tsx` |
| 1.10 | `/admin/billing` had no role gate (any admin role saw all orders + buyer PII) | super_admin/billing_admin gate, mirrors notas-fiscais | `app/src/app/admin/billing/page.tsx` |
| 1.11 | No migration tracking / prod drift unknown | Not code-fixable → moved to manual checklist below | — |

**Verify state:** `tsc --noEmit` exit 0 and `next build` success on 2026-07-02 with all fixes present.
Rollback for the DB index: `DROP INDEX IF EXISTS idx_orders_one_pending_card_per_user_cohort;`

### Commit guidance (per check-git-before-commit rule)

The audit-fix batch = exactly these files, commit together, nothing else:

```
app/src/lib/pagbank/finalize.ts
app/src/app/api/pagbank/webhook/route.ts
app/src/app/api/pagbank/charge/route.ts
app/src/app/api/cron/lifecycle-notifications/route.ts
app/src/app/api/cron/lead-drip/route.ts
app/src/app/admin/billing/page.tsx
app/src/components/landing/memorecards-carousel.tsx
app/src/instrumentation.ts
app/public/og-image.png
schema-patch-card-order-dedup.sql
```

Do NOT sweep in: `app/src/components/landing/{comparison,founder,stats-*}` / `types/supabase.ts` /
`schema-patch-cohort-sale-price.sql` / `seed-landing-editor-connect.sql` (other in-flight sprints),
`app/build.log`, `app/src/app/dev/`, `supabase/`, `.marketing/`, `landing-shots/`.

---

## Manual pre-launch checklist (cannot be verified from code)

**Verification pass 2026-07-02** (session with Justin) — most items closed; details inline. Only genuinely
open item is the Cloudflare backup restorability check; one live test (tab-closed Pix webhook) still pending.

- [x] **`PAGBANK_WEBHOOK_ENFORCE` in Vercel prod** — variable is **unset**, which is the secure state: the code
      reads `process.env.PAGBANK_WEBHOOK_ENFORCE !== "false"`, so absent → enforcement ON. Only the literal string
      `false` disables it. ✅ Confirmed in Vercel 2026-07-02.
      ⚠️ **Open follow-up (separate from the env value):** nobody has yet confirmed a *genuine* PagBank webhook
      verifies as `"valid"` in prod (the signing format in `webhook-auth.ts` is a `dash` guess). With enforcement
      ON, a wrong format silently rejects real webhooks. Revenue is NOT at risk (card = sync finalize, tab-open Pix
      = 5s status poll, tab-closed Pix = daily `reconcile-pix` cron), but a closed-tab Pix buyer could wait up to
      ~24h. **Test:** Karina does a real Pix sale and closes the tab immediately → access in ~1 min = webhook
      verifies; stays pending = flip `FORMAT` `dash`→`concat` in `webhook-auth.ts`. Consider tightening the
      reconcile-pix cadence (Vercel Pro / external scheduler) regardless.
- [x] **Migration drift** — VERIFIED 2026-07-02 via read-only check of all **162** objects the `schema-patch-*.sql`
      files create vs prod catalogs: every object present. The one flagged index (`coupon_redemptions_user_coupon_uniq`)
      is *intentionally* dropped by `schema-patch-coupon-per-user-limit.sql` (replaced by a plain index that IS
      present), so its absence proves that patch applied. `schema-patch-topics.sql` now committed. ✅
- [ ] **Supabase automated backups / PITR** — Free tier has **no** automated backups (Pro-plan feature; PITR is a
      paid add-on), so nothing to toggle on the current plan. **Covered for launch by the existing daily Cloudflare
      backup.** OPEN: (a) confirm the Cloudflare dump is a *restorable full Postgres* backup (Justin downloading to
      verify), (b) enable Supabase native daily backups + PITR right after the post-launch Pro upgrade.
- [x] **PagBank prod env** — VERIFIED 2026-07-02: real production payments were made (appeared in PagBank) and
      refunded. Confirms `PAGBANK_ENVIRONMENT=production` + prod access token are live. ✅ (Formal ledger diff not
      run, but real settled + refunded transactions prove the env.)
- [x] **`email_settings` prod row** — VERIFIED 2026-07-02: CNPJ `61.148.283/0001-08` ✅, company/from/contact set.
      **`address` intentionally left blank** — home-based business, decided 2026-07-02; footer omits the line,
      nothing breaks. ✅
- [x] **Resend / lifecycle email** — VERIFIED 2026-07-02 via Resend logs: the `weekly-summary` lifecycle email
      ("Resumo semanal do seu plano de estudos") **delivered** to Justin + Karina — proves the daily lifecycle cron
      renders DB templates and sends through Resend. Same logs confirm admin purchase alerts, member access-granted,
      funnel magnet, and password-reset emails all delivering (all `Delivered`, no bounces). Password-reset i18n
      (English Supabase default → Portuguese "Redefinir sua senha") fixed live 2026-07-02. ✅
- [ ] **Spot-check live simulado grading** (Karina's 130 simulados) — still deferred to Karina.

## Content follow-ups 👤 Karina

- [ ] Upload 4 missing MedVoice audios (players show "Áudio em preparação" until then):
      `clinica-medica-feito/infecto-feito/toxoplasmose-m.mp3`, and in `pediatria-feito/`:
      `ivas-resfriado-sinusite-e-otitte-m.mp3`, `maus-tratos-e-prevencao-de-acidentes-na-infancia-m.mp3`,
      `neuroblastoma-m.mp3`. (6 other 404s were fixed 2026-07-02 by matching audio to transcripts.)
- [ ] 3 stale lesson TITLES don't match their own content (regenerated bodies kept old titles):
      lesson 447 titled "Farmacodermias" = Esporotricose content · 448 "Micoses" = Farmacodermias ·
      457 "Doenças das Adrenais" = Hiperparatiroidismo primário. Soft flag: 449 "Neoplasias em
      Dermatologia" = Melanoma content (plausibly fine).

---

## P2 backlog (open — none are launch blockers)

### Lead-funnel abuse surface (unauthenticated writes)
- 🔲 `app/src/actions/magnet.ts:213-235` — `finalizeLeadResult`: no honeypot/rate limit; result overwritable
      knowing only the email; unbounded `answers`/`utm_*` payload sizes.
- 🔲 `app/src/actions/magnet.ts:284-333` — `requestClaimCode` `previousEmail` merge lets a caller re-key/delete
      another lead's row without proving ownership.
- 🔲 `app/src/actions/magnet.ts:379` — `no_api_key` treated as send success → missing `RESEND_API_KEY` in prod
      silently strands funnel leads. Gate the dev shortcut on `NODE_ENV`.
- 🔲 `app/src/actions/magnet.ts:148-172` — lead insert/update errors swallowed (silent ads-attribution loss).
- 🔲 `app/src/actions/magnet.ts:441-478` — `verifyClaimCode` double-send race (read-before-update).
- 🔲 `app/src/app/api/funnel-event/route.ts:30-62` — no per-IP rate limit; row flooding possible.
- 🔲 `app/src/components/magnet/magnet-quiz.tsx:256` — Enter key bypasses `disabled={pending}`.

### Admin role tiering (dormant until non-super admins exist)
- 🔲 `app/src/actions/admin.ts:629,674,727,774,824,963` + `inline-edit.ts:71,138` — content edits gate on bare
      `requireAdmin()`; billing/support admins could edit content (contradicts role matrix).
- 🔲 `app/src/actions/admin.ts:288,303` — `sendPasswordReset`/`revokeUserSessions` open to any admin role.
- 🔲 `app/src/app/admin/members/page.tsx:104` — `lifetimePaidCents` serialized to all admin roles (hidden only client-side).

### Payments robustness
- 🔲 `charge/route.ts:439` — missing card fields still create an order + hit PagBank before failing (400 first).
- 🔲 `charge/route.ts:316` — couponed Pix 23505 recovery path returns 500 instead of surviving order.
- 🔲 `admin/billing/refund/route.ts:113-120` — post-refund writes in unchecked `Promise.all`.
- 🔲 `cron/reconcile-pix/route.ts:62` — reconcile covers Pix only; failed card finalize + dropped webhook has no
      automated recovery (mitigated by 1.1: order now stays pending → webhook replay retries).

### Reliability / invariants
- 🔲 Browser-client Supabase writes violate the no-browser-client invariant: `admin/settings/page.tsx:28`,
      `theme-toggle.tsx:26`, `member-header.tsx:167` (use `/api/profile` PATCH); `verify/page.tsx:35` `auth.resend()`
      (needs an `/auth/resend` route handler).
- 🔲 Recurring member emails (weekly-summary, daily-plan) lack `List-Unsubscribe` (`lib/email-render.ts:105-135`).
- 🔲 Auth routes return raw GoTrue `error.message` (English; signup = account-enumeration signal): login/signup/
      recover/reset/update-password routes. Member routes return raw PostgREST messages: quiz-attempt/profile/
      onboarding/activity.
- 🔲 `checkout/card-form.tsx:106` — installment refresh failure silently swallowed (stale totals shown; server
      recomputes, money-safe).
- 🔲 `lib/magnet/result.ts:58` — plan-preview failure on results page swallowed with no logging.
- 🔲 Native dialogs: `plano-client.tsx:316` member `confirm()`; `admin/notifications-client.tsx:207,242` `alert()`.

### Data layer / SEO / hygiene
- 🔲 Missing FK indexes (cascade deletes seq-scan during routine re-imports): `quiz_attempts.question_id`,
      `quiz_attempts.page_id`, `flashcard_progress.flashcard_item_id`, `lesson_completions`/`lesson_progress`
      lesson/page ids, `announcement_dismissals/reads(user_id)`, `orders.cohort_id/coupon_id`.
- 🔲 `leads.source` column default still `'simulado-honesto'` after the `/questoes-revalida` rename.
- 🔲 `/docs/*` internal authoring pages public + indexable; `robots.ts` trailing-slash rules don't match bare
      `/app`, `/admin`; consider adding `/dev`.
- 🔲 `app/public/flashcard-prompt.html` + `.txt` — stray dev artifacts served publicly.
- 🔲 `.select("*")` in hot paths (dashboard/hub specialties, `/api/profile`, support-data, `lib/queries/pages.ts`).
- 🔲 `lib/supabase/admin.ts` missing `import "server-only"` guard (defense-in-depth; no active leak — note:
      `instrumentation.ts` imports it dynamically, which stays safe under a server-only guard).
- 🔲 `app/.env.local.example:71-85` — nine stale `ENOTAS_*` vars no code reads.

### Verified-clean areas (for the record)
No hardcoded secrets/dev artifacts; env hygiene solid; mock-mode production-gated; service-role unreachable from
client bundles; all 22 API routes + 17 server-action files authenticated appropriately (except items above); crons
timing-safe on `CRON_SECRET`; RLS complete across all 50 tables in SQL; webhook signature verification fail-closed;
amounts integer-cents everywhere; checkout double-submit guards + server-side validation + sanitization clean;
lead tokens random UUIDs; `/resultado` noindexed.
