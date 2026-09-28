# ClinAct — WhatsApp floating button (scope for the ClinAct chat)

**Source:** Karina, e-mail "WhatsApp Business", 2026-09-28 (thread `1a0e858fb45fbc02`).
**Status of the Revalida half:** built in the MedHelpSpace chat on 2026-09-28 (homepage + `/loja`),
in test mode. This document is the hand-off so the ClinAct sales page gets the **same button,
the same mechanism, and the same test-first process**. Nothing here is built yet for ClinAct.

## What Karina asked (applies to both products)

- A **floating** WhatsApp button, fixed **bottom-right**, always visible while the page scrolls.
  Green circle, white WhatsApp glyph, discreet. **Not** a large button and **not** a block inside
  the page content.
- Works on **desktop and mobile**, keeps a margin from the side and bottom edges, and **never covers
  other important elements**.
- Click → phone opens the WhatsApp app; computer opens WhatsApp Web / desktop app; the message
  for that page arrives **pre-filled**.
- **Test-first:** ship it so that **only admins can see it**, tell her how to check on desktop and
  mobile, and make it public **only after she confirms**.

ClinAct link (hers, verbatim):
`https://wa.me/5575988672544?text=Ol%C3%A1%21%20Vim%20pelo%20site%20da%20MedHelpSpace%20e%20gostaria%20de%20saber%20mais%20sobre%20o%20ClinAct`
Message: **"Olá! Vim pelo site da MedHelpSpace e gostaria de saber mais sobre o ClinAct."**

## What already exists (reuse, do not rebuild)

| Piece | Where | Notes |
|---|---|---|
| Number, messages, gate keys, URL builder | `app/src/lib/whatsapp.ts` | Pure module. `WHATSAPP_MESSAGES.clinact` and `WHATSAPP_GATE_KEY.clinact = "whatsapp-clinact"` are **already defined**. `whatsappUrl("clinact")` builds the wa.me link. |
| The button | `app/src/components/marketing/whatsapp-button.tsx` | Client component: `<WhatsAppButton product="clinact" published={bool} />`. Renders nothing until mounted; then shows when `published \|\| isAnyAdmin()` (auth context). Waits while the analytics consent card is unanswered. Adds `var(--mhs-bottom-bar-h)` to its bottom offset. Amber dot + tooltip when an admin is looking at an unpublished button. Fires GA event `whatsapp_click {product, page}`. |
| Gate reader (server) | `getSitePagePublished(page)` in `app/src/lib/queries/site-sections.ts` | Reads `site_pages.published`; missing row / DB error ⇒ `false` (fails closed). Mock mode ⇒ `true`. |
| Gate writer (server action) | `app/src/actions/site-pages.ts` | `getSiteGate(page)` / `setSiteGate(page, bool)`. super_admin only, audited (`site_gate_publish` / `site_gate_unpublish`), revalidates the paths listed in its `GATES` map. **ClinAct must add its key there** (see below). |
| Admin toggle UI | `app/src/app/admin/settings/site-toggles.tsx` | Card "Site" on `/admin/settings`, super_admin only. Currently hard-wired to the Revalida gate; ClinAct adds a second row (or a second card) — strings via i18n keys under `settings.*` in **both** `locales/admin/pt-BR.json` and `en.json`, merged key by key (never assign `settings` wholesale). |
| Seed | `schema-patch-whatsapp-button.sql` | Inserts `site_pages('whatsapp-revalida', false)`. |
| Tests | `app/tests/whatsapp-button.test.ts` | Asserts both messages match Karina's links, both Revalida pages mount the button, the yield rules, the super_admin guard. Extend, don't duplicate. |

## What the ClinAct chat has to do

1. **Mount** `<WhatsAppButton product="clinact" published={published} />` on the ClinAct **sales page
   only** (`app/src/app/clinact/page.tsx`), where `published = await getSitePagePublished(WHATSAPP_GATE_KEY.clinact)`.
   Place it at the end of the page tree, like the Revalida pages do.
   - The sales page is itself unpublished (`site_pages('clinact')`), so today only admins reach it
     anyway. Keep the two gates **independent**: the button's own gate decides whether visitors see
     the button once the page goes public.
   - Do **not** mount it on `/clinact/treinar`, the case player, or anything under the member area.
     The case player has its own fixed bottom controls; a contact button there would cover them.
2. **Gate map:** in `actions/site-pages.ts` add `[WHATSAPP_GATE_KEY.clinact]: ["/clinact"]` to `GATES`
   (the comment in the file marks the spot). Without it, `setSiteGate` refuses the key.
3. **Seed both databases:** a `schema-patch-whatsapp-button-clinact.sql` with
   `INSERT INTO site_pages (page, published) VALUES ('whatsapp-clinact', false) ON CONFLICT (page) DO NOTHING;`
   Run on prod (`node scripts/run-sql.js …`) **and** local (`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/run-sql.js …`).
4. **Admin toggle:** extend `site-toggles.tsx` so super_admin can flip the ClinAct gate too
   (label: "Botão do WhatsApp (página do ClinAct)"). Add the i18n keys in both locales.
5. **Bottom-corner check on the ClinAct sales page:** the Revalida button rides above the landing's
   mobile "Comprar Agora" bar through `--mhs-bottom-bar-h`, which that bar publishes while visible.
   If the ClinAct sales page has (or gets) a docked bottom element, that element must publish its
   measured height the same way (ResizeObserver → `document.documentElement.style.setProperty("--mhs-bottom-bar-h", …)`,
   cleared on hide/unmount). Do not hardcode a padding.
6. **Mobile-first check** at 375 / 414 / 768 and desktop: button visible bottom-right with a margin,
   nothing important covered, tap target ≥ 44 px (it is 56 px), no horizontal overflow.
   Test the click on a real phone: the WhatsApp app must open with the ClinAct message pre-filled.
7. **Tests:** add a case to `whatsapp-button.test.ts` asserting the ClinAct sales page mounts
   `product="clinact"` behind `WHATSAPP_GATE_KEY.clinact`, and that no member/player route imports the button.
8. **Reply to Karina** for the ClinAct half in the same thread (pt-BR, signed "Claude"): how to test
   (log in as admin, open `/clinact` on desktop and phone), and that it stays admin-only until she
   confirms. The MedHelpSpace chat already drafted the Revalida half and told her the ClinAct button
   follows through the same mechanism.

## Invariants to respect

- **Never public before Karina confirms.** The gate defaults to `false`; only super_admin flips it.
- **Messages are code constants** in `lib/whatsapp.ts`, not editable copy — a stray edit must not
  change what a lead sends.
- **ClinAct work stays in the ClinAct chat**; MedHelpSpace/Revalida changes stay out of that session
  (Justin's standing rule).
- The ISR pages are cached per path, not per viewer: the admin check is **client-side** from the auth
  context. Never branch the server HTML on the viewer for these pages.
