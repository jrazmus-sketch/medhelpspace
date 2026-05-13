# MedHelpSpace Migration — Project Context

## Development rules

- **Mobile-first layout**: Every layout change must be optimized for mobile in the same session. Think through the mobile experience deeply before finishing — don't leave responsive fixes for later.

## What this project is

Migrating medhelpspace.com.br — a Brazilian Portuguese medical exam prep
membership site for the Revalida licensing exam — from WordPress to a new stack.

Current stack: WordPress + Divi + WooCommerce + PagBank + PMPro + H5P +
ZoomSounds on IONOS shared hosting (US-based, serving Brazilian audience).
Target stack: **Next.js 16 App Router + Supabase** (confirmed). App lives in `app/` subfolder.

Working directory: `C:\Users\jrazm\claudebuilds\medhelpspace\`
Source data: UpdraftPlus database backup (`*.gz` file in this folder).
Content language: Brazilian Portuguese. Preserve all original text exactly.

## Project files

| File | Purpose |
|---|---|
| `db.sql` | UpdraftPlus dump, 136 MB, decompressed from the `.gz` backup |
| `page-inventory.csv` | Output of `build_inventory.py` — one row per page with type classification |
| `build_inventory.py` | Streams `db.sql`, classifies every page, writes the CSV |

## Page type taxonomy (verified via inventory)

| Type | Count | Description |
|------|-------|-------------|
| `plain-content` | 473 | Heading + `[et_pb_text]` modules, narrative content |
| `text-lesson` | 220 | Toggle-based lessons with prose body (203 `-simulados` + 17 MedVoice) |
| `h5p-quiz` | 204 | H5P embeds via `[h5p id=N]` shortcode OR `<iframe data-content-id=N>` |
| `blurb-nav-hub` | 63 | Topic hub pages using `et_pb_blurb` card grids with `post_link_url_page` |
| `skip` | 14 | WooCommerce, PMPro, mhs-dashboard, shop listing — NOT migrated |
| `audio-lesson` | 1 | cardiologia-medvoice (id 3606), has `[zoomsounds_player]` shortcode |
| `navigation-toggle` | 1 | Toggle bodies containing only `<a>` links |
| `unclassified` | 1 | Home page — OUT OF SCOPE (rebuild natively) |

## Site information architecture

- 12 medical specialties (Cardiologia, Pneumologia, Reumatologia, etc.)
- Each specialty has 4 view types: main hub, `-formula`, `-resumos`, `-simulados`
- Per-topic H5P quiz pages for each specialty
- MedVoice, Audiocards, and Flashcards are cross-cutting content tracks (each covers most specialties)
- MedHelp 60D is a date-gated content module (37 pages: Revalida Up + Memorecards sub-sections)

## Decisions locked in

- **Orphaned H5P refs** (relacoes-uterofetais, rotura-prematura-de-membranas,
  tohchs — H5P IDs 176, 177, 163 don't exist in `wp_h5p_contents`):
  migrate as **drafts**, flagged in notes for content team review.
- **Incomplete blurb-nav-hubs** (14 OB-GYN + Pediatrics hubs with empty
  `link_option_url`): migrate as **drafts**, flagged for content team.
- **Home page**: out of scope. Rebuild natively in new stack.
- **WooCommerce/PMPro/dashboard (14 pages)**: skip entirely; rebuild natively.
- **Audio storage**: keep Bunny CDN (`medhelpspace.b-cdn.net`). Don't move files.
- **Membership model**: cohort-based (not PMPro level-based). Two cohorts seeded:
  `revalida-2026-2` and `revalida-2027-1`. Both grant identical base content access;
  they differ only in time windows and when the MedHelp 60D module unlocks.
- **MedHelp 60D module**: 37 pages (WP id 3018 + all `parent_id` descendants) are
  gated behind this module. Unlock date = `cohorts.test_date - 60 days`, maintained
  automatically by trigger. Identify descendants by recursive walk from id 3018
  (`slug = medhelp-60d`); tag every page in the subtree with `content_module_id = 1`.

## Schema (see schema.sql for full DDL)

Tables and their purpose:

| Table | Purpose |
|---|---|
| `cohorts` | One row per exam cycle; holds `test_date` and membership window |
| `user_cohort_memberships` | User ↔ cohort join |
| `content_modules` | Named date-gated sections; `unlock_offset_days` drives the unlock date |
| `cohort_module_access` | Per-cohort unlock date for each module; trigger-maintained from `test_date` |
| `specialties` | 12 core specialties (seed rows in schema.sql) |
| `tracks` | Cross-cutting content series: `medvoice`, `audiocards`, `flashcards` |
| `pages` | All migrated pages; carries `specialty_id`, `view`, `track_id`, `content_module_id`, `notes` |
| `lessons` | One row per toggle (text-lesson / audio-lesson); `audio_url` nullable |
| `quiz_questions` | H5P QuestionSet → one row per MCQ; `answers` as JSONB `[{text, correct, feedback}]` |
| `flashcard_items` | H5P CoursePresentation+Dialogcards → one row per card; `text` / `answer`; `group_position` = slide index |
| `presentation_slides` | H5P CoursePresentation+AdvancedText/Image → one row per slide; for memorecards pages |
| `nav_items` | Blurb cards and link lists from hub pages; `target_page_id` null = incomplete |

**Access control** (RLS): pages with `content_module_id IS NULL` require active cohort
membership. Pages with a module set also require `cohort_module_access.unlock_date <= today`
for the user's cohort. Two helper functions (`user_has_active_membership`,
`user_has_module_access`) keep RLS policies readable.

**Track pages** get `track_id` set during import (identified by recursive `parent_id` walk from each track hub):
- medvoice: 19 pages (hub WP id 2985, slug `medvoice`)
- audiocards: 18 pages (hub WP id 3690, slug `audiocards`)
- flashcards: 18 pages (hub WP id 3767, slug `flashcards`)

Track pages may also carry `specialty_id` and `view`; the two fields are orthogonal.
The schema stores lessons as atomic toggle units; how they render (tabs, sub-pages, toggles)
is a frontend decision deferred to the new app.

**H5P routing** (library_id only): all 209 H5P rows are one of two library types:
- `library_id = 15` (H5P.QuestionSet) → `quiz_questions` rows
- `library_id = 35` (H5P.CoursePresentation):
  - slides contain H5P.Dialogcards → `flashcard_items` rows (all *-flashcards pages)
  - slides contain H5P.AdvancedText / H5P.Image → `presentation_slides` rows (all *-memorecards pages)

## Parser rules (for content extraction)

### Universal cleanup
- HTML entity decode: `&#8221;` → `"`, `&#8243;` → `"`, etc.
- Strip Divi attribute soup: `_builder_version`, `_module_preset`,
  `global_colors_info`, `border_radii`, `box_shadow_*`, `custom_padding`,
  `hover_enabled`, `sticky_enabled`, etc. Keep ONLY structurally meaningful
  attributes (e.g. toggle `title`, blurb `post_link_url_page`).
- Strip Notion paste artifacts: `<!-- notionvc: ... -->`.
- Strip empty `<a>` wrapper tags around images.
- Strip `wp-image-NNNN` classes from img tags.
- Strip emoji and stethoscope bullet-point images (decorative only;
  replace at render time in new app).
- Trim whitespace on toggle titles. Title-case inconsistent titles
  (some are ALL CAPS, some lowercase, some Title Case).

### Per-type rules
- **text-lesson with mixed-toggle-types**: distinguish content toggles
  (prose inside) from nav-link toggles (only `<a>` tags inside). Strip
  nav-link toggles during extraction; they're page-level navigation, not
  lesson content. Use the `RE_LINK_ONLY` pattern: `^\s*(<a\b[^>]*>.*?</a>\s*)*\s*$`.
- **audio-lesson**: ZoomSounds shortcode is `[zoomsounds_player ... source="URL"]`
  — attribute is `source=`, not `src=`. Audio is per-toggle: one shortcode lives
  inside each toggle body. Extract the URL from each toggle's raw content, assign to
  `lessons.audio_url` for that toggle, and strip the shortcode from `body_html` before
  cleanup so only the transcript remains.
- **h5p-quiz**: handle both `[h5p id="N"]` shortcode AND `<iframe
  data-content-id="N">` patterns. Both resolve to `wp_h5p_contents.id`.
  Parse the `parameters` JSON column for question content.
- **blurb-nav-hub**: extract `post_link_url_page` from each `[et_pb_blurb]`.
  Blurb card page links are encoded as `@ET-DC@<base64>@` in
  `_dynamic_attributes="link_option_url"` — not literal URLs. Decode at
  parse time. The decoded JSON is `{"dynamic":true,"content":"post_link_url_page",
  "settings":{"post_id":"NNNN"}}` — use `settings.post_id` directly as the WP
  post ID (no slug lookup needed). If empty, flag as incomplete (the 14 draft hubs).
- **flashcard_items schema**: `text` = front/prompt side (H5P `dialogs[].text`);
  `answer` = back/answer side (H5P `dialogs[].answer`); `group_position` = slide
  index within CoursePresentation; `position` = card index within the slide.
- **All internal links**: resolve URLs/slugs to target `pages.id`
  (foreign key) instead of storing URLs. Survives any future URL changes.
- **Bare-slug hrefs in body_html**: `RE_A_HREF` only resolves full
  `https://medhelpspace.com.br/...` URLs. Relative hrefs like
  `<a href="some-slug">` are left as-is. One known instance: page_id=261
  (`objetivas-comentadas`) body contains a bare-slug link to
  `manejo-inicial-do-desconforto-respiratorio-no-recem-nascido`. The new
  app's link renderer must handle bare-slug hrefs by looking them up in
  `pages.slug`.

### Slug deduplication: WordPress vs. flat schema

**Problem**: WordPress enforces slug uniqueness per parent (full URL path),
not globally. Two pages under different parents can share the same `post_name`.
Supabase uses a flat `pages.slug` column with a unique constraint, so these
collide on import.

**Affected pages** (patched directly in `parsed/pages.sql`; do NOT re-run
parser without adding `SLUG_OVERRIDES` — see below):

| WP id | Original `post_name` | Disambiguated slug | Parent | Type |
|-------|---------------------|-------------------|--------|------|
| 1450 | `manejo-inicial-do-desconforto-respiratorio-no-recem-nascido` | `…-quiz` | `objetivas-comentadas` | `h5p-quiz` |
| 3589 | `manejo-inicial-do-desconforto-respiratorio-no-recem-nascido` | `…-formula` | `formula-medhelp` | `plain-content` |
| 5279 | `neoplasias-do-sistema-nervoso` | `neoplasias-do-sistema-nervoso-resumos` | `neurologia-resumos` | `plain-content` |
| 5274 | `neoplasias-do-sistema-nervoso` | *(unchanged — canonical)* | `neurologia` | `plain-content` |

**Suffix convention**: append the page's `view` field value — `-quiz`,
`-formula`, `-resumos`, `-simulados`, `-hub` — to the non-canonical copy.
For id=5279 the title already said "Resumos" so `-resumos` was the natural choice.

**If the parser is ever re-run**, add this dict before the content-parsing loop
and substitute `SLUG_OVERRIDES.get(pid, slug)` when building `rows_pages`:

```python
SLUG_OVERRIDES = {
    "1450": "manejo-inicial-do-desconforto-respiratorio-no-recem-nascido-quiz",
    "3589": "manejo-inicial-do-desconforto-respiratorio-no-recem-nascido-formula",
    "5279": "neoplasias-do-sistema-nervoso-resumos",
}
```

## SQL parser gotcha

UpdraftPlus lines end with `); \n` (space before `\n`). Always use
`.rstrip()`, not `.rstrip("\n")`, or the INSERT buffer never flushes.

## Audio handling

- `audio_url` is nullable on lessons. Adding audio later is one UPDATE.
- New admin UI must support:
  - Per-lesson upload (one-off additions)
  - Bulk folder upload with filename-to-lesson matching (initial bulk add)
- Audio coverage dashboard: show % of lessons with audio per specialty.

### MedVoice audio — populated

Bunny CDN structure: `https://medhelpspace.b-cdn.net/MedVoice-Audio/{specialty-slug}-feito/{title-slug}-m.mp3`

- Title slug = lesson title lowercased, accents stripped (NFD), spaces→hyphens, `-m.mp3` suffix
- Script: `scripts/populate-medvoice-audio.js` — dry run by default, `--apply` to commit

**7 specialties have audio (94 lessons populated):**
`cirurgia-geral`, `clinica-medica`, `ginecologia`, `medicina-de-emergencia`, `obstetricia`, `pediatria`, `saude-coletiva`

**Gotcha:** the DB page slug for medicina-de-emergencia is `emergencia-medvoice` (not
`medicina-de-emergencia-medvoice`). The script has a manual mapping for this.

**Not yet populated:** cardiologia, dermatologia, endocrinologia, gastroenterologia,
hematologia, infectologia, nefrologia, neurologia, pneumologia, psiquiatria, reumatologia
(no Bunny folders exist for these yet).

**Audiocards audio:** not yet uploaded to Bunny. Same approach will apply when ready —
update script with audiocards folder structure and re-run.

### MedVoice page type note

Only `cardiologia-medvoice` was classified `audio-lesson` by the parser (it had ZoomSounds
shortcodes). All other MedVoice pages are `text-lesson` type. Both are handled by
`TextLessonRenderer`, which will show an audio player per section when `audio_url` is set
(player not yet added to renderer — pending).

## Things explicitly NOT to migrate

- Divi inline styles (rebuild semantically in new theme)
- WordPress media library classes
- Emoji + bullet-point image decorations
- WooCommerce checkout/cart/account pages
- PMPro account/billing pages
- Dashboard pages with `[mhs_welcome_bar]` / `[mhs_updates_ticker]`
- The custom updates ticker plugin (rebuild as React component)

## Status tracker

- [x] Recon complete (page type universe identified)
- [x] Inventory CSV generated (`page-inventory.csv`)
- [x] Migration decisions made
- [x] Schema design finalized (schema.sql + schema-design.md — pending final team review)
- [x] Parser implemented (`parser.py` — smoke + full run; output in `parsed/`)
- [x] H5P content extracted
- [x] Migration dry run
- [x] Migration to target Supabase project
- [x] MedVoice audio URLs populated (94 lessons, 7 specialties)

### Frontend phases

- [x] Phase A — Auth, routing, dashboard (server component; shows display_name, cohort badge, specialty grid, 60D countdown)
- [x] Phase B — Plain-content renderer (`PlainContentRenderer` + `TocPanel`; auto-TOC at 3+ headings)
- [x] Phase C — Text-lesson renderer (`TextLessonRenderer` + `LessonSidebar`; sidebar nav, "Próxima seção" button)
- [x] Phase C.5 — Audio player in TextLessonRenderer (`<audio>` per section when `audio_url` set)
- [x] Phase D — H5P quiz player (one question at a time, scoring, retry wrong answers; quiz images populated)
- [x] Phase E — Flashcard player (flip interaction, self-assessment, keyboard shortcuts, attempt tracking, retry mode)
- [x] Phase F — Memorecards carousel (presentation_slides; 7 broken image refs accepted as unmigratable legacy)
- [ ] Phase G — Audiocards section (same as MedVoice once files uploaded; blocked on Bunny CDN uploads)
- [x] Phase H — Blurb-nav-hub renderer (63 hub pages; verified on /app/cardiologia and track hubs)
- [x] Admin panel — Phase I complete: dashboard, members (role mgmt, password reset, session revoke), cohorts (edit, cascade preview, soft delete), module unlock date overrides, audit log, stub pages for content editors

## Theme requirements (non-negotiable)
- Light and dark mode supported from day one
- Semantic color tokens only; no literal colors in component code
- Theme defined in one central file (`theme.ts` or equivalent)
- WCAG AAA contrast for body text (7:1 minimum)
- User preference persisted in profiles table
  (`theme_preference`: 'light' | 'dark' | 'system'; default 'system')
- Apply theme inline before React hydration to prevent flash
- Brand purple shifts: `#7a1d91` (light mode), `#c084e8` (dark mode)
- Media (images, EKG strips) renders with subtle framing in dark mode

## Admin panel requirements

### Multi-admin support (built in from day 1, tiered when needed)

Schema designed for role-based access control from the start. For V1, only the
two operational roles are used (Justin + Karina). The other roles are defined
but unused until you need them.

**Roles:**
- `super_admin` — full access to everything (Justin, Karina)
- `content_admin` — edit pages, lessons, quizzes, modules, audio uploads; no
  access to payments, member PII beyond what's needed for content work
- `support_admin` — view member accounts, handle access issues, password resets,
  cohort assignments; no content editing or financial data
- `billing_admin` — manage payments, refunds, cohort dates, PagBank operations;
  no content access
- `member` — default for all signups; no admin access

**Schema:**
- `users.role` enum with values above; default `'member'`
- RLS policies use role checks (e.g., editing pages requires role IN 
  ('super_admin', 'content_admin'))
- Same authentication for all users; role determines what admin UI is visible
- Admins can also be members (e.g., Justin can hold a cohort membership for
  testing) — the role field is independent of cohort membership

**Future-proofing note:** if you ever need fine-grained permissions beyond
these tiers (e.g., "content admin who can edit lessons but not quizzes"),
migrate to a proper `roles` + `permissions` + `role_permissions` table
structure. Don't preemptively build that for V1.

### Admin panel bilingual support (Portuguese / English)

The admin UI must support a per-user language toggle. Justin reads Portuguese
slowly and needs English in the admin panel; Karina prefers Portuguese.

- All admin UI strings use i18n from day 1 (recommend `react-i18next` for React
  + Supabase stack)
- Translation files: `locales/admin/pt-BR.json`, `locales/admin/en.json`
- Toggle stored as `users.admin_locale` enum: `'pt-BR' | 'en'` (default `'pt-BR'`)
- Toggle accessible from the admin header (e.g., language icon in user menu)
- Switching takes effect immediately, persists across sessions and devices

**Critical:** never hardcode admin UI strings. Every label, button, error
message, table header, and tooltip in the admin panel goes through a
translation key from day 1. Retrofitting i18n later means touching every
component — much worse than the small overhead of doing it right initially.

### Member-facing site: Portuguese only (no i18n)

This is an intentional decision. The member-facing site (everything outside
`/admin`) will always be Portuguese only. No i18n infrastructure for
member-facing components. Strings are hardcoded in Portuguese directly in
components.

If this ever changes (e.g., expansion to other Portuguese-speaking markets or 
an English version for international Brazilian doctors abroad), revisit then.
For now: simpler is better.

## Frontend gotcha: shadcn v4 uses Base UI, not Radix

When CC ran `npx shadcn@latest`, it installed v4 components built on Base UI
(`@base-ui/react`) instead of Radix. Base UI does NOT support the `asChild` 
prop pattern that's standard in Radix-based shadcn.

**Workarounds used:**
- `<Button asChild><Link>` → `<Link className={buttonVariants(...)}>`
- `<DropdownMenuTrigger asChild><Button>` → directly-styled `<DropdownMenuTrigger>`
- `<DropdownMenuItem asChild><Link>` → `onClick={() => router.push(...)}` with `useRouter`

If a future session adds new shadcn components and hits "asChild is not a prop" 
errors, this is why. Either pin to an older shadcn version (Radix-based) for 
new installs, or apply the same workaround patterns.

## Frontend auth architecture

### Stack

- **Supabase Auth** (email/password) via `@supabase/ssr`
- **`createBrowserClient`** for client components (`lib/supabase/client.ts`)
- **`createServerClient`** for server components and middleware (`lib/supabase/server.ts`)
- **Next.js middleware** (`src/middleware.ts`) refreshes session cookies on every request;
  uses `auth.getUser()` (server-validated), not `getSession()` (cookie-only, unvalidated)
- **`AuthProvider`** (`providers/auth-provider.tsx`) is the React context that holds
  `user` (Supabase `AuthUser`) and `profile` (our `profiles` table row); wraps all app routes

### Profiles table and auto-creation

Every `auth.users` INSERT fires `handle_new_user()` (SECURITY DEFINER trigger) which
inserts a `profiles` row. The `profiles` table extends auth with:
`role`, `admin_locale`, `theme_preference`, `display_name`.

### `current_user_role()` — why SECURITY DEFINER

RLS policies on `profiles` call `current_user_role()` to determine the acting role.
Without SECURITY DEFINER, evaluating those policies would try to read `profiles` again,
causing infinite recursion. The function is defined as SECURITY DEFINER so it reads
the table with superuser rights, bypassing RLS entirely.

**Never** call `current_user_role()` from client code — it only works server-side
(Postgres functions). Use `profile.role` from the React context instead.

### Role escalation prevention

The `profiles_update_own` RLS policy uses `WITH CHECK`:
```sql
current_user_role() IN ('super_admin') OR NEW.role = OLD.role
```
`current_user_role()` reads the stored value (pre-update), `NEW.role` is the
attempted value. A non-super_admin changing their own `role` fails this check.

### `USE_MOCK_DATA` flag

Set automatically in dev when `NEXT_PUBLIC_SUPABASE_URL` is absent.
Every auth call, query function, and middleware check gates on this flag.
Set `NEXT_PUBLIC_USE_MOCK_DATA=true` to force mock mode even with a Supabase URL.

### Side effects on profile load

`AuthProvider` calls `setTheme(profile.theme_preference)` and
`i18n.changeLanguage(profile.admin_locale)` immediately after fetching the profile.
`ThemeProvider` must be the outermost wrapper (it is) for `setTheme` to work here.

## Data fetching pattern

### CRITICAL: Always use server components for Supabase reads

`createBrowserClient` (from `@supabase/ssr`) hangs indefinitely on REST queries in
this app — the fetch initiates but never resolves. Root cause: concurrent token refresh
race condition between multiple browser client instances (refresh tokens are single-use).

**Rules:**
- All Supabase reads → `async` server components using `createClient()` from `lib/supabase/server.ts`
- Never use `useQuery` / TanStack Query hooks for Supabase reads in member-facing pages
- The only `"use client"` code that reads Supabase: `AuthProvider` (auth state subscription only)
- `lib/queries/` functions exist but are unused for member pages — don't reach for them

The server-side client works reliably (middleware proves this at ~400ms per request).

### TanStack Query + `lib/queries/`

All Supabase reads go through typed functions in `src/lib/queries/`:

```
lib/queries/
  profiles.ts      — getCurrentProfile(), useCurrentProfile()
  cohorts.ts       — getCurrentUserCohort(), getCohortModuleAccess(), use* hooks
  specialties.ts   — getSpecialties(), useSpecialties()
  pages.ts         — getPagesBySpecialty(), getPageBySlug(), use* hooks
  lessons.ts       — getLessonsForPage(), useLessonsForPage()
  quiz.ts          — getQuizQuestionsForPage(), useQuizQuestionsForPage()
  flashcards.ts    — getFlashcardsForPage(), useFlashcardsForPage()
  nav.ts           — getNavItemsForPage(), useNavItemsForPage()
  index.ts         — re-exports all of the above
```

Each file exports:
1. A query key constant (array) — use these for cache invalidation
2. An async fetch function — call directly in server components or mutations
3. A `use*` hook wrapping `useQuery` from TanStack Query v5

### Mock bypass pattern

Every fetch function checks `USE_MOCK_DATA` first and returns mock data
without hitting Supabase. This lets the entire UI run offline in dev.

```ts
export async function getLessonsForPage(pageId: number): Promise<Lesson[]> {
  if (USE_MOCK_DATA) return MOCK_LESSONS.filter((l) => l.page_id === pageId);
  const supabase = createClient();
  const { data, error } = await supabase.from("lessons").select("*")...
  if (error) throw error;
  return data ?? [];
}
```

### staleTime defaults

- Reference data (specialties, tracks): 60 min
- Cohort / module access: 10 min
- Content (pages, lessons, quiz, flashcards, nav): 5 min
- Profile: 5 min

## Running migration SQL files

Use `scripts/run-sql.js` to execute any of the `parsed/*.sql` files against Supabase
in a single atomic transaction — the whole file succeeds or rolls back entirely.

**One-time setup:**
1. `npm install` from `medhelpspace/` (installs the `postgres` package)
2. Add your DB password to `app/.env.local`:
   ```
   SUPABASE_DB_PASSWORD=<password from Supabase dashboard → Project Settings → Database>
   ```

**Usage:**
```bash
node scripts/run-sql.js parsed/pages.sql
node scripts/run-sql.js parsed/lessons.sql
node scripts/run-sql.js schema-patch-001.sql
```

The script connects via the direct Postgres URL (`db.<project-ref>.supabase.co:5432`),
derived automatically from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_DB_PASSWORD`.
To use the Transaction Pooler instead, set `DATABASE_URL` directly in `app/.env.local`.

## Content rendering design decisions (locked in)

### Text-lesson pages (220 pages) — BUILT
- `TextLessonRenderer` (server) + `LessonSidebar` (client, IntersectionObserver)
- Section anchors: `id="section-{lesson.id}"` with `scroll-mt-24`
- Mobile: hamburger toggle above content; desktop: sticky left sidebar (w-52)
- "Próxima seção" link at bottom of each section except the last
- Audio player: **not yet added** — fetch `audio_url` per lesson, show `<audio>` when set

### H5P quiz pages (204 pages)
- One question at a time with next/prev navigation
- Immediate feedback after each answer (correct/incorrect + explanation)
- Score summary at end with breakdown
- "Refazer as erradas" (retry incorrect) button after summary
- Store quiz attempt history per-user — surface "last score" on hub pages
- Explanations come from the H5P parameters extracted during migration

### Plain-content pages (473 pages) — BUILT
- `PlainContentRenderer` (server) + `TocPanel` (client, IntersectionObserver)
- Auto-TOC: 3+ `<h2>`/`<h3>` headings → sticky right-side TOC; otherwise pure prose
- Heading IDs injected server-side (slugified, dedup-aware)
- WP inline `#b046e9` color → `.prose-brand-color` class (remapped in processHtml)

### Flashcards (3,506 items across ~12 decks)
- Card flip interaction: click/tap or space to flip
- After flip: "Errei" / "Acertei" buttons (self-assessment)
- Respect group_position from migration — render groups separately with 
  group_la