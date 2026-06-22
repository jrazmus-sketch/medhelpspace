# MedHelpSpace — Production Cutover & "Free of IONOS" Runbook

Goal: make the Vercel app the live site at `medhelpspace.com.br`, move DNS hosting from
IONOS to **registro.br itself** (the registrar hosts the zone — same model as Porkbun →
Vercel on the other site), replace IONOS mailboxes with fresh **Zoho Mail**, and
decommission IONOS — **without ever breaking email.**

**Architecture (target end state):**

| Layer | Vendor | Owner |
|---|---|---|
| Registrar **+ DNS host** | **registro.br** (you have account access, confirmed 2026-06-18) | 👩 Karina / 🧑‍💻 You |
| Web | **Vercel** (project `medhelpspace`) | 🧑‍💻 You |
| Email (mailboxes) | **Zoho Mail** (fresh, no migration) | 🧑‍💻 You |
| Transactional mail | **Resend** | 🧑‍💻 You |

**Why registro.br-direct and NOT Cloudflare:** a `.com.br` domain must stay registered at
registro.br regardless, registro.br includes free DNS hosting, and you have account access —
so there's no third party to add and nothing to "self-serve around." This mirrors the proven
Porkbun→Vercel setup on the other site. Cloudflare would only have added a vendor for a nicer
dashboard; not worth it here. (DNS host is decoupled from web/email — all swappable later.)

**Owners:** 🧑‍💻 You (registro.br DNS edits / Vercel / Zoho / Resend / IONOS) · 👩 Karina (registro.br account holder)

---

## Current state (verified 2026-06-04 / records 2026-06-16)

- Registrar: **registro.br**
- Nameservers: `*.ui-dns.*` → **IONOS hosts the DNS today**. We switch this to **registro.br's own DNS**.
- Apex `A` → `74.208.236.44` (IONOS / WordPress) — will become `216.198.79.1` (Vercel)
- Email on IONOS (confirmed from zone export):
  - MX `mx00.ionos.com` (10), `mx01.ionos.com` (10)
  - SPF TXT `v=spf1 include:_spf-us.ionos.com ~all`
  - DKIM = **3 CNAMEs** (`s1-ionos._domainkey → s1.dkim.ionos.com`, `s2-ionos._domainkey → s2.dkim.ionos.com`,
    `s42582890._domainkey → s42582890.dkim.ionos.com`) — not hidden TXT keys, fully captured
  - DMARC CNAME `_dmarc → dmarc.ionos.com`; autodiscover CNAME `autodiscover → adsredir.ionos.info`
- Vercel: domain already added (`medhelpspace.com.br` + `www`, both target Production). Shows "Invalid
  Configuration" only because DNS doesn't point here yet — expected; clears post-cutover.
- WordPress: still on IONOS. IONOS account closes within 30–60 days (so DNS cannot stay on IONOS).

✅ IONOS zone already screenshotted/exported 2026-06-16 — that is the rollback source of truth.

---

## Target registro.br zone — Phase 1 (web → Vercel, email still IONOS)

| Type | Name (host) | Value | Priority | Origin |
|---|---|---|---|---|
| A | `@` (apex) | `216.198.79.1` | — | Vercel (replaces IONOS `74.208.236.44`) |
| CNAME | `www` | `a6c3a6d09a41856e.vercel-dns-017.com` | — | Vercel (replaces IONOS `A www`) |
| MX | `@` | `mx00.ionos.com` | 10 | IONOS mail (keep) |
| MX | `@` | `mx01.ionos.com` | 10 | IONOS mail (keep) |
| TXT | `@` | `v=spf1 include:_spf-us.ionos.com ~all` | — | IONOS SPF (keep) |
| CNAME | `s1-ionos._domainkey` | `s1.dkim.ionos.com` | — | IONOS DKIM (keep) |
| CNAME | `s2-ionos._domainkey` | `s2.dkim.ionos.com` | — | IONOS DKIM (keep) |
| CNAME | `s42582890._domainkey` | `s42582890.dkim.ionos.com` | — | IONOS DKIM (keep) |
| CNAME | `_dmarc` | `dmarc.ionos.com` | — | IONOS DMARC (keep) |
| CNAME | `autodiscover` | `adsredir.ionos.info` | — | IONOS mail autoconfig (keep) |

**DROP — do NOT recreate** (IONOS-webhosting cruft; would break the cutover):
`AAAA @` and `AAAA www` (IPv6 → old WordPress), `A www` (replaced by CNAME), `TXT _dep_ws_mutex`
(IONOS webhosting token), `CNAME _domainconnect` (IONOS provisioning).

> registro.br zone-editor notes: for CNAME/MX **targets**, enter the full external hostname; in the
> **advanced (zone-file) mode** add a trailing dot (`mx00.ionos.com.`) so it isn't treated as relative
> to `medhelpspace.com.br`. The simple form editor handles this for you. MX priority is a separate field (10).
> Vercel's panel may also accept older values (`A 76.76.21.21`, `CNAME cname.vercel-dns.com`) — use whatever Vercel → Domains shows.

---

## Phase 0 — Prep (no live changes)
- [x] 🧑‍💻 Vercel → **Domains**: `medhelpspace.com.br` + `www` added, target Production. (shows Invalid until DNS flips — expected)
- [ ] 🧑‍💻 Confirm Vercel env: `PAGBANK_WEBHOOK_BASE_URL` and `NEXT_PUBLIC_SITE_URL` both = `https://medhelpspace.com.br`.
- [x] 🧑‍💻 `NEXT_PUBLIC_PAGBANK_PUBLIC_KEY` verified CORRECT (2026-06-18) — `.env.local` value matches the key
      returned by `POST https://api.pagseguro.com/public-keys` with the production token, byte-for-byte.
      NOTE: PagBank uses a **shared** card public key (same string in sandbox docs and production API), so it
      can't be told apart by eye — only the authenticated API call confirms it. This is NOT a sandbox/prod issue.
- [ ] 🧑‍💻 **Redeploy** after any env change (Vercel reads env at build time).
- [ ] 🧑‍💻 Supabase → Auth → URL Configuration: Site URL + Redirect URLs include `https://medhelpspace.com.br`.
- [x] 🧑‍💻 IONOS DNS zone screenshotted/exported (2026-06-16).
- [ ] 🧑‍💻 In **Resend** → Domains, copy the DNS records it wants (add them in Phase 1).

### PagBank — already LIVE (done 2026-06-04)
- [x] `PAGBANK_ACCESS_TOKEN` + `PAGBANK_REFRESH_TOKEN` added (prod token was missing/blank — caused 401s).
- [x] `PAGBANK_ENVIRONMENT = production`.
- [x] Webhook signature reuses the account/access token; verification is **monitor-mode** (logs, doesn't drop)
      until a real post-cutover webhook confirms it signs `valid`, then tighten to reject. Re-fetch is the real gate.
- ⚠️ Pix webhook won't reach the app until the DNS switch below (the status-poll path finalizes Pix regardless;
      webhook is the closed-tab backup). Card is synchronous, works now.

## Phase 1 — Switch DNS to registro.br → website goes live (email unchanged)
Build the zone with web → Vercel but **MX still pointing at IONOS**, so email keeps working through the switch.

> ✅ **DONE 2026-06-22 (~22:09 UTC).** Site is LIVE on Vercel at `medhelpspace.com.br`.
> Justin did the registro.br zone edits (Karina was originally slated). NS were already flipped to
> registro.br (`d/f.sec.dns.br`) but the zone was empty — meaning web AND email were briefly down —
> so we populated all 10 records in one pass. Verified live on the registro.br NS + Google 8.8.8.8:
> `A @ → 216.198.79.1`, `www CNAME → …vercel-dns-017.com`, `MX → mx00/mx01.ionos.com`, SPF TXT present.
> Vercel first showed "Failed To Generate Cert" (cert attempted while DNS was empty); **Refresh** on
> both domains reissued it → apex 308→www, www HTTP 200 over HTTPS. **Resend records were NOT added
> this pass** — revisit if Resend needs domain re-verification.

- [x] 🧑‍💻 Log in to **registro.br** → **Meus Domínios** → `medhelpspace.com.br`.
- [x] 🧑‍💻 In the **DNS** section, enable **"Usar os servidores DNS do Registro.br"** (moves zone hosting off IONOS).
- [x] 🧑‍💻 Open **Editar Zona** and enter every row from the **Target registro.br zone** table above.
      (Left the four DROP records out.) ⚠️ Resend records NOT added this pass.
- [x] 🧑‍💻 Save/publish the zone. Switching to registro.br DNS re-delegates the nameservers at the `.br` level.
- [x] ✅ Verified: `A → 216.198.79.1`; `www CNAME → vercel`; `MX → mx00/mx01.ionos.com`; `NS → *.sec.dns.br`.
- [x] ✅ Verified: `https://www.medhelpspace.com.br` is the new app (HTTP 200, Server: Vercel); Vercel Domains **Valid** + SSL issued.
- [ ] ✅ TODO Verify: send a test email **to** `@medhelpspace.com.br` — confirm it still arrives (IONOS).
- [ ] ✅ TODO Verify: run one **real low-value PagBank payment** (card + Pix) → webhook lands on the new app → membership granted.

## Phase 2 — Stand up Zoho Mail (fresh, off IONOS) — no rush, within the IONOS window
- [ ] 🧑‍💻 Sign up at zoho.com/mail, add `medhelpspace.com.br`. Plan: **Forever Free** (≤5 users, 5GB) or **Mail Lite** (~US$1/user/mo for IMAP/POP).
- [ ] 🧑‍💻 In **registro.br**, add Zoho's **domain-verification TXT** (`zb…`) → verify in Zoho.
- [ ] 🧑‍💻 Create mailboxes (e.g. `contato@`, `pagamentos@`, `suporte@`).
- [ ] 🧑‍💻 Zoho admin → Email Configuration → **enable DKIM** (generates selector + key).
- [ ] 🧑‍💻 In **registro.br**, swap IONOS email records for Zoho's, and **remove all IONOS MX/SPF/DKIM/autodiscover**:
      - MX: `mx.zoho.com` (10), `mx2.zoho.com` (20), `mx3.zoho.com` (50)
      - TXT SPF `@`: `v=spf1 include:zoho.com ~all` *(single root SPF — Resend uses a `send.` subdomain, no conflict)*
      - TXT DKIM: `<selector>._domainkey` → the Zoho key
      - DMARC: replace the IONOS `_dmarc` CNAME with TXT `_dmarc → v=DMARC1; p=none;`
- [ ] ✅ Verify: send + receive on `contato@`; run mail-tester.com (SPF + DKIM + DMARC all pass) before relying on it.

## Phase 3 — WordPress local copy
- [ ] 🧑‍💻 Pull a local copy of the old site (DB you already have + `wp-content` from IONOS if you want media).

## Phase 4 — Decommission IONOS
- [ ] Only after Phases 1–3 verified (especially email confirmed on Zoho): cancel IONOS hosting + mail.
- [ ] Domain registered + DNS-hosted at **registro.br**, web on Vercel, mail on Zoho. Fully free of IONOS.

---

## Rollback
- Website wrong after Phase 1: in registro.br, set `A @` back to `74.208.236.44` and re-add the old `A www`
  (+ the AAAA records) from the 2026-06-16 export.
- Email issue after Phase 2: in registro.br, revert MX/SPF/DKIM to the IONOS values from the export.
- Worst case: in registro.br, switch the domain back to the IONOS nameservers (`*.ui-dns.*`) — re-delegates to IONOS, but slow.
- Each phase is independent and reversible from the saved IONOS zone export.
