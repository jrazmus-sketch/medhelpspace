# ClinAct — Sales page (`/clinact`): spec + architecture assessment

Karina's brief: e-mail **"Página de Vendas", 2026-09-01**. She explicitly asked
that it **not** be built yet — this file exists so the decisions are recorded
before step 3 (the commercial stage) starts, and so her copy is not re-derived
from an e-mail thread later.

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

## 3. Six things to settle *before* implementing

1. **The hero CTA has no working destination today — this is the one real
   blocker.** `/clinact/treinar` requires a login (the `(membro)` layout
   redirects). So "Experimentar gratuitamente" must either go to **signup with
   `?next=`**, or we allow **anonymous play** of the free cases.
   *Recommendation: signup-first.* An attempt needs a `user_id` to be recorded;
   Minha Evolução — a headline selling point two sections above — cannot exist
   without an account; and signup feeds the lead funnel we already run. Anonymous
   play would need anonymous attempt storage and would still have to force a
   signup before showing any progress. **Karina's call, but it changes the build.**

2. **Prices must not be editable strings.** On the Revalida landing the price
   comes from the DB (cohort record), not from `site_content`. If the ClinAct
   price is a free-text row and the checkout reads a plan config, the page can
   advertise R$ 29,90 while PagBank charges something else — a CDC problem, not
   just a bug. **Plan config is the single source; the page renders it.** Only the
   descriptive copy around the number is editable.

3. **The renewal/billing line must be exempt from the visibility toggle.** Her
   list has both "visibilidade das principais seções" and "textos legais
   exibidos junto aos planos". Those must not intersect: nobody should be able to
   publish plans with the auto-renewal terms hidden.

4. **The Minha Evolução screenshot should be an uploadable image slot**, not a
   build-time asset — otherwise it goes stale and needs a deploy to refresh
   (we already carry that debt elsewhere; see `project_screenshot_placeholders`).

5. **Never hand-type the case count.** She is right to omit it at launch. When it
   becomes a selling point it must be a live count via `vars`, never a typed
   number that rots the week after.

6. **Sequencing.** The free-cases CTA works today; plan buttons cannot until step
   3. Recommend shipping the page with the free path live **before** checkout
   exists — it starts collecting free-tier signups while payments are being built.

---

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
