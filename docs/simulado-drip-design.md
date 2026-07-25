# Simulado 100Q — funnel & drip design

Design doc for the rebuilt `/simulado-revalida` funnel (question set v2: 100 questões
inéditas no estilo INEP, from Karina's two PDFs). Supersedes the original
finisher/non-finisher drip shipped in `3f917b4`.

Status: **design agreed, not yet built.** Decisions here were made with Justin
2026-07-25.

---

## 1. Guiding decisions

| Decision | Rationale |
|---|---|
| Interactive on-site only — never deliver the PDFs by email | The PDFs are source material. Everything the funnel measures depends on the exam living on the site. |
| No time limit, ever | Two reasons: a countdown scares cold traffic at the exact moment of first contact, and it teaches people that studying with MedHelpSpace is stressful. Brand cost outweighs the authenticity gain. |
| Time is *measured*, never *limited* | Per-question timing is recorded silently and revealed in the report as pacing insight. The pressure comes from the countdown, not the stopwatch. |
| No answers revealed during the exam | It's a simulation. The report is the payoff. |
| Full commented gabarito is free | Karina's ad copy sells "gabarito comentado" as the free offer. The sale comes from experienced quality, not a paywall. |
| Sell *after* the diagnosis, never before | Two invitations: the first once they've seen their performance by área, the second after the commented review. No pitch above the diagnosis. (Karina, 2026-07-25) |
| Completion is a signal, not a prerequisite for selling | Non-finishers will be the majority of a paid-acquisition list. See §3. |
| **No partial diagnosis, ever** | Nothing auto-closes. The score, the per-área breakdown and the commented gabarito are released only once the candidate submits. Reminders may nudge, but partial answers never become a result. (Karina, 2026-07-25 — overrides the earlier 7-day auto-finalize design.) |
| Minimum 50 answers to submit | Without a floor, anyone could submit immediately and unlock all 100 comentários, defeating the rule above. |
| No pacing/time analysis in the report | Dropped: the funnel is explicitly a "try it out when you have time" experience, not a timed test, so elapsed-time stats would be noise. |
| Per-tema results are a LIST, never a percentage | All 100 questions cover distinct temas, so any per-tema rate is 0% or 100% off a single question. The report may say which temas to revisit; it must never conclude what the candidate does or doesn't know. (Karina's catch, and the import confirms it: 100 distinct temas.) |

---

## 2. Entry: start immediately, don't gate on the email round-trip

**The expensive step is not the number of fields — it's leaving the site.**
On-site taps are cheap; an app-switch to the inbox is where the majority of the
drop-off happens, and it happens at the moment of peak motivation.

Flow:

1. Landing page → name, email, and target exam (turma), all on-site.
2. **The exam starts immediately.** No waiting for an email.
3. The resume-link email sends in the background at that same moment.
4. Around question ~10, or on exit intent, a low-key prompt: *"Seu link de retorno
   foi para j***@gmail.com — confirme que chegou."* Verification now serves *their*
   need (a 100-question exam is inherently multi-session) rather than ours.
5. If the address bounces, we still have them live on-site and can prompt for a
   correction. Under an email gate a typo is a silent, total loss.

Turma is collected up front because the drip depends on it, and because one extra
on-site tap costs far less than the round-trip. It is framed as a study question
("Para qual prova você está estudando?"), not a purchase question.

**Deliverability guardrail:** the transactional resume-link email goes to everyone.
The *drip* still requires a verification signal (a click) before it engages —
unverified addresses go to the existing recovery flow first. Never bulk-send
marketing mail to addresses that have never clicked anything.

---

## 3. Segmentation: depth of engagement, not finished/unfinished

"Didn't finish" is not one audience. Four segments, worth very different amounts:

| Segment | Definition | Warmth |
|---|---|---|
| **Cold** | Never clicked / never started | Not really a lead yet — recovery flow, not sales |
| **Bounced** | Started, answered <10 | Curious, but has experienced nothing |
| **Engaged** | Answered 10–59 | Real prospects — invested genuine time |
| **Deep** | Answered 60+, incl. finishers | Warmest. Over an hour with the product |

Someone who answered 70 questions has absorbed nearly as much of the product as a
finisher. Treating them like a 3-question bouncer wastes the best non-buyer
segment on the list.

**Depth sets how long we wait before asking for the sale**, not whether we ask.
Shallow segments get a longer value runway first (sample commented questions, the
pacing insight, a study-plan taste); deep segments can be asked much sooner
because they've already seen the quality.

---

## 4. One sales spine, different on-ramps

Not parallel finisher/non-finisher tracks that fork forever — that is exactly how
non-finishers get forgotten, and it doubles the copy to maintain. Everyone
converges on the same core sales sequence. What differs is **how long before they
enter it** and **how personalized the opening is**.

```
Day 0      Resume-link email (transactional)
Days 1–7   Finish nudges carrying a bare PROGRESS COUNT only
~Day 7     PIVOT — stop asking them to finish.
           The attempt stays open; nothing is finalized.
Day 8+     Sales sequence. Same spine for everyone.
           Segmented by engagement depth and turma, NOT by score.
```

**The nudge carries a progress fact, not a diagnosis.** *"Você respondeu 68 de
100 — faltam 32 para liberar seu diagnóstico e o gabarito comentado."* No score,
no per-área numbers, no comentários. This satisfies Karina's rule literally while
keeping the reminder personal, and it is a *stronger* completion driver than a
partial report, because the reward stays whole and withheld.

Two edge cases the nudges must cover:

- **All 100 answered but never submitted** gets its own message — *"você
  respondeu todas as questões, falta só entregar"* — since that candidate is one
  tap from the payoff.
- **Fewer than 50 answered** cannot submit at all, so the nudge must say what the
  threshold is rather than inviting a submission that will be refused.

**Nothing auto-closes and nothing expires.** The attempt stays open indefinitely
and the link keeps working, so someone who returns at day 60 and finishes gets the
full report and jumps to the warmest on-ramp. Never lock anyone out of what they
were promised.

The ~7-day pivot is a guess and is the single most testable number in the design.
Instrument it deliberately.

---

## 5. Exam-date intelligence layered on top

`cohorts.test_date` for the lead's target turma compresses or stretches the whole
sequence, and selects which content to send:

| Phase | Days to exam | Cadence & content |
|---|---|---|
| Distante | >180 | Wide spacing. Habit-building, breadth |
| Preparação | 180–90 | Systematic coverage, weak-área work |
| Reta final | 90–30 | Compressed. Triage, high-yield, simulados, real urgency |
| Véspera | <30 | Revisão, confidence, logistics — and stop selling |

Requirements this implies:

- The turma picker is **driven from `cohorts`** (`active`, ordered by `test_date`)
  — deliberately NOT filtered by `is_for_sale`. Karina's reasoning (2026-07-25):
  the picker segments, it doesn't sell. Without 2026.2 as an option, everyone
  sitting the September exam is silently misfiled as a 2027 prospect and can
  receive sales mail about an exam that is days away. **Built in Phase 1.**
- **2026.2 leads are value-only until after 13/09/2026** — that turma is closed
  for sale and their exam is imminent, so they get content and no offer, then roll
  to 2027.1 afterwards.
- `leads.target_cohort` must become an FK to `cohorts.slug` rather than a
  hardcoded CHECK allowlist, which currently rejects any newly added turma.
- **Leads whose target exam date has passed must stop receiving prep mail** and be
  rolled to the next turma or re-asked. Nothing prevents this today.
- **"Ainda não decidi" leads have no date**, so no timing logic applies. They get a
  short track whose only job is to obtain the answer, then merge into the timed
  sequence. `previous_target_cohort` already records the change.
- Templates select on *(funnel step × phase)*, with vars `{{cohortName}}`,
  `{{testDate}}`, `{{daysUntilTest}}`, `{{phase}}`.

---

## 6. Measurement

Judge on **revenue per lead, segmented by engagement depth** — not open rates,
and explicitly not completion rate. If someone answers 30 questions, never
finishes, and buys, that is a total success and the funnel must allow it.

Secondary signals worth watching:

- Drop-off by question number — a spike at one question usually means that
  question is confusing or broken, not that the audience is weak
- Most-missed questions across the whole audience — either a concept worth
  teaching or a question worth replacing
- Which ads produce **depth**, not just signups. Optimizing on signups is the
  standard way to waste paid budget on this kind of offer
- Head-to-head against `/questoes-revalida` and `/flashcards-revalida` on verified
  -lead rate and purchases, not CPL
