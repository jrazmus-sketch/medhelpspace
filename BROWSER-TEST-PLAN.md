# MedHelpSpace — Browser QA Test Plan (Claude in the browser)

Driving **Claude for Chrome** (the agentic browser) to exercise every user-facing flow
and report defects. Claude cannot see the code here — it judges only what a user sees,
so the prompt must carry all the context, and **safety rails come first** because this is
production with real payments (PagBank) and real email (Resend).

---

## 0. Before you start (setup — do this once)

### Pick the environment
| Option | Reachable by browser-agent | Safe for form/checkout | Recommendation |
|---|---|---|---|
| **Vercel preview deployment** (branch URL) | ✅ public URL | ✅ if it points at a test DB / sandbox | **Best for write-path testing** |
| **Production** (`medhelpspace.com.br`) | ✅ | ⚠️ real data, real charges, real emails | Read-only / UI-only flows only |
| **Local `localhost:3001`** | ❌ cloud browser can't reach it | ✅ | Use `/mobile-check` in Claude Code instead |

**Recommendation:** point the agent at a **Vercel preview URL** for anything that submits a
form or touches checkout. Use production only for read-only visual/nav passes.

### Prepare test accounts (hand these to the agent)
1. **Member with active cohort membership** — sees all day-1 content.
2. **Member with NO membership** (or expired) — to verify gating actually blocks `/app`.
3. **Admin (`super_admin`)** — to walk `/admin` read-only.
4. **Throwaway email** you own (e.g. a `+test` Gmail alias) — the ONLY address the agent
   may type into any lead/contact/signup form.

### Decide the payment-testing policy
- Prefer PagBank **sandbox** keys on the preview build so checkout can be completed safely.
- If only prod keys exist: the agent validates the checkout **form/UI** and **stops before
  the final confirm** — never completes a real Pix or card charge.

---

## 1. Guardrails (these go verbatim into the prompt)

1. **No real payments.** Open checkout, validate the form/UI, but stop before submitting a
   real Pix/card charge unless a sandbox is confirmed.
2. **No real emails to real people.** Use only the throwaway test address for lead/contact/
   signup forms. Never enter a real person's email.
3. **No destructive admin actions.** Read and open detail views freely; for any create/edit/
   delete, describe what you *would* do and stop.
4. **No account mutations.** Don't change roles, revoke sessions, reset passwords, refund, or
   edit cohorts/leads.
5. **Treat everything as production.** When unsure an action is safe, pause and ask.

---

## 2. Test phases (run one at a time, report between each)

### Phase 0 — Smoke
Homepage renders, main nav enumerated, member login works. Stop and report.

### Phase 1 — Public marketing + funnels (logged out)
- Landing `/`, store `/loja` (prices, strike/sale badges, turma cards — **turmas are
  peers, never "recommended"**; sale copy leads with **2027.1**).
- Funnels: `/questoes-revalida`, `/flashcards-revalida`, `/simulado-revalida` — each
  email-first capture with the throwaway address; confirm the magic-link / resultado step
  appears (don't burn real inbox — just confirm the UI transitions).
- `/resultado?lead=<token>` durable resume page (if you have a token).
- Privacy + terms pages, footer links, Instagram link in email footers (visual only).
- Checks each page: loads, no console errors, no broken images, no horizontal overflow,
  CTAs clickable, copy is PT-BR and reads cleanly.

### Phase 2 — Auth
- Sign up (throwaway email), log in, log out, magic-link, password reset **request** UI
  (don't complete resets on real accounts).
- Gating: logged-out visit to `/app/...` redirects to login; **no-membership** account is
  blocked from gated content and sees the correct upsell.

### Phase 3 — Member content (`/app`, logged in as active member)
- Dashboard: display name, cohort badge, specialty grid, 60D countdown.
- One page of each renderer type — verify it actually renders and interactions work:
  - **plain-content** (auto-TOC at 3+ headings)
  - **text-lesson** (sidebar nav, "Próxima seção", audio player when present)
  - **h5p-quiz** (one question at a time, feedback, score summary, "Refazer as erradas")
  - **flashcards** (flip, Errei/Acertei, keyboard shortcuts, retry mode)
  - **memorecards** carousel
  - **blurb-nav-hub** (e.g. `/app/cardiologia`, track hubs)
- Cross-cutting: `/app/revalida-up` (day-1, ungated), `/app/formula-medhelp` (in 60D
  accordion), `/app/revisao` (SM-2), `/app/plano` + `/app/plano/roteiro`, `/app/comecar`
  onboarding, `/app/relatorio`, `/suporte` ticket flow.
- Theme toggle: light AND dark render correctly; media has dark-mode framing; no flash.

### Phase 4 — Membership / date-gating logic
- Confirm 60D-gated pages are blocked before unlock and the countdown matches.
- Confirm ungated day-1 content (incl. Revalida Up) is reachable.

### Phase 5 — Checkout (careful — see guardrails)
- `/loja` → pick a turma → checkout: billing fields (CPF, CEP, address, tax), Pix vs card
  toggle, installment interest display. Validate the form and error states.
- **Stop before the final charge** unless sandbox confirmed.

### Phase 6 — Admin (`/admin`, logged in as super_admin, READ-ONLY)
- Dashboard command-center, bell feed, language toggle (PT-BR ⇄ EN — admin is bilingual;
  member site is PT-BR only).
- Walk each section without writing: Members, Turmas/Cohorts, Leads (+ detail drawer,
  N/15 progress), Suporte inbox, Email templates (preview/test-send UI only), Notas
  fiscais, Estudio.
- For any create/edit/delete, describe the intended action and stop.

### Phase 7 — Responsive + a11y sweep (every page touched above)
- Widths 390 / 414 / 768: no horizontal overflow, tap targets ≥ 44px, no sub-14px text.
- Keyboard nav + focus states, image alt text, color contrast on key screens.

### Phase 8 — Cross-cutting hygiene
- Console errors/warnings, failed network requests (4xx/5xx), broken images, 404s on
  internal links, obvious layout breaks, slow-loading pages.

---

## 3. Report format (agent returns after each phase)

| # | Severity | Area | Page/URL | Steps | Expected | Actual | Shot? |
|---|----------|------|----------|-------|----------|--------|-------|

Severity: **P0** blocker / **P1** major / **P2** minor / **P3** polish.
Close each phase with: *"X pages checked, Y issues (P0/P1/P2/P3 counts)."*

---

## 4. Starting prompt — paste this into Claude in the browser

> Fill the `<...>` placeholders first. Feed one phase at a time; after each report, reply
> "run Phase N".

```
You are a meticulous QA tester for MedHelpSpace, a Brazilian-Portuguese medical exam-prep
membership site (Next.js + Supabase). You are driving a real web browser. Exercise the
site's user-facing flows and report defects. You cannot see the code — judge only what a
user sees. Member-facing copy must be Brazilian Portuguese; the /admin panel is bilingual.

TARGET: <URL>
ACCOUNTS:
- Member with active membership: <email> / <password>
- Member with NO membership (for gating): <email> / <password>
- Admin (super_admin): <email> / <password>
- Throwaway email for any form input: <throwaway_email>

HARD RULES — never violate:
1. Do NOT complete any real payment. Open checkout and validate the form/UI, but stop
   before submitting a real Pix/card charge (unless I confirm a sandbox is active).
2. Do NOT send real emails to real people. Use only <throwaway_email> in any form. Never
   type a real person's address.
3. Do NOT delete, bulk-edit, or destructively change data in /admin. Open and read detail
   views freely; for any create/edit/delete, describe what you WOULD do and stop.
4. Do NOT change roles, revoke sessions, reset passwords, refund, or edit cohorts/leads.
5. Treat everything as production. When unsure an action is safe, pause and ask me.

HOW TO WORK:
- Do ONE phase at a time. Run only the phase I name, then stop and give me the report
  before continuing. Do not wander into other areas.
- For each page: confirm it loads (not blank/error), no console errors, no broken images,
  no horizontal overflow, links/buttons respond, copy reads correctly.
- Check every page at desktop (1440px) and mobile (390px) width.
- Flag anything that looks wrong, even minor.

REPORT after each phase as a table:
| # | Severity (P0 blocker / P1 major / P2 minor / P3 polish) | Area | Page/URL | Steps | Expected | Actual | Screenshot? |
Then one line: "X pages checked, Y issues (P0/P1/P2/P3 counts)."

Start with PHASE 0 (smoke): load the homepage, confirm it renders, list the main nav
links you can see, then log in with the member account and confirm the dashboard loads.
Report, then wait for me.
```

### Follow-up prompts (send after each report)
- `Run Phase 1 — public marketing + funnels, logged out. Use <throwaway_email> for any form.`
- `Run Phase 2 — auth and gating. Do not complete password resets on real accounts.`
- `Run Phase 3 — member content as the active member. Cover one of each renderer type and toggle light/dark.`
- `Run Phase 4 — membership date-gating.`
- `Run Phase 5 — checkout. Validate the form only; STOP before any real charge.`
- `Run Phase 6 — admin, READ-ONLY. Describe-and-stop for any write.`
- `Run Phase 7 — responsive + a11y sweep across the pages you touched.`
- `Run Phase 8 — console errors, broken links, 404s, failed requests.`

---

## 5. Notes
- The **local dev / responsive** slice is faster via `/mobile-check` in Claude Code
  (Chrome DevTools MCP at 375/414/768) — use that for pure layout passes; use Claude in
  the browser for full end-to-end user journeys on a public URL.
- Keep sessions scoped (one phase each) so the agent doesn't run out of steps mid-flow and
  so each report is reviewable.
