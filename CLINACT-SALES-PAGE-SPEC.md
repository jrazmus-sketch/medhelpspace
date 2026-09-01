# ClinAct — Sales page (`/clinact`): spec + architecture assessment

Karina's brief: e-mail **"Página de Vendas", 2026-09-01**; **architecture and all
six open points approved by her the same day** (reply 2026-09-01 14:10 UTC).
This file is the decided spec for step 3 — not a proposal.

Status: **not implemented.** `/clinact` today is the placeholder from step 1
(public, dark-only, "Em breve" / "Entrar nos casos").

---

## 1. Positioning (hers, verbatim in structure)

The page is **not** a feature list. The visitor must move through:

> problema → proposta → experiência → diferenciais pedagógicos → acompanhamento
> → experimentação gratuita → assinatura

| # | Section | Core message |
|---|---|---|
| 1 | **Hero** | "Raciocínio que termina em decisão." Sub: "Treine como conectar pistas, conduzir casos, priorizar sob pressão e reavaliar quando o cenário muda." Definition: plataforma de treinamento de raciocínio clínico e tomada de decisão para internos e médicos recém-formados. CTA: *Experimentar gratuitamente* / secondary *Conhecer o ClinAct*. **Do not open with the number of cases.** |
| 2 | **O problema** | "Saber Medicina não é o mesmo que saber decidir." Questions: qual pista importa · o que fazer primeiro · que exame agora · isso muda minha hipótese · estou confiante porque sei ou porque estou ancorado. Close: "É isso que o ClinAct treina." |
| 3 | **Quatro competências** | **Conectar · Conduzir · Priorizar · Reavaliar** (not "quatro modalidades"). Código Clínico→conectar, Clínica em Cena→conduzir, Decisão em 30 Segundos→priorizar, Ponto de Virada→reavaliar. One of the page's main visual blocks. |
| 4 | **Casos interativos, não questões disfarçadas** | Show the experience (esp. Clínica em Cena). Key line: "A informação não precisa aparecer antes da decisão. Ela pode aparecer porque você decidiu buscá-la." Screenshots/GIFs later. |
| 5 | **Mídia como informação clínica** | "Veja e ouça quando isso faz parte da decisão." ECG, RX, TC, USG, sopros, sons pulmonares — selected and audited, revealed by the investigation. Never decorative. |
| 6 | **Não importa apenas se acertou** | Confiança Baixa · Média · Alta. "O ClinAct não mostra apenas onde você errou. Mostra onde você estava convencido de que estava certo." Highlight **erro com alta confiança**. |
| 7 | **Minha Evolução** | Treinos, desempenho geral, por formato, distribuição de confiança, erros com alta confiança. First completed attempt stays the reference; refazer treina sem apagar. Wants a real screenshot slot. |
| 8 | **Revisão espaçada** | "Revisite o raciocínio no momento certo." Cases come back per performance and confidence; errors that deserve attention return sooner. |
| 9 | **Leve deste caso** | Visual highlight. A rule of reasoning transportable to the next patient — transfer, not memorising the answer. |
| 10 | **Biblioteca** | **Do not publish the case count at launch.** "Uma biblioteca viva, em expansão contínua." / "Novos desafios, toda semana." Each case built to train one decision, clinically and pedagogically reviewed. |
| 11 | **Quatro casos gratuitos** | Prominent. "Experimente o ClinAct antes de assinar." One free case per format, listed. CTA *Experimentar os 4 casos*. **Permanently free, not a trial.** |
| 12 | **Para quem é** | Internos de Medicina, médicos recém-formados; secondarily advanced clinical students. |
| 13 | **O que é e o que não é** | "Não é curso. Não é banco de questões. Não é videoaula. É treino." Optional, must be hideable. |
| 14 | **Planos** | Mensal R$ 29,90/mês · Anual R$ 299/ano ("dez mensalidades, doze meses", ≈ R$ 24,92/mês). Auto-renewal per modality. Renewal/billing terms must be clearly visible. |

**Editability requirement:** everything above editable from the admin without a
deploy, like the Revalida landing — headline, section copy, bullets, CTA text
**and destination**, plan copy, FAQ, legal text, **section visibility** (hide
without deleting) and ideally **section order**. Explicitly *not* a generic page
builder: "um editor estruturado e seguro, específico para a página do ClinAct".

---

## 2. Assessment — what the existing architecture already gives us

Roughly **85% of her list is the pattern we already run on two landings.**

| Need | Existing mechanism | New work |
|---|---|---|
| All copy editable | `site_content` (flat `key → value`, public read, admin write) + `<SiteText k fallback>` reading a map seeded once in the root layout (`getSiteContent`, React-cached) | none — add `clinact.*` keys |
| Inline editing UI | `EditableText` + `actions/inline-edit.ts` + `PublicEditToggle`; revalidates the page on save | none — add `/clinact` to the revalidate list |
| Safe defaults | A missing row renders the hardcoded `fallback` — deleting a row never breaks the page | none |
| Live numbers in copy | `vars={{ token }}` interpolation in `SiteText` | none |
| Per-product namespace | Precedent: `fc.*` powers the whole flashcards landing (28 rows on prod) | none — use `clinact.*` |
| Dark-only public page | `/clinact` is already outside the theme-unlocked zone, same as the Revalida landing | none |

**What genuinely does not exist yet** (and is the only new architecture needed):

1. **Section visibility.** `site_content` stores strings only. Do **not** encode
   this as `"true"` / `"false"` strings — a typo silently means "visible".
2. **Section order.** Sections are JSX in source order today.
3. **Editable CTA destinations.** `SiteText` edits *text*; `href`s are hardcoded.

**Recommendation:** one small table, not a builder —

```sql
site_sections (page text, key text, visible boolean, position int, PRIMARY KEY (page, key))
```

plus an admin screen (`/admin/clinact/pagina`) listing the sections with a
checkbox and up/down arrows. The page renders sections from that order and skips
the hidden ones. That is exactly her "editor estruturado e seguro" and it is
reusable by the Revalida landing later.

**CTA destinations should be a fixed dropdown, never free text.** Same reasoning
that made `/r/<code>` sanitise `destino`: a free-text href on a public page is a
broken-link and phishing vector. Allowed targets: signup, the four free cases,
`/clinact/treinar`, checkout (when it exists), page anchors.

---

## 3. The six open points — decided by Karina, 2026-09-01

She approved the architecture and ruled on every point. These are decisions, not
options; the build follows them.

1. **Free-trial entry: signup-first. DECIDED.** "Experimentar gratuitamente"
   leads to **free account signup**, and after signup/login the user lands on the
   four free cases. **No anonymous access** — her reason is ours: preserve the
   attempt, the confidence answer and Minha Evolução.
   *Build note (verified in the code, not assumed):* **signup has no `next`
   support today.** `/signup` never reads it and `/auth/signup` hardcodes
   `emailRedirectTo: ${origin}/auth/confirm`. `/auth/confirm` *does* already
   honour `next` (defaulting to `/app`), so the missing link is only the middle:
   the signup page must read `?next=`, the form must forward it, and the route
   must append it to `emailRedirectTo`. Small, but real work — and it must stay
   allowlisted (see the note below).

2. **Prices come from the plan/checkout config. DECIDED.** The displayed value
   reads from the official plan configuration as the single source; only the
   commercial copy around the number is editable. (Reason on record: an editable
   price string that disagrees with what PagBank charges is a CDC problem, not a
   bug.)

3. **Renewal and billing terms cannot be hidden. DECIDED.** The mandatory
   renewal/billing information is excluded from the section-visibility toggle —
   it can never be hidden together with the plans section.

4. **Screenshots are admin-replaceable. DECIDED.** The Minha Evolução screenshot
   and, where possible, the other product demo images are swappable from the
   admin with no deploy.
   *Build note:* store the image URL in `site_content` and reuse the existing
   Bunny upload path, so an image slot is just another editable field.

5. **No case count at launch. DECIDED.** When the number is eventually used
   commercially it must be **computed from the published library**, never typed
   by hand.

6. **Do NOT publish the page before checkout works. DECIDED — this overrides my
   recommendation.** I proposed shipping the page early with only the free path
   live, to start collecting signups. She prefers not to put a public sales page
   in the air while its flow is incomplete: build it, keep it ready for her
   review, and make it public only when **signup + four free cases +
   subscription** all work end to end.
   *Build note:* this needs a page-level published flag. `/clinact` keeps serving
   today's placeholder to the public while admins see the full page for review;
   flipping one flag makes it public. Same draft/published shape the cases
   already use — no separate preview URL, no risk of the real page leaking early.

**Done ahead of the build (2026-09-01):** `/auth/confirm` builds its redirect as
`${origin}${next}`, which turns `next=@evil.com` into a different HOST — an open
redirect off a *successful* confirmation. Nothing feeds `next` into signup links
today, so it was latent; decision 1 is precisely what would have made it
reachable. `next` now passes through the same `safeDestination()` guard the `/r/`
ambassador links use, with a regression test for the userinfo vector.

Also explicitly approved: hide/show sections without deleting, reorder sections,
CTA destinations from a closed and safe list, and reusing the Revalida editing
mechanics while keeping ClinAct's own visual identity.

## 4. Revalida components — reuse map

Reuse the **mechanics**, not the identity.

**Reuse as-is:** `SiteText` / `SiteContentProvider`, `EditableText` +
`actions/inline-edit.ts`, `landing-nav`, `landing-footer`, `sticky-cta-bar`,
`faq-section`, `mid-cta`, `announcement-bar`, `footer-access-links`.

**Reuse the shell, new content:** `hero-section` (structure only — ClinAct needs
its own hero treatment), `problem-section` (her §2 *is* a problem section),
`pricing-cta` / `plano-section` (card layout; prices from plan config),
`desktop-showcase` / `platform-tour` / `app-mockup` (for §4 "show the product"),
`revisao-section` (her §8 is the ClinAct version of it).

**Do not reuse — Revalida identity:** `specialty-mosaic`, `sixty-d-section`,
`stats-numbers` / `stats-section` (Revalida-specific claims), `founder-section`,
`memorecards-carousel`, `identity-band`, `word-cycle`, `theme-demo-section`.

**New, ClinAct-only (the page's signature):** the four-competency block (§3) —
this must not read as a Revalida feature grid; the confidence / erro-com-alta-
confiança block (§6); "Leve deste caso" (§9); the four-free-cases block (§11).

---

## 5. Estimate

- Copy + sections + `clinact.*` seeds, reusing the components above: ~2 days.
- `site_sections` (visibility + order) + `/admin/clinact/pagina`: ~1 day.
- Screenshot slots + the four-competency and free-cases signature blocks: ~1 day.

Total ≈ **4 days**, inside step 3, independent of the PagBank account release
(only the plan buttons depend on that).

**Publish gate (her decision 6):** the page ships behind a page-level published
flag. It goes public only when signup → four free cases → subscription work end
to end — so the page being "done" and the page being "live" are two separate
events, and the second one is hers to trigger after review.
