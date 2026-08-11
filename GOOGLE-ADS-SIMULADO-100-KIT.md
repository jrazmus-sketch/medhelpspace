# Google Ads Campaign Kit — `/simulado-revalida` (Simulado 100Q grátis)

> Created 2026-07-31. Ready-to-launch kit for a dedicated Google **Search** campaign
> driving the free 100-question simulado at
> `medhelpspace.com.br/simulado-revalida`.
>
> **This campaign replaces the `/questoes-revalida` one.** Decision (Justin,
> 2026-07-31): pause the existing campaign and go all-in on the simulado. See
> *Migrating off the old campaign* below — it ends the running LP experiment early,
> and that has a data consequence worth reading before you click pause.
>
> Companion to `GOOGLE-ADS-CAMPAIGN-KIT.md` (the older `/questoes-revalida` kit),
> which stays in the repo as the record of what is being paused.

---

## Read this first: the conversion signal changed

The old kit bids on the **`Lead verified`** conversion, which fires on
`leads.verified_at`. That column is only stamped when a lead **clicks an emailed
link** (`/simulado-revalida/acesso` or `/api/leads/turma`).

The simulado v2 funnel doesn't need the inbox. The exam **starts immediately**
after the form — the emailed link is only a resume aid. So a lead can sign up,
answer all 100 questions, submit, and read the full commented report **without ever
opening their email**, leaving `verified_at` NULL and the conversion invisible to
Google. Pointed at this landing page, the old setup would report near-zero
conversions and Smart Bidding would have nothing to learn from.

Fixed 2026-07-31 by giving the funnel its own two conversions (code + schema patch
shipped, see *What shipped alongside this kit*):

| Conversion action | Fires on | Meaning | Role |
|---|---|---|---|
| `Simulado started` | `leads.sim_entered_at` | Form submitted, exam session created | **Primary — this is what the campaign bids on** |
| `Simulado submitted` | `leads.sim_completed_at` | ≥50 answers submitted and graded | Secondary (quality column) |
| `Lead verified` | `leads.verified_at` | Clicked an emailed link | Secondary (leave account-level; not this campaign's goal) |
| `Purchase` | `leads.converted_at` | Paid order, value in BRL | Secondary (true north, slow) |

`verified_at` was deliberately **not** repurposed: it means "this address was
confirmed deliverable", the drip and recovery crons branch on it, and stamping it
at signup would mark unconfirmed addresses as verified — against the sending-domain
discipline.

---

## Step 1 — Create the two conversion actions (before anything else)

Google Ads → **Goals → Conversions → New conversion action → Import → Manual
import using API or uploads → Track conversions from clicks**.

Names must match the code **character-for-character** (`OCI_CONVERSION_SIM_STARTED`
/ `OCI_CONVERSION_SIM_SUBMITTED` in `app/src/lib/admin/oci.ts`) — the CSV's
"Conversion Name" column is matched exactly.

**Action 1**
| Field | Value |
|---|---|
| Name | `Simulado started` |
| Goal category | Submit lead form |
| Value | Don't use a value (`0`) |
| Count | **One** (one per lead, not every) |
| Click-through conversion window | 30 days |
| Attribution model | Data-driven (or Last click) |
| Primary/secondary | **Primary** |

**Action 2**
| Field | Value |
|---|---|
| Name | `Simulado submitted` |
| Goal category | Qualified lead (or Other) |
| Value | Don't use a value (`0`) |
| Count | **One** |
| Click-through conversion window | 30 days |
| Primary/secondary | **Secondary** |

Create both **before the campaign serves its first impression** — offline
conversions can't be attributed to an action that didn't exist yet.

⚠ **Set campaign-level conversion goals.** In the campaign's settings use
*"Use campaign-specific settings"* and select **only `Simulado started`** as the
goal. If `Lead verified` and `Simulado started` are both Primary account-wide, a
lead who does both counts twice and bidding over-values them.

---

## Step 2 — Migrating off the old campaign

1. **Pause** campaign `Search_Revalida_Simulado_Test` (the `/questoes-revalida`
   one). Pause, don't remove — you keep the history and the search-terms report.
2. **Do a final OCI upload first.** `/admin/leads` → "Conversões offline" →
   download CSV → upload in Google Ads → "Marcar como enviado". Conversions from
   clicks already paid for keep landing for weeks; upload once more ~2 weeks after
   pausing so that spend is not written off as unconverted.
3. **The `revalida-lp-test` experiment ends inconclusive.** It started Jul 6 on a
   56-day run (through ~Aug 31) and is being cut at ~day 25 of 56 at ~R$50/day.
   Cost-per-`Lead verified` may be readable; **cost-per-`Purchase` will not be** —
   don't crown either landing page on this data. Before pausing, screenshot or
   export the experiment scorecard; Google's experiment reporting gets awkward to
   retrieve once the base campaign is paused.
4. **Harvest the search-terms report** from the old campaign and carry good
   converting terms + all accumulated negatives into the new one. That's the one
   asset worth migrating — don't rebuild the negative list from scratch.
5. Keep `/questoes-revalida` **live** (it still serves organic + sitelinks + the
   old drip). Only the ad spend moves.

---

## Strategy

- **1 Search campaign, 3 ad groups**, tight match types (phrase + exact only, no
  broad). R$65/day dies fast on broad match.
- **Bid on `Simulado started`**, not the sale. At R$65/day the sale (R$3.297) is
  far too sparse to steer bidding; the free simulado start is frequent.
- **Manual CPC to start** (~R$4 max). The new conversion actions have zero history
  — Smart Bidding has nothing to learn from on day 1. Switch to **Maximize
  Conversions / tCPA** once OCI has fed ~15–30 `Simulado started` conversions
  (at R$65/day and a plausible ~R$3 CPC and ~15% start rate, that's roughly
  3–5 weeks).
- **Search only** — uncheck Display and Search Partners.
- The landing page is **hero-only by design** (Karina stripped everything below the
  fold 2026-07-26 precisely because it's an ad destination). Message match matters
  more than usual: there is no second section to recover a mismatched promise.

### Budget math (R$65/day ≈ R$1.950/month)

| CPC | Clicks/mo | @10% start | @15% start | @20% start |
|---|---|---|---|---|
| R$2,50 | ~780 | 78 | 117 | 156 |
| R$3,50 | ~557 | 56 | 84 | 111 |
| R$5,00 | ~390 | 39 | 59 | 78 |

Anything in this range clears the Smart Bidding threshold within the first month.
If the start rate comes in under 10%, the problem is the landing page or the
keyword match, not the budget.

---

## Keywords

Message match note: bid on **"simulado"** — it is the high-volume head term for
this intent, and now the page genuinely *is* a simulado (v2 is 100 unseen
INEP-style questions, not recycled past exams). This is a tighter match than the
old campaign ever had, where "simulado" traffic landed on a 15-question sample.

**Ad group A — Simulado Revalida** (head intent, highest value)
```
[simulado revalida]
[simulado revalida gratis]
"simulado revalida 2027"
"simulado revalida 1a etapa"
"simulado revalida online"
"simulado inep revalida"
```

**Ad group B — Prova / Questões** (adjacent intent)
```
"questoes revalida"
"questoes revalida comentadas"
"prova revalida 1a etapa"
"banco de questoes revalida"
"gabarito comentado revalida"
"teste de nivel revalida"
```

**Ad group C — Preparação** (upper funnel; watch its cost-per-start closely and
cut it first if the budget is straining)
```
"como estudar para o revalida"
"como passar no revalida"
"preparatorio revalida 1a etapa"
"material de estudo revalida"
"por onde comecar revalida"
```

**Negative keywords (campaign level).** Start here, then add from the old
campaign's harvested list and from the search-terms report weekly:
```
residencia, residencia medica, enare, enem, usmle, plab, mci, ceremed,
concurso, emprego, vaga, salario, clt, edital, inscricao, resultado,
data da prova, gabarito oficial, revalida 2024, revalida 2025,
pdf, download, torrent, gratis pdf, apostila pdf,
o que e revalida, o que significa, quanto custa a prova,
faculdade, graduacao, diploma trabalho, validacao de diploma
```
> `gabarito oficial`, `resultado` and `data da prova` are people looking for INEP
> announcements, not study material — pure waste. `pdf`/`download` want a file;
> this product is interactive on-site and will never satisfy them.

---

## Responsive Search Ads

Copy is matched to the **live** landing copy in `site_content` (`sim.hero.*`,
`sim.gate.*`) as of 2026-07-31. If Karina edits the hero in the visual editor,
re-check these — the DB row wins over the component fallback, so the page can drift
from the ad without a single deploy.

### Ad group A + B — "Simulado" RSA

**Headlines** (≤30 chars):
```
Simulado Revalida Grátis
100 Questões Inéditas
Gabarito Comentado
Simulado 100 Questões
Revalida 1ª Etapa
Estilo INEP, 100 Questões
Sem Cronômetro
Comece Agora, é Grátis
Descubra Suas Lacunas
Comentário em Cada Questão
Pare e Volte Quando Quiser
Sem Promessa de Aprovação
Seu Nível nas 5 Áreas
Simulado Completo Online
Prova Completa Gratuita
```

**Descriptions** (≤90 chars):
```
Resolva 100 questões inéditas no estilo do INEP e veja seu nível nas 5 grandes áreas.
Gabarito comentado em todas as alternativas. Sem cronômetro e sem custo.
Comece agora no navegador, pare quando quiser e volte de onde parou. Grátis.
Simulado completo da 1ª etapa, com comentário em cada questão. Comece de graça.
```

### Ad group C — "Preparação" RSA

Same descriptions; swap in these headlines so the ad answers the upper-funnel
question rather than announcing a product:
```
Por Onde Começar a Estudar
Descubra Suas Lacunas
Simulado Revalida Grátis
Veja Seu Nível Hoje
100 Questões Inéditas
Estude o Que Cai na Prova
Gabarito Comentado
Sem Promessa de Aprovação
Revalida 1ª Etapa
Comece Pelo Diagnóstico
```

> Keep **"Sem promessa de aprovação"** pinned nowhere but present in every ad — it
> is the brand differentiator in a category saturated with guarantees, and it
> pre-qualifies clicks. **"Inéditas"** is the other one worth protecting: every
> competitor recycles past INEP exams; unseen questions in exam style is the actual
> product claim, and it is true.

**Pinning:** don't pin anything at first. Let Google's asset report tell you which
headline wins, then pin only if a legally-important line (the "sem promessa"
framing) needs to be guaranteed on-screen.

### Extensions

- **Sitelinks:** `Flashcards grátis` (`/flashcards-revalida`), `Questões
  comentadas` (`/questoes-revalida`), `Turmas e preços` (`/loja`), `Como funciona`
  (`/`)
- **Callouts:** `100 questões inéditas`, `Gabarito comentado`, `Sem cronômetro`,
  `Grátis`, `Comece agora`
- **Structured snippet** (Tipo de curso): `Clínica Médica`, `Cirurgia Geral`,
  `Pediatria`, `Ginecologia e Obstetrícia`, `Saúde Coletiva`
  — these are the five áreas the exam actually covers (39/16/17/18/10 questions),
  so the snippet is accurate, not decorative.

---

## Campaign settings

| Setting | Value |
|---|---|
| Campaign name | `Search_Simulado_100Q` |
| Type | Search (Search only — uncheck Display + Search Partners) |
| Location | Brazil (**Presence: people in your target location** — not "presence or interest") |
| Language | Portuguese |
| Daily budget | **R$65** |
| Bidding | Manual CPC, max CPC ~R$4 → Maximize Conversions after ~15–30 conversions |
| Conversion goal | **Campaign-specific → `Simulado started` only** |
| Final URL | `https://medhelpspace.com.br/simulado-revalida` |
| Display path | `revalida` / `simulado` |
| Final URL suffix | `utm_source=google&utm_medium=cpc&utm_campaign=simulado-100-search` |
| Ad rotation | Optimize (default) |
| Ad schedule | All day — Revalida candidates study at night; don't restrict early |

The Final URL suffix is what makes paid traffic separate cleanly in `/admin/leads`
(`utm_source=google`, funnel = simulado). `gclid` is auto-appended by auto-tagging
and captured on this route already (`app/src/app/simulado-revalida/page.tsx:47` →
`actions/simulado.ts`) — nothing to build.

> **Location targeting note:** the default "presence or interest" setting will show
> ads to people *outside* Brazil searching about Brazil. Some of those are the
> actual audience (Brazilian-trained doctors abroad, and foreign-trained doctors
> planning to revalidate) — but most are noise at this budget. Start with
> **Presence**, and only widen once cost-per-start is known.

---

## Pre-flight checklist (gates on spend)

| # | Item | Status |
|---|---|---|
| 1 | Conversion actions `Simulado started` + `Simulado submitted` created in Google Ads | ☐ **you** |
| 2 | Campaign-specific conversion goal set to `Simulado started` only | ☐ **you** |
| 3 | Final OCI upload from the old campaign, then pause it | ☐ **you** |
| 4 | Experiment scorecard exported before pausing | ☐ **you** |
| 5 | OCI code + schema patch deployed to prod | ☑ patch applied prod + local; code needs a deploy |
| 6 | **Karina's área review of the 100 questions** (32 flagged) | ☐ open — this is the product the ad sells |
| 7 | `/mobile-check` on `/simulado-revalida` + `/prova` + `/resultado` | ☐ **never run** — most paid Revalida traffic is mobile |
| 8 | Turnstile keys in Vercel | ☐ open — see below |
| 9 | End-to-end smoke: click an ad-style URL with a fake `?gclid=`, sign up, confirm `leads.gclid` populated and the lead appears in the OCI panel | ☐ |

**#7 is the one I'd insist on.** The landing page is hero-only with a sticky form
column and a `lg:` two-column grid; mobile is where the money lands and it has
never been driven in a browser. A broken form on 375px wastes the entire budget.

**#8 Turnstile:** the keys were never created, so the widget is dormant. Note the
main signup gate (`simulado-gate.tsx`) uses a **honeypot only** — Turnstile is
wired on `magnet-quiz.tsx` and `simulado-email-check.tsx`, not on this form. That's
tolerable for a R$65/day test, but paid traffic attracts form spam, and bot signups
would inflate `Simulado started` — the exact metric bidding optimizes toward. Watch
for implausible start rates in week 1.

---

## After launch — the weekly rhythm

1. **Days 1–3:** don't touch bids. Check the **search-terms report** daily and add
   negatives; that's where the money leaks early.
2. **Weekly:** `/admin/leads` → "Conversões offline" → download CSV → Google Ads
   (Goals → Conversions → **Uploads**) → then **"Marcar como enviado"**. Skip a
   week and the campaign looks dead to Google — this is the single most important
   recurring task.
3. **Weekly:** read `/admin/leads` funnel for `utm_source=google` — land → start →
   submit → purchase. Cost-per-`Simulado started` is the fast decision driver;
   `Simulado submitted` rate tells you whether the traffic is *serious* or just
   cheap.
4. **~Week 4:** once ~15–30 conversions are imported, switch bidding to Maximize
   Conversions. Give it 2 weeks before judging.
5. **Ongoing:** cost-per-`Purchase` is the true north but arrives months late over
   a R$3.297 sale. Never kill a keyword on purchase data alone this early; never
   crown one on cost-per-start alone either.

---

## Paste-ready handoff prompt (to execute the build in the Google Ads UI)

```
Help me build and launch a Google Search campaign, step by step, in the
current Google Ads UI.

CONTEXT
- Business: MedHelpSpace (medhelpspace.com.br), Brazilian Revalida medical-
  exam prep. Portuguese. Existing Google Ads account (BRL, America/Sao_Paulo,
  auto-tagging ON).
- Goal: drive free signups to medhelpspace.com.br/simulado-revalida — a free
  100-question simulado of UNSEEN questions in INEP 1a-etapa style, with a
  fully commented gabarito. The exam starts immediately in the browser after
  a name + email + turma form.
- Conversions are fed to Google via Offline Conversion Import, so DON'T add
  a website tag.
- FIRST: help me create two Import (offline) conversion actions named
  exactly "Simulado started" (Submit lead form, no value, count One,
  30-day window, PRIMARY) and "Simulado submitted" (Qualified lead, no
  value, count One, SECONDARY).
- I am also PAUSING an existing campaign (Search_Revalida_Simulado_Test);
  remind me to export its experiment scorecard and search-terms report
  first.

BUILD IT THIS WAY
- Campaign name: Search_Simulado_100Q. Type: Search. Networks: Search only
  (uncheck Display + Search Partners). Location: Brazil, targeting set to
  PRESENCE (not presence-or-interest). Language: Portuguese.
- Conversion goals: use CAMPAIGN-SPECIFIC settings, and select only
  "Simulado started".
- Bidding: Manual CPC, max CPC ~R$4. Daily budget: R$65.
- Final URL: https://medhelpspace.com.br/simulado-revalida
- Final URL suffix:
  utm_source=google&utm_medium=cpc&utm_campaign=simulado-100-search
- Display path: revalida / simulado
- Three ad groups (I'll paste the keywords), phrase/exact match only — no
  broad. One Responsive Search Ad per ad group (I'll paste headlines +
  descriptions). Add sitelink, callout and structured-snippet extensions.
- Add my negative keyword list at the campaign level.
- PAUSE before launching so I can review everything.

Give me the exact click-path for each step, warn me before anything that
spends money, and tell me the first screen to open. I'll paste the keywords
and ad copy when you ask for them.
```

---

## What shipped alongside this kit (2026-07-31)

Code changes making the campaign measurable:

| File | Change |
|---|---|
| `schema-patch-leads-oci-simulado.sql` | Adds `leads.oci_sim_started_uploaded_at` + `oci_sim_submitted_uploaded_at`; backfills existing simulado leads as already-uploaded so the first export is clean. **Applied to prod + local.** |
| `app/src/lib/admin/oci.ts` | Two new conversion constants; `getOciReadyCounts` and `buildOciExport` now emit `Simulado started` / `Simulado submitted` rows alongside the existing pair |
| `app/src/actions/oci.ts` | `markOciUploaded` stamps the two new markers |
| `app/src/app/admin/leads/oci-panel.tsx` | Carries the new ID sets through download → mark-uploaded; total count includes them |
| `app/src/locales/admin/{pt-BR,en}.json` | `oci.ready` / `oci.readyNone` / `oci.help` updated for four conversion types |

The OCI export is source-agnostic (it queries every lead with a `gclid`), so a lead
who arrived through any funnel and later took the simulado still reports correctly.
