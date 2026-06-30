# Free Funnel + Email Drip — Build Spec

> **Purpose.** The paid-ads launch ($200 USD, Google Search long-tail) drives clicks to a free
> "Simulado Honesto" lead magnet. This spec defines the magnet page, the result→plan→offer flow,
> the `leads` data model, the lead-capture server action, and the 6-email drip campaign that does
> the actual selling. Marketing rationale lives in `.marketing/run-20260629/04-final-report.md`.
>
> **Repo convention reminder.** This is a customized Next.js — per `app/AGENTS.md`, the build
> session MUST read the relevant guide in `node_modules/next/dist/docs/` before writing code.
> All Supabase reads = server components (browser client hangs). All email sends = awaited
> (serverless kills fire-and-forget). New tables = RLS + revoke anon/auth grants at creation.

---

## 0. Prerequisites (block the launch until done)

1. **Resend sending domain verified + `RESEND_API_KEY` live in prod.** The entire drip is dead
   without it (`getResend()` returns null → sends no-op). Your own note (2026-06-24) flagged
   "confirm Resend Verify + deployed wiring" — confirm before spending a Real on ads.
2. **Pick the 15 questions with Karina.** 5 free (shown to everyone, indexable) + 10 gated. Choose
   high-yield, broad-specialty coverage so the diagnostic produces a meaningful weak-specialty map.
   Store their `quiz_questions.id`s in a constant (see §3.1).
3. **Coupons — DECIDED (see §6.5 for the full ladder + safety):** a **2026.2-only** discount ladder.
   `RETA2026` (R$700 off → R$3.290, offer page) and `ULTIMA2026` (R$1.000 off → R$2.990, private/
   email-only, final 2 weeks). **2027.1 is full price, no discount, ever.** The codes double as
   attribution (every redemption writes `orders.coupon_id`).

---

## 1. Architecture at a glance

```
Google Search ad ──► /simulado-honesto         (PUBLIC server component, OUTSIDE /app gate, indexable)
                       │
                       │  Q1–Q5 rendered server-side (instant, in HTML for SEO)
                       ▼
                  [ answer 5 ] ──► email gate ──► captureLeadAndUnlock()   (server action, admin client)
                       │                              │  • insert leads row (email + UTM + score + weak specs)
                       │                              │  • await sendTemplateEmail('lead-d0')  ← deck + result
                       │                              │  • derivePlan() preview from the result
                       ▼                              ▼
                  Q6–Q15 revealed  ──►  RESULTS / OFFER view:
                       1. score + honest diagnostic
                       2. stakes (13/09)
                       3. PERSONALIZED LOCKED PLAN PREVIEW (derivePlan, first 2–3 items, rest blurred)
                       4. "custo de reprovar" receipt
                       5. offer: R$3.990 · 12x/Pix · 7 dias garantia · CTA ──► /checkout?utm…&cupom=…
                       6. "sem pressa, enviamos no seu email" (hands close to drip)

Daily Vercel cron  ──► /api/cron/lead-drip   ──► advances each active lead through D0…D7 templates
                                                  (dedup via email_log; stops on convert/unsub)
Checkout success   ──► match order.email → leads.email → mark converted_at, stop drip
```

Key principle: the page **presents** the offer at peak engagement; the **drip closes** over days.
Nobody is expected to buy R$3.990 on the first session.

---

## 2. Data model — `leads` table

Create via the `/schema-patch` skill (it picks the filename + adds idempotent guards + rollback).
Proposed `schema-patch-leads.sql`:

```sql
-- leads: anonymous email captures from the /simulado-honesto magnet. NOT auth.users /
-- profiles — these are non-members; a lead becomes a member only via /checkout.
-- Written ONLY by the capture server action + drip cron via service_role (BYPASSRLS).
-- Deny-all RLS; no anon/auth grants (mirrors email_templates / email_log).

create extension if not exists pgcrypto;

create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  created_at        timestamptz not null default now(),

  -- attribution (null/'organic' for SEO visitors)
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_term          text,
  utm_content       text,
  source            text not null default 'simulado-honesto',

  -- magnet result → personalization
  score             smallint,              -- 0..15
  weak_specialty_ids integer[] default '{}',
  result            jsonb,                 -- [{question_id, specialty_id, is_correct}]

  -- drip state machine
  drip_step         smallint not null default 0,   -- last step sent (0 = only D0 welcome)
  drip_status       text not null default 'active', -- active | converted | unsubscribed | bounced
  last_emailed_at   timestamptz,
  converted_at      timestamptz,
  unsubscribed_at   timestamptz,

  unsubscribe_token uuid not null default gen_random_uuid()
);

-- one active lead per email; re-submits upsert (refresh score/UTM, keep drip progress)
create unique index if not exists leads_email_key on public.leads (lower(email));
create index if not exists leads_drip_active_idx on public.leads (drip_status, drip_step, created_at)
  where drip_status = 'active';

alter table public.leads enable row level security;
-- no policies = deny-all to anon/authenticated; service_role bypasses RLS.

revoke all on public.leads from anon, authenticated;
```

Notes:
- **No browser access.** Capture + cron + admin all use `createAdminClient()` (service role).
- `unsubscribe_token` powers a one-click List-Unsubscribe link (CAN-SPAM / Resend best practice).
- Re-submission = upsert on `lower(email)`: refresh `score`/`weak_specialty_ids`/UTM, do **not**
  reset `drip_step` (don't re-spam someone who came back).

---

## 3. The magnet page — `/simulado-honesto`

New route **outside** `app/src/app/app/` (so it never hits `requireActiveMembership()`), e.g.
`app/src/app/simulado-honesto/page.tsx` — a **server component**, indexable, sitemap'd.

### 3.1 Question source
```ts
// app/src/lib/magnet/questions.ts
export const MAGNET_FREE_IDS  = [/* 5 quiz_questions.id — high-yield, mixed specialty */];
export const MAGNET_GATED_IDS = [/* 10 quiz_questions.id */];
```
Server-side, read these from `quiz_questions` via the service-role client (join to `pages` for
`specialty_id`). Render the **5 free** in the initial HTML (instant load + SEO). The 10 gated are
returned by the unlock server action (§3.3), not in the initial HTML — that's the real gate.

### 3.2 Quiz UI
Reuse / adapt **[quiz-player.tsx](app/src/components/content/quiz-player.tsx)** as a lightweight
`MagnetQuiz` client component: one question at a time, immediate feedback, a `5 de 15` progress
marker. No attempt-tracking writes (anonymous). After Q5 feedback → render the **email gate** inline
(single email field; copy: *"Você está indo bem. Veja as 10 restantes + seu resultado comentado +
o baralho de flashcards →"*).

### 3.3 Capture + unlock — server action
```ts
// app/src/actions/magnet.ts   ("use server")
export async function captureLeadAndUnlock(input: {
  email: string;
  answersSoFar: { questionId: number; isCorrect: boolean; specialtyId: number | null }[];
  utm: Record<string,string|undefined>;
}): Promise<{ gatedQuestions: MagnetQuestion[]; planPreview: PlanPreview }> {
  // 1. validate email (zod). 2. upsert leads row via createAdminClient()
  //    (compute partial score + weak_specialty_ids from answersSoFar).
  // 3. AWAIT sendTemplateEmail({ kind: 'lead-d0', to: email, vars }).  ← deck link + "seu simulado"
  // 4. read the 10 gated questions (service role). 5. build planPreview (§4).
  // Returns gated Qs + plan preview to the client to reveal.
}
```
After unlock, the client reveals Q6–Q15; on Q15 it shows the **results/offer view** (§5). A second
server action `finalizeLeadResult({ email, fullResult })` updates the lead's final `score`/`result`.

### 3.4 SEO / indexing
- `export const metadata` — title `Simulado Revalida 1ª Etapa — 15 Questões Comentadas Grátis`,
  description targeting `simulado revalida` / `questões revalida comentadas`. **No `noindex`.**
- Add `/simulado-honesto` to the sitemap. Keep the page lean (the 5 free Qs are the indexable body;
  don't bury them under marketing copy).
- Fast LCP — it's a Google Ads landing page; Quality Score lowers your CPC.

---

## 4. Personalized plan preview (the planner tease)

Reuse the existing pure engine — **no new algorithm**:

```ts
// app/src/lib/magnet/plan-preview.ts
import { derivePlan, defaultPrefs } from "@/lib/study-plan/derive";

export async function buildPlanPreview(weakSpecialtyIds: number[], answers: Answer[]) {
  // read specialties + pages via service role (cache these — they're reference data)
  const signals = {
    quizAttempts: answers.map(a => ({
      specialty_id: a.specialtyId, is_correct: a.isCorrect,
      created_at: NOW_ISO, page_id: a.pageId,           // synthesize "today" attempts
    })),
    lessonCompletions: [], reviewDueToday: 0,
    lessonsByPageId: new Map(), pauses: [],
  };
  const plan = derivePlan({
    prefs: { ...defaultPrefs(), focus_specialty_ids: weakSpecialtyIds, include_60d: false },
    cohort: { test_date: "2026-09-13" },                 // Revalida 2026.2 1ª etapa
    specialties, pages, signals,
  });
  // Return: plan.daysToExam, plan.phase, plan.weakestSpecialties,
  //         plan.items.slice(0,3) VISIBLE + count of the rest (blurred/locked).
}
```

Render: *"Com base no seu resultado, seu plano até 13/09 (X dias):"* → 2–3 real items visible (their
weak specialties prioritized — `derivePlan` already pins `focus_specialty_ids` to the front at
weight 1.5), progress bar `0 de N`, the remaining items blurred behind **"Desbloquear meu plano
completo →"** (the offer CTA). The item `href`s point to `/app/...` (gated) — perfect, they're
locked previews. **Build task:** verify `derivePlan` runs cleanly with synthesized signals + no
authenticated user (it's pure; should just work — confirm the pages/specialties reads).

---

## 5. Results / offer view (after Q15)

Single continuous view, top to bottom (see `04-final-report.md` for the why):

1. **Score + honest diagnostic** — `Você acertou {score}/15` + per-specialty hits/misses.
   Brutally honest is on-brand ("Simulado **Honesto**").
2. **Stakes** — `Faltam {daysToExam} dias para a 1ª etapa (13/09). O que falta não é esforço — é método.`
3. **Locked personalized plan preview** (§4) — the gain/path lever.
4. **"Custo de reprovar" receipt** — `Você já pagou R$410 de taxa. A prova custa R$4.516. Reprovar
   e refazer a 2ª fase: +~R$4.106 e mais um ano sem poder exercer. O método completo: R$3.990.`
5. **Offer** — what's included (questões comentadas · revisão espaçada/flashcards · MedVoice · plano
   60D) · **R$3.990, 12x ou Pix** (read from cohorts/pricing) · **7 dias de garantia incondicional** ·
   one CTA → `/checkout?... ` carrying UTM + coupon. No fake countdown; the real 13/09 date is the urgency.
6. **Pressure-release** — `Sem pressa — enviamos seu resultado e o baralho no seu email também.`

---

## 6. Attribution (Pix breaks the pixel)

- **UTMs** captured on the magnet page, stored on the lead, and forwarded to `/checkout` (hidden
  field / query) so the order records which ad drove it.
- **Coupon-as-tracker** via the existing coupon system (`schema-patch-coupons.sql`): one code per
  campaign; logged at checkout. Survives Pix (which doesn't fire a reliable pixel `Purchase`).
- **Lead↔order reconciliation:** on checkout success, match `order.email` → `leads.email`; set
  `converted_at`, flip `drip_status='converted'` (stops the drip). This is the source-of-truth
  magnet→sale number; read it in admin, not from the pixel.
- **GA4 / Google Ads conversion** fires on the checkout **success page** (works for card + Pix),
  not on the async payment callback.

---

## 6.5 Pricing ladder & discount safety (CRITICAL — payment code = defense-in-depth)

### Price ladder — 2026.2 ONLY (2027.1 = full price, no discount, ever)

| Surface | Price | Coupon | Window |
|---|---|---|---|
| Public (landing, /loja, Google) | **R$3.990** | — | always (anchor stays clean) |
| Post-quiz offer page (captured leads) | **R$3.290** | `RETA2026` — fixed R$700 off | launch → Aug 30 |
| Final-stretch email (PRIVATE) | **R$2.990** | `ULTIMA2026` — fixed R$1.000 off | ~Aug 16 → Aug 30 |

After **Aug 30** (2 weeks pre-exam) the 2026.2 sale closes (`cohorts.sale_ends_at`); surviving leads
roll into the **full-price 2027.1 nurture (Phase 2, built later)**. The escalating discount is fair,
not a gimmick (less time left = less product = lower price) — say so in the emails so nobody who buys
early at R$3.290 resents the later R$2.990.

Both coupons: `discount_type='fixed_cents'`, `applies_to_cohort_slugs='{revalida-2026-2}'`,
`expires_at`='2026-08-30'. `ULTIMA2026` also `starts_at`≈'2026-08-16' and is **NEVER rendered on any
public/indexable surface** — it exists only inside the final drip emails. Floor: do not go below
R$2.490. Keep the 7-day refund on every tier.

### Guarantee A — buyers exit the drip (no early buyer ever receives the deeper price)
1. **WRITE (primary):** in `lib/pagbank/finalize.ts`, on a paid order (Pix + card both flow through
   here), `UPDATE leads SET drip_status='converted', converted_at=now() WHERE lower(email)=lower(<order email>)`.
2. **READ backstop:** `/api/cron/lead-drip` excludes, at send time, any lead whose email matches a
   paid order / active member — so a missed or raced write still cannot email a buyer a discount.
   Source of truth = purchase state, not only the stored flag.
3. **NATURAL:** the membership gate blocks members from re-purchasing; coupons are 1-use-per-user
   (`UNIQUE(coupon_id, user_id)`).
- **Edge case:** lead email ≠ checkout email can't be matched → **prefill checkout with the lead's
  captured email** (carry it through the CTA). Residual risk accepted (small).

### Guarantee B — 2027.1 NEVER gets a discount
1. **DB HARD STOP (already built):** both coupons scoped `applies_to_cohort_slugs='{revalida-2026-2}'`;
   `redeem_coupon()` AND `preview_coupon()` raise `COUPON_NOT_VALID_FOR_COHORT` for any other cohort —
   enforced **inside the atomic charge transaction**. A 2027.1 checkout physically cannot redeem either code.
2. **APP:** codes never surfaced in any 2027.1 context; the offer page defaults to 2026.2; the 2027.1
   nurture (Phase 2) carries no code.
3. **TEST/MONITOR:** smoke-test both codes are rejected on a 2027.1 checkout; assert no 2027.1 order
   ever carries a non-null `coupon_id`.

---

## 7. Email drip campaign

### 7.1 Mechanism
- Each step = an `email_templates` row (admin-editable at `/admin/email-templates`) with a code
  default in `EMAIL_TEMPLATE_DEFAULTS` (`lib/email-render.ts`) so sends never hard-fail pre-seed.
  Add kinds: `lead-d0, lead-d1, lead-d2, lead-d4, lead-d7, lead-final`.
- **D0** sent inline by `captureLeadAndUnlock()` (awaited). **D1+** sent by a daily cron.
- New cron `app/src/app/api/cron/lead-drip/route.ts` (model on
  [lifecycle-notifications](app/src/app/api/cron/lifecycle-notifications/route.ts)), Vercel cron
  ~09:00 BRT. Logic:
  ```
  for each lead where drip_status='active':
    elapsedDays = floor(now - created_at)
    nextStep = the highest step whose offset <= elapsedDays and > drip_step
    if nextStep exists and not already in email_log(lead,step):
      await sendTemplateEmail({ kind: stepKind, to: lead.email, vars })
      log to email_log; update drip_step, last_emailed_at
  ```
  Step offsets (days from capture): D1=1, D2=2, D4=4, D7=7, final=11 (≈ exam-week nudge). Dedup
  through the existing **`email_log`** table (keyed lead+kind) for idempotency.
- **Unsubscribe:** every email footer carries `…/api/leads/unsubscribe?t={unsubscribe_token}` →
  sets `unsubscribed_at`, `drip_status='unsubscribed'`. Add `List-Unsubscribe` header.
- **Stop conditions:** `drip_status != 'active'` (converted/unsub/bounced). Buyers are flipped to
  `converted` by `finalize.ts` (write) **and** filtered out by the cron's paid-order/member exclusion
  (read backstop) — see §6.5 Guarantee A. A purchase at any tier removes the lead immediately, so an
  early R$3.290 buyer never receives the later R$2.990 email.

### 7.2 The 6 emails (pt-BR, ready to seed — `{{var}}` = template variable)

| Kind | When | Subject |
|---|---|---|
| `lead-d0` | min 0 | `Seu Simulado Honesto chegou 👇` |
| `lead-d1` | +1 day | `Você acertou {{score}}/15. O que isso diz sobre 13/09.` |
| `lead-d2` | +2 days | `A conta que ninguém te mostra` |
| `lead-d4` | +4 days | `Seu plano de estudos até 13/09 está esperando` |
| `lead-d7` | +7 days | `Não prometo aprovação. Prometo isto:` |
| `lead-final` | +11 days | `Faltam poucas semanas para a 1ª etapa` |

**D0 — delivery (no pitch).**
> Olá! Seu **Simulado Honesto** está liberado.
> 🔹 Suas 15 questões comentadas da 1ª etapa
> 🔹 Seu baralho de flashcards com revisão espaçada: **{{deckUrl}}**
> Estuda 15 minutos hoje? É o suficiente pra sentir a diferença de estudar com método.
> — Equipe MedHelpSpace
> *(CTA: `Abrir meu material →` {{magnetUrl}})*

**D1 — the honest diagnostic.**
> Você acertou **{{score}}/15**. A média de aprovação da 1ª etapa fica perto de 25% — então cada
> ponto conta. Pelo seu resultado, seus pontos mais fracos agora são **{{weakSpecialties}}**.
> A boa notícia: dá pra virar esse jogo em ~11 semanas, se você revisar as matérias certas, na
> ordem certa. Montamos um plano que prioriza exatamente os seus pontos fracos até 13/09.
> *(CTA: `Ver meu plano até a prova →`)*

**D2 — cost-of-failing receipt.**
> Ninguém gosta de fazer essa conta, mas ela importa:
> • Taxa da prova: **R$410** • A prova custa **R$4.516** em taxas • Reprovar e refazer a 2ª fase:
> **+~R$4.106** — e mais **um ano inteiro** sem poder exercer (e sem o salário de médico).
> O método completo da 1ª etapa custa **R$3.990** — menos do que custa reprovar uma vez.
> *(CTA: `Conhecer o método completo →`)*

**D4 — the plan/transformation.**
> Seu plano personalizado até 13/09 continua aqui, com **{{weakSpecialties}}** no topo da fila.
> Não é mais conteúdo — é a ordem certa: questões comentadas, flashcards com revisão espaçada e
> áudio-aulas, distribuídos dia a dia até a prova. Você sempre sabe o que estudar hoje.
> *(CTA: `Desbloquear meu plano completo →`)*

**D7 — the anti-claim close.**
> Vou ser direto: **não prometo sua aprovação.** Nenhum curso honesto pode. O que eu prometo é que
> você vai resolver mais questões comentadas, com revisão espaçada, do que em qualquer cursão de
> R$10 mil — e se em 7 dias você achar que não é pra você, **devolvo cada centavo, sem perguntas.**
> Feito pra quem se formou fora. Você já é médico — falta o reconhecimento.
> *(CTA: `Garantir minha vaga (7 dias de garantia) →`)*

**D-final — honest urgency.**
> Faltam poucas semanas para a 1ª etapa (13/09) e a turma 2026.2 já está na reta de estudo. Se você
> ainda vai encarar essa prova, esse é o momento de estudar com método — não com volume.
> Seu plano está pronto. É só começar.
> *(CTA: `Começar agora →`)*

Variables to wire: `score`, `weakSpecialties` (comma-joined names), `magnetUrl`, `deckUrl`,
`checkoutUrl` (with UTM + coupon), plus the standard settings chrome (`from_address`, footer, CNPJ).

---

## 8. Build sequence (suggested)

1. `/schema-patch` → `leads` table (§2). Apply to **local** first, then prod.
2. `lib/magnet/questions.ts` + confirm the 15 ids with Karina.
3. `/simulado-honesto` server page + `MagnetQuiz` client (reuse quiz-player) — 5 free in HTML.
4. `actions/magnet.ts` capture/unlock server action (admin client + awaited D0 email).
5. `lib/magnet/plan-preview.ts` (`derivePlan` wrapper) + verify it runs on synthetic signals.
6. Results/offer view (§5) + CTA → `/checkout` with UTM + coupon.
7. Coupons (`RETA2026` R$700 + `ULTIMA2026` R$1.000, both scoped `{revalida-2026-2}`, §6.5) +
   checkout email→lead reconciliation + the `finalize.ts` converted-flip (§6.5 Guarantee A) +
   prefill checkout with the lead's email.
8. 6 email templates: code defaults in `email-render.ts` + seed `email_templates`; verify in
   `/admin/email-templates` (preview + send-test).
9. `/api/cron/lead-drip` + Vercel cron entry + `email_log` dedup + unsubscribe route.
10. **/mobile-check** the magnet + results view (mobile-first rule). Then smoke-test end-to-end with
    a real email — including the **§6.5 safety checks**: (a) a paid order removes the lead from the
    drip; (b) both coupons are REJECTED on a 2027.1 checkout (`COUPON_NOT_VALID_FOR_COHORT`); (c) no
    2027.1 order can carry a coupon — before pointing a single ad at it.

**Hard gate:** do not start ad spend until steps 1–10 pass an end-to-end test AND Resend is verified
in prod (§0). A broken magnet turns the whole $200 into wasted clicks.
```
