# Free-Funnel v2 — Trust-First Simulado Scope

> Status: **BUILT + COMMITTED (2026-06-30, main `e1b2dd4`)** — all 6 groups implemented,
> tsc+lint clean, mobile-checked at 375/414/768, full happy-path + "corrigir e-mail" re-key
> driven end-to-end. Schema patch (`schema-patch-leads-verify-claim.sql`) **applied to PROD
> and LOCAL**. Dev preview harness deleted. Committed by explicit path (16 files) — **NOT yet
> pushed** (go-live is a manual `git push` → Vercel deploy). Supersedes the delivery/timing
> assumptions in `FREE-FUNNEL-BUILD-SPEC.md` where they conflict.
>
> **Remaining to go live:** (1) `git push` main → Vercel deploys the new funnel (prod schema
> is already in place, so this is the go-live switch); (2) optionally set
> `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (both-or-neither) to enable the
> Turnstile bot wall; (3) confirm Resend is verified in prod so the code + delivery emails land.
> Origin: this file grew out of a bug report — the D0 email button dumped leads back
> to question 1 of the test — which unspooled into a full rethink of the funnel's
> trust model. Built to be a strong trust-building experience for a brand-new site
> selling a R$3–5k product where the sale happens over the drip, not on day one.

---

## Locked model: Hybrid capture

- **Soft capture at Q5** — email asked mid-test, quiz continues inline, *unverified*
  (drip-able but low-trust).
- **Hard verify-to-claim at the end** — a 6-digit code unlocks the personalized
  report + flashcard demo.
- **Everything delivered immediately on confirm** — no artificial drip delay. The
  drip exists to re-engage non-buyers, not to deliver value. (A reta-final 2026.2
  lead may be ready to buy that same day — never make them wait for the good stuff.)
- **Raw score is free on-screen; the *personalized plan* + flashcard demo are the
  gated reward.**

### Why hybrid (the reasoning behind the lock)

- Early capture protects paid-ad spend (a bounce before capture is a wasted click);
  end capture maximizes intent but is the *most* work-before-email. Hybrid takes the
  volume of early capture **and** the quality signal of who finishes + verifies.
- The verify step is not friction for friction's sake — it's the real-email
  incentive. Nothing they want is withheld *except* behind proving the inbox is real.
- The "correct your email" path at the code step is not a loophole — it's the
  conversion moment. Someone who faked an email at Q5 but finished all 15 and now
  wants their report is your **highest-intent lead**; let them fix the address at
  peak desire.

---

## End-to-end flow

1. Land on `/simulado-honesto` (public, indexable) → 5 free questions, no email.
2. After Q5 → **soft email capture**, continue immediately (lead row created, unverified).
3. Q6–15 with feedback → cohort question (2026.2 / 2027.1).
4. **Results:** raw score + honest diagnosis + missed-topics list, shown **free**.
5. To unlock the plan + flashcards → **enter 6-digit code** (masked email, resend,
   "corrigir e-mail"). Rate-limited.
6. **On confirm:** plan + interactive flashcard demo (with SM-2 spacing viz) reveal
   on-page; offer present → immediate buy path.
7. **Immediately:** delivery email fires — plan link (durable `/resultado` page) +
   flashcards, present tense.
8. **Drip (non-buyers only):** re-engagement on check-in / exam-urgency / guarantee,
   segmented by completion + verification tier.

---

## Work items

### Group 1 — Anti-abuse & deliverability *(build first, independent)*

1. **Bot protection on the lead form** — invisible Turnstile + honeypot + per-IP
   rate-limit + disposable-domain denylist + server-side MX check. Covers the initial
   submit **and** the resend / correct-email actions.
   → `app/src/actions/magnet.ts` + new util.
2. **Never email unverified input** — the code email only fires after checks pass.
   This kills the spam-cannon risk (bots submitting third-party addresses → we send →
   complaints → domain reputation tanks → real transactional email stops landing).
   → `app/src/actions/magnet.ts` (currently fires D0 to raw input at ~L88–103).

### Group 2 — Verify-to-claim + 6-digit code

3. **Code system** — generate, send, verify; **code in the email subject line** (so
   it shows in the phone notification without opening); 10-min expiry; attempts cap;
   resend. → `magnet.ts` + schema.
4. **Claim UI on results** — `autocomplete="one-time-code"` + numeric `inputMode` +
   auto-submit on the 6th digit + paste-to-fill; masked email
   (*"Enviamos para j\*\*\*@gmail.com"*); "não recebeu? reenviar"; "corrigir e-mail"
   (re-key the lead onto the corrected address, merge if it already exists);
   explain-the-ask line; **first-name field** (*"Como podemos te chamar?"*) captured
   here to personalize the drip. → `app/src/components/magnet/magnet-quiz.tsx`.

### Group 3 — The "meu material" page *(fixes the original broken email link)*

5. **Token result page** `/simulado-honesto/resultado?lead=<token>` — renders the
   saved score + plan + flashcards + offer from `leads.result`; durable, survives
   cross-device opens. All email links point here, **not** the bare quiz URL (which
   cold-restarts at Q1 with only the 5 free questions). → new page +
   `app/src/lib/magnet/links.ts`.

### Group 4 — Report + flashcard experience

6. **Results view** — raw score free; personalized plan gated behind confirm (blur
   the remainder as today); **missed-topics list** (so the plan feels earned, not
   generic); **adaptive, non-judgmental score framing** (low → "começo, não
   veredito"; high → "não perca pontos bobos"). → `magnet-quiz.tsx`.
7. **Flashcard demo in the reward** — interactive taste on their weak specialties
   **+ SM-2 spacing visualization** (*"Errou → próxima revisão: amanhã / Acertou →
   em 6 dias"*), mirroring the real intervals from the main app's `review_schedule`.
   Removed from the test entirely; lives in the post-confirm payoff so it never
   lengthens the pre-capture path. → `app/src/components/magnet/magnet-flashcards.tsx`.

### Group 5 — Email copy & delivery

8. **Code email** — code in subject, minimal body.
   → `app/src/lib/email-render.ts` (new template).
9. **Delivery email (immediate on confirm)** — plan link + flashcards, **present
   tense, no "nos próximos dias" for the flashcards** (they're delivered now); the
   expectation line points at the *nurture* drip instead; "questões reais de provas
   anteriores" credibility; personalized greeting (*"Oi, {first_name}"*); unsubscribe
   visible. Drop the "está liberado / Abrir meu material" unlock framing — nothing
   was locked. → `email-render.ts` (revise the `lead-d0` template).

   **Sender name for all funnel emails (code, delivery, drip): `Equipe MedHelpSpace`.**
10. **Drip re-hook** — the sequence re-engages non-buyers via check-in ("você
    começou?") / exam-urgency (reuse `lib/cohort-timing.ts`) / cost-of-failing /
    7-day guarantee. Flashcards are no longer the day-2 carrot (given away on day 0).
    → `email-render.ts` + `app/src/app/api/cron/lead-drip`.

### Group 6 — Lead scoring & segmentation

11. **Store completion depth + verified flag + first name** on `leads`; drip tiers:
    **finished + verified = hot** (aggressive offer), partial = light nurture,
    unverified = suppressed/minimal. → schema patch + lead-drip cron.

### Trust polish *(folded into the above, all approved)*

- **[1]** Explain-the-ask at the code step → item 4.
- **[2]** "Questões reais de provas anteriores" on intro + result → items 6, 9.
- **[3]** Adaptive score framing → item 6.
- **[4]** Deliver-now copy + forward-looking expectation line → items 9, 10.
- **[5]** Missed-topics list on the report → item 6.
- **[6]** First-name capture at the code step (confirmed) → items 4, 9, 11.

---

## Database (one `/schema-patch`)

`leads` add:
- `verified_at timestamptz` (null = unverified)
- `first_name text` (nullable)
- completion signal — `questions_answered int` and/or `completed_at timestamptz`
- code storage — `verification_code` + `code_sent_at` + `code_attempts` on `leads`,
  **or** a dedicated `lead_codes` table (decide at build; a table is cleaner for
  resend history + rate-limit accounting)
- index to support lookups

Idempotent guards + RLS (deny-all, service-role only, like the existing `leads`
table) + rollback notes per repo convention.

---

## Explicitly NOT changing

- `/flashcards-gratis` stays **public + indexable** (cold-SEO funnel-in for the
  "flashcards revalida" long-tail) — never gated. This build's flashcard demo is a
  *personalized* surface (weak specialties); the public deck is the generic sample.
  No conflict.
- Member-facing site stays **Portuguese-only** (no i18n).
- **`FREE_COUNT` stays 5** — capture point is a knob to A/B later, not this build.
- No change to paid `/app` product gating.
- **The flashcard demo is a sample, NOT enrolled in `review_schedule`** — leads are
  not members and passive samples carry no recall signal. Respects the "always ask
  before scheduling any new content" invariant.

---

## Cross-cutting

- **Mobile-first is mandatory** (CLAUDE.md rule). The code input and the flashcard
  demo get verified at 375 / 414 / 768 via `/mobile-check` before any item is "done".
- **Await all serverless email sends** (fire-and-forget gets frozen by Vercel on
  response → never delivers).

---

## Resolved decisions (2026-06-30)

- **Email sender name: `Equipe MedHelpSpace`** — a warm-but-anonymous team sender
  (a sender name ≠ publicly naming individuals, so it stays within the landing-page
  team-anonymity decision). Applies to every funnel email.
- **First-name capture: yes** — collected at the code step (*"Como podemos te
  chamar?"*), stored on `leads.first_name`, used to personalize the delivery email
  and the drip.

---

## Suggested build order

- **Phase 1:** Groups 1 + 2 + 3 (anti-abuse, code flow, result page — the backbone
  and the original bug fix).
- **Phase 2:** Groups 4 + 5 (report + flashcard experience + emails).
- **Phase 3:** Group 6 + polish.

---

## Paid-ads conversion tracking (attribution)

> Added 2026-07-01 while prepping paid Google Search traffic to `/simulado-honesto`.
> These "Phase 0/1/2" are the **attribution** phases — distinct from the build-order
> phases directly above. Architecture decision: **server-first, first-party**. The
> conversions that matter (verified, purchased) are server events we already record, so
> we do **not** add a client-side GA4 / Google-Ads tag — it would be lossier and force an
> LGPD consent banner onto the dark-only public site. The only client-side need is reading
> the gclid off the URL, which the landing page already does for UTM.

### Attribution Phase 0 — gclid capture *(SHIPPED — main `9694e7f`)*

- `leads.gclid` column — `schema-patch-leads-gclid.sql`, **applied prod + local**.
- Threaded from the landing URL like UTM: `simulado-honesto/page.tsx` → `MagnetUtm` →
  `captureLeadAndUnlock` (write on insert; `?? undefined` on update so a later submit never
  wipes a captured value). → `app/src/actions/magnet.ts`.
- **Why it had to ship before any spend:** gclid cannot be backfilled. No capture at click
  time = no per-keyword attribution or offline import, ever.

### Attribution Phase 1 — funnel visibility *(SHIPPED — main `9694e7f`)*

- `funnel_events` table — `schema-patch-funnel-events.sql` (deny-all RLS + REVOKE, like
  `leads`), **applied prod + local**. Records the two PRE-capture steps a lead row can't see:
  `landing`, `quiz_start`.
- Public `/api/funnel-event` beacon — `lib/magnet/funnel-track.ts` + `components/magnet/funnel-beacon.tsx`.
  Deduped per session on the client (sessionStorage) **and** by a `(session_id, event_type)`
  unique index on the server. Best-effort: analytics never breaks the funnel.
- Dashboard on `/admin/leads` — `lib/admin/funnel.ts` + `app/admin/leads/funnel-panel.tsx`:
  land → start → capture → verified → sale, with step-conversion + a by-source breakdown.
  i18n (`locales/admin/pt-BR.json` + `en.json`).
- Top-of-funnel only counts from the beacon's deploy onward; older leads predate it, so
  captures can exceed landings for a while (the "warming up" note in the panel explains this).

### Attribution Phase 2 — Google Ads Offline Conversion Import (OCI) *(DEFERRED — needs the Ads account)*

**What it does:** reports server-verified conversions back to Google, keyed on gclid, so Google
credits the exact keyword/campaign and can optimize bidding. Solves the fact that our real
conversions (the 6-digit verify, and the purchase confirmed by the PagBank webhook) happen
server-side and often days later — where no client tag can see them.

**The gclid round-trip:**
1. Click → Google auto-tagging appends `?gclid=…` → stored on `leads.gclid`. ✅ (Phase 0)
2. Convert → `verified_at` / `converted_at` recorded on the lead. ✅ (already)
3. **Upload** (this phase) → send Google `gclid + conversion name + time + value`.
4. Google matches gclid → original click → credits the keyword + feeds Smart Bidding.

**What to build:** an admin export ("Export offline conversions") that emits Google's CSV from
leads where `gclid IS NOT NULL` and a conversion fired. Two conversion actions:

| Conversion action | Fires on | Value | Job |
|---|---|---|---|
| **Lead verified** | `verified_at` | `0` (default) | volume → enough events to train Smart Bidding |
| **Purchase** | `converted_at` | order amount in BRL (join lead → `orders` by email) | ROI / ROAS by keyword |

Both are needed — 2 sales is far too sparse to train bidding; verified-lead supplies volume,
purchase supplies value. CSV columns: `Google Click ID, Conversion Name, Conversion Time,
Conversion Value, Conversion Currency`, preceded by `Parameters:TimeZone=America/Sao_Paulo`
(BRT — match Google's downloadable template exactly).

**Prerequisites (all Ads-account-side — why it's deferred):**
- A Google Ads account with **auto-tagging ON** (default) — that's what appends the gclid.
- **Define the two conversion actions in Google Ads first** (type "Import → from clicks"); the
  CSV references them **by name**, so they must exist before the first upload.
- Conversion must land inside Google's click-to-conversion window (default 90 days; our drip is
  ~11, so fine).

**Manual vs. API:** build the **manual CSV upload** first (Ads UI → Goals → Conversions →
Uploads) — right for a $200 test. Automate via the Google Ads API `ConversionUploadService`
later only if volume warrants (needs a developer token + OAuth).

**Gotchas:**
- Only gclid-bearing conversions get uploaded; organic / `site` leads stay in our own dashboard
  and are never sent to Google (correct — Google shouldn't take credit for them).
- Don't double-upload — add an `oci_uploaded_at` marker on the lead (or export by strict date
  range) so each conversion is reported once.
- Wait a few hours after the click before uploading (Google must register the click first).
- Timezone/format must match Google's template or rows get rejected.

**Alternative to keep in the back pocket:** Enhanced Conversions for Leads keys on a *hashed
email* instead of gclid — useful only if gclid capture ever has gaps. We capture gclid reliably,
so standard gclid-OCI is primary.

**Open decisions at build time:** which conversion(s) to optimize on (rec: verified-lead for
volume + purchase for value) and the verified-lead value (rec: `0`). Everything else is already
in `leads` + `orders`.
