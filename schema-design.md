# Schema Design — Review Document (Phase 2 revised + patch-001)

Read alongside `schema.sql`. Covers all five original questions plus the three
additions from this round: cohort/module membership, tracks, and flashcard table.
`schema-patch-001.sql` adds profiles, reference SELECT policies, and admin write
policies — documented in §9 and the updated §10.

---

## 1. Specialty modeling: separate table vs self-referential parent

**Decision: unchanged from initial draft.** Separate `specialties` table + denormalized
`(specialty_id, view)` on `pages`.

The WP parent hierarchy is 3–4 levels deep; walking it at query time via recursive CTE
is not viable for the hot path ("all quiz pages for Cardiologia"). The common query is:

```sql
SELECT * FROM pages WHERE specialty_id = 1 AND view = 'quiz' AND status = 'publish';
```

`parent_id` is preserved for tree traversal edge cases (breadcrumbs, blurb link resolution).
It is not used for content queries.

The 14 incomplete OB/GYN + Pediatrics hubs have `specialty_id = NULL` and
`status = 'draft'`; they are excluded from all RLS-gated reads automatically.

---

## 2. Membership model: cohort + module access

**Decision: replace `membership_levels` + `user_memberships` with four tables.**

The old model (two fixed PMPro levels) was too rigid. Both WP cohorts grant identical
base content access; they differ only in time windows and the date a specific module
unlocks. A future tier that grants different module access (e.g. a lighter "preview"
tier with no Revalida Up access) cannot be expressed in the old model without a schema
change.

### New tables

| Table | Purpose |
|---|---|
| `cohorts` | One row per exam cycle; holds `test_date` and membership window |
| `user_cohort_memberships` | User ↔ cohort join table |
| `content_modules` | Named, date-gated content sections; stores `unlock_offset_days` |
| `cohort_module_access` | Which cohort unlocks which module; stores computed `unlock_date` |

### Access rule (enforced by RLS)

- **Base content** (`content_module_id IS NULL`): readable by any user with an active
  cohort membership (current timestamp between `membership_starts_at` and `membership_ends_at`).
- **Module-gated content** (`content_module_id IS NOT NULL`): readable only if the user
  has an active membership AND their cohort's `unlock_date` for that module ≤ today.

### unlock_date is stored, not computed at query time

`cohort_module_access.unlock_date = cohorts.test_date - content_modules.unlock_offset_days`.
Storing it avoids a three-table join in the RLS hot path. Two triggers keep it in sync:

- `cohorts_sync_unlock_dates`: fires on `cohorts.test_date` update → recomputes all
  access rows for that cohort.
- `content_modules_sync_dates`: fires on `content_modules.unlock_offset_days` update →
  recomputes all access rows for that module.

Admins update `test_date` on a cohort; the trigger propagates to all module access rows
automatically. No manual maintenance of `unlock_date` is required.

### Seeded data

```
cohort 1: revalida-2026-2  test_date=2026-07-01  window: 2025-08-01 → 2026-08-31
cohort 2: revalida-2027-1  test_date=2027-01-15  window: 2026-02-01 → 2027-02-28

module 1: medhelp-60d  unlock_offset_days=60

cohort_module_access:
  cohort 1 / module 1 → unlock_date 2026-05-02  (2026-07-01 - 60d)
  cohort 2 / module 1 → unlock_date 2026-11-16  (2027-01-15 - 60d)
```

All dates are placeholders. `test_date` is the only field admins need to adjust;
unlock dates recompute automatically.

---

## 3. Content module: MedHelp 60D

**37 pages** get `content_module_id = 1` (medhelp-60d):

- 1 parent: `medhelp-60d` (WP id 3018, `plain-content`)
- 36 descendants discovered by recursive `parent_id` walk:
  - `revalida-up` hub (id 4308) + 15 specialty plain-content / h5p-quiz children
  - `memorecards` hub (id 4313) + 19 specialty plain-content / h5p-quiz children

Type breakdown of the 37 pages: 31 `plain-content`, 4 `h5p-quiz`, 2 `text-lesson`.

The parser identifies medhelp-60d descendants by walking `parent_id` from root 3018
(canonical slug: `medhelp-60d`) and tagging every page in the subtree. No slug-pattern
heuristic is needed; the WP hierarchy is authoritative.

---

## 4. H5P quiz question mapping

**All 10 sampled H5P rows are `H5P.QuestionSet` with `H5P.MultiChoice` questions**
(library_id 15 in every sampled row). The parameters shape and column mapping are
unchanged from the initial design doc.

The `flashcard_items` table handles the case where H5P content has a `cards` key
instead of `questions` (see §6). The parser must check the top-level key of each
`wp_h5p_contents.parameters` blob before routing to `quiz_questions` vs `flashcard_items`.

---

## 5. Indexing strategy

Unchanged. The `(specialty_id, view)` partial index (WHERE specialty_id IS NOT NULL)
is the primary query index. `parent_id` is a secondary index for traversal.
At 977 rows the table is small; these indexes are for query clarity and future-proofing,
not raw performance.

---

## 6. nav_items: separate table (unchanged)

Decision and rationale unchanged from initial draft. The `target_page_id IS NULL`
pattern correctly flags the 14 incomplete hubs for content team attention.

---

## 7. Flashcard items (new table)

**Decision: separate `flashcard_items` table** rather than a `content_blob jsonb` column
on pages.

Rationale: H5P Flashcards and Dialogcards have a well-defined two-sided card structure
(`front_text` / `back_text` / optional `image_url` / optional `tip`). Storing that in a
typed table is preferable to a schema-less blob, and the cardinality (pages × cards per
page) is similar to `quiz_questions` (pages × questions per page).

The parser routes based on the top-level key of `wp_h5p_contents.parameters`:

| Top-level key | Destination |
|---|---|
| `questions` | `quiz_questions` rows |
| `cards` | `flashcard_items` rows |
| anything else | flag for manual review |

Known pages that will likely populate `flashcard_items`: the 17 `*-flashcards` pages
(cardiologia-flashcards, dermatologia-flashcards, …) under the `flashcards` track hub
(WP id 3767), and the `*-memorecards` h5p-quiz pages inside the medhelp-60d module.
The actual H5P content type must be confirmed by the parser — all 10 sampled rows were
QuestionSet, and the flashcard/memorecards rows are deeper in the INSERT.

---

## 8. Tracks (new table)

**Decision: separate `tracks` table** with a nullable `track_id` FK on `pages`.

Tracks are cross-cutting content series: each track covers most or all specialties with
a specific format. They are orthogonal to specialties and to the hub/quiz/formula/resumos
view taxonomy.

| Track | Pages | Description |
|---|---|---|
| `medvoice` | 19 (hub + 18 per-specialty) | Audio + text script; one audio-lesson per specialty |
| `audiocards` | 18 (hub + 17 per-specialty) | Text-lesson toggles with embedded audio |
| `flashcards` | 18 (hub + 17 per-specialty) | H5P flashcard/quiz content per specialty |

A page can have both a `track_id` and a `content_module_id`. For example, the
`cardiologia-memorecards` page (inside medhelp-60d) would have:
- `content_module_id = 1` (medhelp-60d gate)
- No `track_id` — memorecards is structurally a track but was not seeded as one;
  add a fourth track row if the app needs to surface memorecards as a track in the UI.

Track hub pages (medvoice/3767, audiocards/3690, flashcards/3767) also receive `track_id`
so the app can render "all audiocards pages" with a single query.

---

---

## 9. Profiles table (added in patch-001)

**Decision: separate `profiles` table** extending `auth.users` rather than storing
user metadata in the JWT or in a generic `metadata` column.

### Columns

| Column | Type | Default | Purpose |
|---|---|---|---|
| `id` | UUID PK | — | FK to `auth.users(id) ON DELETE CASCADE` |
| `email` | text | — | Mirrored from auth at creation; not updated automatically on email change |
| `display_name` | text \| NULL | — | User-chosen name; falls back to email in the UI |
| `role` | `user_role` enum | `'member'` | Controls admin panel access |
| `admin_locale` | `admin_locale` enum | `'pt-BR'` | Admin UI language (member site is always PT-BR) |
| `theme_preference` | `theme_preference` enum | `'system'` | Applied server-side before React hydration to prevent flash |
| `created_at`, `updated_at` | timestamptz | `now()` | Standard audit columns; `updated_at` maintained by trigger |

### Enums

```sql
user_role        → 'member' | 'super_admin' | 'content_admin' | 'support_admin' | 'billing_admin'
admin_locale     → 'pt-BR' | 'en'
theme_preference → 'light' | 'dark' | 'system'
```

### Auto-creation trigger

`handle_new_user()` (SECURITY DEFINER) fires AFTER INSERT on `auth.users` and
inserts a profiles row with the new user's `id` and `email`. Role defaults to
`'member'`. Admins must be upgraded manually (UPDATE profiles SET role = ... in the
Supabase dashboard or via the admin panel once the member management UI is built).

The trigger is `SECURITY DEFINER SET search_path = public` per Supabase's best
practice for avoiding search_path injection in SECURITY DEFINER functions.

### Role description

| Role | Admin panel access |
|---|---|
| `member` | None — default for all signups |
| `super_admin` | Full access to everything |
| `content_admin` | Edit pages, lessons, quizzes, audio; no PII or billing data |
| `support_admin` | View member accounts, cohort assignments; no content editing or billing |
| `billing_admin` | Manage cohorts, test dates, memberships, payments; no content editing |

V1 only uses `super_admin` (Justin + Karina). Other roles are defined but dormant.

---

## 10. RLS policy strategy (updated in patch-001)

### Tables with RLS enabled

All tables have RLS enabled. Policy matrix:

| Table | Member SELECT | Admin SELECT | Admin write |
|---|---|---|---|
| `pages` | published + active membership | all rows (drafts included) | super_admin, content_admin |
| `lessons` | via parent page | all rows | super_admin, content_admin |
| `quiz_questions` | via parent page | all rows | super_admin, content_admin |
| `flashcard_items` | via parent page | all rows | super_admin, content_admin |
| `presentation_slides` | via parent page | all rows | super_admin, content_admin |
| `nav_items` | via parent page | all rows | super_admin, content_admin |
| `specialties` | any authenticated | any authenticated | super_admin, content_admin |
| `tracks` | any authenticated | any authenticated | super_admin, content_admin |
| `cohorts` | any authenticated | any authenticated | super_admin, billing_admin |
| `content_modules` | any authenticated | any authenticated | super_admin, billing_admin |
| `cohort_module_access` | any authenticated | any authenticated | super_admin, billing_admin |
| `user_cohort_memberships` | own row only | all rows | super_admin, billing_admin |
| `profiles` | own row only | all rows | own (non-role) or super_admin (all) |

### Helper functions (all SECURITY DEFINER)

- `user_has_active_membership()` — true if `auth.uid()` has an active cohort
- `user_has_module_access(mod_id)` — true if active membership + module unlocked
- `current_user_role()` — returns `profiles.role::text` for `auth.uid()`, or NULL

All three are SECURITY DEFINER so they bypass RLS when reading their source tables.
This avoids circular dependency (e.g., `current_user_role()` reads `profiles` while
`profiles` itself has RLS that calls `current_user_role()`).

### Policy stacking (permissive mode)

PostgreSQL RLS is permissive by default: multiple policies on the same operation are
OR-ed together. This means:

- Content tables have both a member read policy (published + membership check) AND an
  admin FOR ALL policy (no status filter). A content_admin sees all rows including drafts;
  a regular member sees only published rows within their access.
- Reference tables have a public SELECT policy (any auth) AND an admin FOR ALL policy.
  The admin policy adds no extra SELECT beyond what the public policy grants, but does
  add INSERT / UPDATE / DELETE capability.

### Role escalation prevention

`profiles_update_own` prevents self-role-escalation with a WITH CHECK clause:

```sql
WITH CHECK (
  id   = auth.uid()
  AND role = current_user_role()::user_role   -- NEW.role must equal OLD.role
)
```

`current_user_role()` reads the currently-stored role (OLD state, since the function
fetches from the DB). If the role column in the UPDATE payload differs from the stored
role, the check fails. Only `super_admin` (via `profiles_update_admin`) can change
roles on any row, including other admins' roles.

**Caveat**: a super_admin can downgrade their own role in V1. With only two super_admins
(Justin and Karina) this is an acceptable risk; enforce via convention, not code, for now.

---

## Open questions for team review

1. **Flashcard H5P content confirmed?** The `_explore_flashcards.py` script only
   sampled the first INSERT block (10 rows, all QuestionSet). The flashcard/memorecards
   H5P rows are in later INSERT blocks. Parser must handle the `cards` key; confirm the
   H5P library type during parser spike.

2. **Memorecards as a 4th track?** The `memorecards` section (id 4313, inside medhelp-60d)
   follows the same specialty × content-type pattern as the other tracks. Add a `memorecards`
   row to `tracks` and tag those pages with `track_id` if the app UI needs it.

3. **Section-root pages** (objetivas-comentadas/261, resumos/1560, formula-medhelp/2792,
   objetivas-simulados/3836) are classified as `text-lesson` with 6 nav-link toggles.
   Do they migrate as `navigation-toggle` pages, or are they rebuilt as static React
   route wrappers and skipped entirely?

4. **MedVoice audio coverage**: only `cardiologia-medvoice` is confirmed as `audio-lesson`
   (has `[zoomsounds_player]`); the other 17 medvoice pages are `text-lesson`. Is audio
   missing from those, or is it served via a different mechanism? Affects whether
   `lessons.audio_url` will be populated during initial import or left for a bulk-add pass.

5. **RLS and custom JWT**: if the Supabase project uses a custom JWT issuer (not Supabase
   Auth), `auth.uid()` may not be available. Confirm identity provider before enabling RLS.

---

## Changes from initial draft

| Initial | This revision | Reason |
|---|---|---|
| `membership_levels` + `user_memberships` | `cohorts` + `user_cohort_memberships` + `content_modules` + `cohort_module_access` | Cohort model; date-gated module access |
| `membership_level_min` on `pages` | `content_module_id` on `pages` | Module gate is more precise than a level floor |
| No tracks concept | `tracks` table + `track_id` on `pages` | MedVoice / Audiocards / Flashcards are cross-cutting |
| No `flashcard_items` | `flashcard_items` table | Typed home for H5P cards-structure content |
| unlock_date as application logic | `cohort_module_access.unlock_date` stored + triggers | Fast RLS; auto-sync on test_date change |
