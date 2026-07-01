# Google Ads Campaign Kit — `/questoes-revalida`

> Created 2026-07-01. Ready-to-launch kit for the first paid Google **Search** test
> (~$200 USD) driving long-tail traffic to the free questions magnet at
> `medhelpspace.com.br/questoes-revalida`.
>
> **Magnet reframe (2026-07-01):** the free sample was renamed from `/simulado-honesto`
> to `/questoes-revalida` and reframed from a mock "simulado" to **real questions from
> past Revalida exams** (Karina's call). A **permanent 301 redirect** (`next.config.ts`)
> keeps the old URL alive, so any old link still lands correctly. The route rename is in
> code but **not yet deployed** — the new URL only goes live after the next Vercel deploy.
>
> **Prereqs (done):** dedicated Google Ads account (BRL · America/São Paulo ·
> auto-tagging ON), conversion actions `Lead verified` + `Purchase` defined as
> Import/offline. Funnel tracking is live — attribution Phase 0/1 shipped, Phase 2
> (Offline Conversion Import export) shipped on `/admin/leads`. See
> `FREE-FUNNEL-V2-SCOPE.md` → "Paid-ads conversion tracking".
>
> **How this connects:** paid clicks land on `/questoes-revalida` with a `gclid`
> (auto-tagging) + `utm_source=google` (the Final URL suffix below). They then show
> as source **`google`** in the `/admin/leads` funnel dashboard, and their
> verify/purchase conversions surface in the **Offline conversions** panel there to
> download + upload back to Google.

---

## Strategy (the locked calls)

- **1 Search campaign, 2 ad groups.** Long-tail, tight match types — a $200 budget
  dies fast on broad match.
- **Bidding:** start **Manual CPC** (max ~R$4). A brand-new account has no conversion
  history, so Smart Bidding has nothing to learn from. Switch to **Maximize
  Conversions / tCPA** once OCI has fed ~15–30 conversions.
- **Optimize toward the free lead**, not the sale — verified leads are frequent
  enough to steer bidding; sales (R$3–5k, over the drip) are too sparse early.
- **Search only** (uncheck Display + Search Partners for a clean test).
- **Measurement:** watch the `/admin/leads` funnel dashboard (paid = `google` source)
  for land → capture → verified; upload conversions weekly via the Offline
  conversions panel (attribution Phase 2).

---

## Keywords

> **Keep bidding on "simulado"** even though the page is now "questões". "Simulado
> revalida" is high-volume search demand — real past questions satisfy that intent.
> Keywords = what people type; ad copy = what we promise. They don't have to match.

**Ad group A — Simulado / Questões** (highest intent)
```
[simulado revalida]
"simulado revalida 1a etapa"
"simulado revalida 2026"
"questões revalida comentadas"
"banco de questões revalida"
"questões comentadas revalida"
```

**Ad group B — Estudo / Preparação**
```
"como estudar para o revalida"
"como passar no revalida"
"plano de estudo revalida"
"material de estudo revalida"
"preparatório revalida 1a etapa"
```

**Negative keywords (campaign-level starter)** — strip other exams + job-seekers;
refine after the first search-terms report:
```
residência, residencia medica, enare, enem, usmle, plab, mci,
concurso, emprego, vaga, salario, clt, edital, inscrição,
diploma trabalho, "o que significa"
```

---

## Responsive Search Ad

**Headlines** (≤30 chars each):
```
Questões Revalida Grátis
15 Questões Comentadas
Revalida 1ª Etapa
Veja Onde Você Está
Plano de Estudo Grátis
Sem Promessa de Aprovação
Questões Reais Comentadas
Comece Pelo Diagnóstico
Estude o Que Cai na Prova
Grátis, Sem Cadastro
Revalida 2026.2
Descubra Seus Pontos Fracos
Questões de Provas Passadas
Provas Anteriores do Revalida
Banco de Questões Revalida
```

**Descriptions** (≤90 chars each):
```
Resolva 15 questões comentadas da 1ª etapa e veja exatamente onde você está. Grátis.
Receba um plano de estudo até a prova. Sem cartão e sem promessa de aprovação.
Questões reais de provas anteriores, comentadas uma a uma. Comece agora, de graça.
Descubra seus pontos fracos e o que estudar primeiro. Questões reais, de graça.
```

> The **"Sem promessa de aprovação"** headline is the differentiator — lean into the
> honest brand; it's disarming in a category full of guarantees. The **"provas
> passadas / questões reais"** angle reinforces that these are the real thing, not a
> fabricated mock.

**Extensions:**
- Sitelinks: `Questões grátis` (`/questoes-revalida`), `Flashcards grátis`
  (`/flashcards-gratis`), `Turmas 2026` (`/loja`), `Como funciona` (`/`)
- Callouts: `Grátis`, `Sem cartão`, `Questões comentadas`, `Plano de estudo`

---

## Campaign settings

| Setting | Value |
|---|---|
| Type | Search (Search only — uncheck Display + Search Partners) |
| Location | Brazil |
| Language | Portuguese |
| Daily budget | ~R$65 (spends ~$200 over ~2–3 weeks) |
| Bidding | Manual CPC, max CPC ~R$4 (→ conversion bidding later) |
| Final URL | `https://medhelpspace.com.br/questoes-revalida` |
| Display path | `revalida` / `questoes` |
| Final URL suffix | `utm_source=google&utm_medium=cpc&utm_campaign=revalida-simulado` |

The Final URL suffix is what makes paid traffic separate cleanly as `google` in the
funnel dashboard (gclid is auto-appended for OCI).

> **Do not launch the campaign until `/questoes-revalida` is live in production.**
> While it 404s, Google flags "destination not working" (harmless while paused, clears
> once deployed). The old `/simulado-honesto` still 301-redirects here, so pointing the
> ad at either works — but the new URL is the clean, canonical one.

---

## Paste-ready handoff prompt (for executing the setup in another chat)

```
Help me build and launch a Google Search campaign, step by step, in the
current Google Ads UI.

CONTEXT
- Business: MedHelpSpace (medhelpspace.com.br), Brazilian Revalida medical-
  exam prep. Portuguese. Dedicated Ads account already set up (BRL,
  America/Sao_Paulo, auto-tagging ON, conversion actions "Lead verified" +
  "Purchase" defined as Import/offline).
- Goal: a ~$200 USD long-tail Search test driving free-questions leads to
  medhelpspace.com.br/questoes-revalida (a free set of 15 real past-exam
  questions, comentadas, email-gated after the first 5). Conversions are fed
  to Google later via Offline Conversion Import, so DON'T add a website tag.

BUILD IT THIS WAY
- Campaign type: Search. Networks: Search only (uncheck Display + Search
  Partners). Location: Brazil. Language: Portuguese.
- Bidding: Manual CPC to start (new account, no conversion history), max CPC
  ~R$4. I'll switch to conversion bidding after OCI feeds data.
- Daily budget: R$65.
- Final URL: https://medhelpspace.com.br/questoes-revalida
- Final URL suffix: utm_source=google&utm_medium=cpc&utm_campaign=revalida-simulado
- Two ad groups (I'll paste the keywords), tight match types (phrase/exact
  only — no broad). One Responsive Search Ad per ad group (I'll paste
  headlines + descriptions). Add sitelink + callout extensions.
- Add my negative keyword list at the campaign level.
- PAUSE before launching so I can review everything and set the campaign to
  start paused.

Give me the exact click-path for each step, warn me before anything that
spends money, and tell me the first screen to open. I'll paste the keywords
and ad copy when you ask for them.
```

---

## After launch

1. Let it run a few days; check the **search-terms report** and add negatives for
   junk queries.
2. Watch `/admin/leads` → the funnel dashboard's `google` row (land → capture →
   verified) and the **Offline conversions** panel.
3. **Weekly:** download the OCI CSV, upload it in Google Ads (Goals → Conversions →
   Uploads), then hit "Mark as uploaded". Once ~15–30 conversions are imported,
   switch bidding to Maximize Conversions / tCPA.
