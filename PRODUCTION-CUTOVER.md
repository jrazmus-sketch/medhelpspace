# MedHelpSpace — Production Cutover & "Free of IONOS" Runbook

Goal: make the Vercel app the live site at `medhelpspace.com.br`, move DNS to
**Cloudflare** (the permanent long-term home), replace IONOS mailboxes with fresh
**Zoho Mail**, and decommission IONOS — **without ever breaking email**, and
**without ever having to move nameservers again.**

**Architecture (target end state) — each layer independently swappable:**

| Layer | Vendor | Owner |
|---|---|---|
| Registrar (owns the domain) | **registro.br** | 👩 Karina |
| DNS host (authoritative NS) | **Cloudflare** (free) | 🧑‍💻 You |
| Web | **Vercel** (project `medhelpspace`) | 🧑‍💻 You |
| Email (mailboxes) | **Zoho Mail** (fresh, no migration) | 🧑‍💻 You |
| Transactional mail | **Resend** | 🧑‍💻 You |

**Why Cloudflare and not registro.br DNS:** you only move nameservers once, ever —
DNS is decoupled from both the registrar and Vercel, so future changes never require
another NS migration. You self-serve every record (no routing changes through Karina).
Free, DNSSEC, fast Brazilian anycast. registro.br stays the *registrar* only.

**Owners:** 🧑‍💻 You (Cloudflare / Vercel / Zoho / Resend / IONOS) · 👩 Karina (registro.br — one action: point NS at Cloudflare)

---

## Current state (verified 2026-06-04)

- Registrar: **registro.br**
- Nameservers: `ns1045.ui-dns.*` → **IONOS hosts the DNS today** (registrar ≠ DNS host). We are replacing this delegation with Cloudflare's.
- Apex `A` → `74.208.236.44` (IONOS / WordPress) — will become `216.198.79.1` (Vercel)
- Email on IONOS: MX `mx00/mx01.ionos.com`, SPF `v=spf1 include:_spf-us.ionos.com ~all`,
  DMARC `p=none`, autodiscover → `adsredir.ionos.info`, **+ a DKIM record only visible in the IONOS panel**
- Vercel: domain already added (`medhelpspace.com.br` + `www`, both target Production).
  Shows "Invalid Configuration" only because DNS doesn't point here yet — expected; auto-clears post-cutover.
- WordPress: still on IONOS.

⚠️ **Before touching DNS:** open the IONOS DNS panel and **screenshot every record**.
Cloudflare's import scan and external lookups **cannot see the DKIM selector** — that
screenshot is the only source of truth for DKIM.

---

## Target Cloudflare zone (final state)

| Type | Name | Value | Proxy | Source |
|---|---|---|---|---|
| A | `@` | `216.198.79.1` | **DNS only (grey)** | Vercel (apex) |
| CNAME | `www` | `a6c3a6d09a41856e.vercel-dns-017.com` | **DNS only (grey)** | Vercel |
| MX | `@` | `mx.zoho.com` (10), `mx2.zoho.com` (20), `mx3.zoho.com` (50) | — | Zoho |
| TXT | `@` | `v=spf1 include:zoho.com ~all` | — | Zoho SPF |
| TXT | `<selector>._domainkey` | DKIM key Zoho generates | — | Zoho DKIM |
| TXT/CNAME | (Resend's) | from Resend → Domains → medhelpspace.com.br | — | Resend (sending) |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | — | (keep) |

> **Vercel records MUST be grey-cloud (DNS only), not proxied.** Proxying (orange cloud)
> makes Vercel see Cloudflare IPs and report the domain misconfigured, and complicates SSL.
> Grey cloud lets Vercel issue/serve its own certs and edge directly. (Proxying is an
> optional later enhancement, not for cutover.)

> Dropped at cutover-to-Zoho: IONOS MX, IONOS SPF, autodiscover, IONOS DKIM.
> Vercel's panel may also accept older values (`A 76.76.21.21`, `CNAME cname.vercel-dns.com`).
> Use whatever the project's **Domains** tab shows.

---

## Phase 0 — Prep (no live changes)
- [x] 🧑‍💻 Vercel → **Domains**: `medhelpspace.com.br` + `www` added, target Production. (done — shows Invalid until DNS flips, expected)
- [ ] 🧑‍💻 Confirm Vercel env: `PAGBANK_WEBHOOK_BASE_URL` and `NEXT_PUBLIC_SITE_URL` both = `https://medhelpspace.com.br`.
- [ ] 🧑‍💻 Confirm `NEXT_PUBLIC_PAGBANK_PUBLIC_KEY` is the **production** card key, not sandbox.
- [ ] 🧑‍💻 **Redeploy** after any env change (Vercel reads env at build time).
- [ ] 🧑‍💻 Supabase → Auth → URL Configuration: Site URL + Redirect URLs include `https://medhelpspace.com.br`.
- [ ] 🧑‍💻 **Screenshot the entire IONOS DNS zone** (especially DKIM — Cloudflare's import can't see it).
- [ ] 🧑‍💻 In **Resend** → Domains, copy the DNS records it wants for `medhelpspace.com.br`.

### PagBank — already LIVE (done 2026-06-04)
- [x] `PAGBANK_ACCESS_TOKEN` + `PAGBANK_REFRESH_TOKEN` added (prod token was missing/blank — caused 401s on installments/card/Pix).
- [x] `PAGBANK_ENVIRONMENT = production`.
- [x] Webhook signature: PagBank signs with the **account token** (= your access token); code reuses it
      automatically. Verification is **monitor-mode** (logs but doesn't drop) until a real post-cutover
      webhook confirms it signs `valid`, then tighten to reject. Re-fetch is the real anti-forgery gate.
- ⚠️ Pix webhook won't reach the app until the DNS cutover (Phase 1) — `PAGBANK_WEBHOOK_BASE_URL` →
      `medhelpspace.com.br` still resolves to WordPress until then. (The status-poll path finalizes Pix
      regardless, but the webhook is the closed-tab backup.) Card is synchronous, works now.

## Phase 1 — Cloudflare zone + nameserver flip → website goes live (email unchanged)
Build the new zone with web → Vercel but **MX still pointing at IONOS**, so email keeps
working exactly as today through the switch. You move nameservers exactly once, here.
- [ ] 🧑‍💻 Create a **Cloudflare** account (free). Add site `medhelpspace.com.br`. Let it auto-import records.
- [ ] 🧑‍💻 **Reconcile the import against your IONOS screenshot.** Cloudflare will miss DKIM — add it manually.
      Confirm MX, SPF, DMARC, autodiscover all match the screenshot.
- [ ] 🧑‍💻 Set the web records (grey cloud / DNS only):
      `A @ → 216.198.79.1`, `CNAME www → a6c3a6d09a41856e.vercel-dns-017.com`.
      (Change the imported apex A from `74.208.236.44` → Vercel's IP so the flip lands on Vercel.)
- [ ] 🧑‍💻 Add the **Resend** records from Phase 0.
- [ ] 🧑‍💻 (Optional, "right way") Enable **DNSSEC** in Cloudflare → it produces a DS record.
- [ ] 👩 At **registro.br**: change nameservers from `*.ui-dns.*` (IONOS) to the **two Cloudflare nameservers**
      Cloudflare assigns. (If DNSSEC: also add the DS record Cloudflare gives.)
- [ ] Wait for NS propagation (a few hours for `.br`).
- [ ] ✅ Verify: `https://medhelpspace.com.br` is the new app; Vercel Domains shows **Valid** + SSL issued; Cloudflare shows the zone **Active**.
- [ ] ✅ Verify: send a test email **to** `@medhelpspace.com.br` — still arrives (IONOS).
- [ ] ✅ Verify: run one **real low-value PagBank payment** (card + Pix) → webhook lands on the new app → membership granted.

## Phase 2 — Stand up Zoho Mail (fresh, off IONOS) — no rush, within the IONOS window
Do this after Phase 1, so the Cloudflare zone exists and you self-serve every record.
- [ ] 🧑‍💻 Sign up at zoho.com/mail, add `medhelpspace.com.br`. Plan: **Forever Free** (≤5 users, 5GB each,
      webmail/app only) or **Mail Lite** (~US$1/user/mo, adds IMAP/POP for desktop+mobile clients).
- [ ] 🧑‍💻 In **Cloudflare**, add Zoho's **domain-verification TXT** (`zb…`) → verify in Zoho. (You do this yourself now.)
- [ ] 🧑‍💻 Create mailboxes (e.g. `contato@`, `pagamentos@`, `suporte@`).
- [ ] 🧑‍💻 Zoho admin → Email Configuration → **enable DKIM** (generates selector + key).
- [ ] 🧑‍💻 In **Cloudflare**, swap IONOS email records for Zoho's, and **remove all IONOS MX/SPF/DKIM/autodiscover**:
      - MX: `mx.zoho.com` (10), `mx2.zoho.com` (20), `mx3.zoho.com` (50)
      - TXT SPF `@`: `v=spf1 include:zoho.com ~all` *(single root SPF — Resend uses a `send.` subdomain, no conflict)*
      - TXT DKIM: `<selector>._domainkey` → the Zoho key
- [ ] ✅ Verify: send + receive on `contato@medhelpspace.com.br`; run it through mail-tester.com
      (SPF + DKIM + DMARC all pass) before relying on it.

## Phase 3 — WordPress local copy
- [ ] 🧑‍💻 Pull a local copy of the old site (DB you already have + `wp-content` from IONOS if you want media).
      (Optional `docker compose` MySQL + `db.sql` loader available on request.)

## Phase 4 — Decommission IONOS
- [ ] Only after Phases 1–3 verified (especially: email confirmed working on Zoho): cancel IONOS hosting + mail.
- [ ] Domain stays registered at **registro.br**, DNS on **Cloudflare**, web on Vercel, mail on Zoho. Fully free of IONOS.

---

## Rollback
- Website wrong after Phase 1: in Cloudflare, set `A @` back to `74.208.236.44` and `www` to its old value.
  (Or, worst case, repoint registro.br nameservers back to `*.ui-dns.*` — but that re-delegates to IONOS and is slow.)
- Email issue after Phase 2: in Cloudflare, revert MX/SPF/DKIM to the IONOS values from your Phase 0 screenshot.
- Each phase is independent and reversible via the saved IONOS zone screenshot. Because DNS lives at Cloudflare,
  every rollback is a record edit you control — no waiting on a registrar/NS change.
