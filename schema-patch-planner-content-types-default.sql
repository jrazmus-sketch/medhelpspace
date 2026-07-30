-- schema-patch-planner-content-types-default.sql
--
-- Fix the study_plans content-type defaults so a plan row created by any code
-- path gets the SAME preferences the wizard would have written.
--
-- The v2 patch (schema-patch-study-plans-v2.sql) shipped:
--     preferred_content_types TEXT[] NOT NULL
--       DEFAULT ARRAY['quiz','lesson','audio','flashcards','memorecards']
-- which is wrong in two independent ways:
--
--   (a) It OMITS 'simulado'. The engine only emits the "Simulado do dia" item
--       when 'simulado' is in this array (app/src/lib/study-plan/derive.ts —
--       `allowedTypes.has("simulado") && (phase === 'intensification' ||
--       phase === 'taper')`). Any study_plans row born outside the calibration
--       wizard — the user toggles intensity, available days, or an email
--       preference first, and upsertStudyPlan creates the row with column
--       defaults — can therefore NEVER be shown a simulado, no matter how close
--       the exam gets. That is the actual bug: silent, permanent, and invisible
--       in the UI because the picker renders the stored array as "off".
--
--   (b) It INCLUDES 'lesson', which the engine never emits. Narrative summaries
--       were deliberately dropped from the daily schedule; derive.ts has
--       allowedTypes.has(...) branches for quiz / flashcards / audio / simulado /
--       memorecards and none for 'lesson'. So it is a dead value that also
--       inflates the plan summary line ("N/5 tipos", plano-client.tsx) — a
--       default row reads "5/5 tipos" while only 4 of the 5 can ever schedule
--       anything, and the one that would matter most (simulado) is absent.
--
-- The intended default is the one in defaultPrefs() (derive.ts:164):
--     ARRAY['quiz','simulado','flashcards','audio','memorecards']
-- Setting the column default to match makes the DB and the TS fallback agree,
-- so it no longer matters which of the two produced a given row.
--
-- content_type_weights gets the same treatment (its default also lacks a
-- 'simulado' key), realigned to defaultPrefs().content_type_weights.
-- IMPORTANT: content_type_weights is READ by the planner (fetch.ts loads it into
-- StudyPlanPrefs) but is NOT USED by derive.ts to size or order anything — the
-- mix is driven by phase, ranked specialties and the intensity tier, not by
-- these percentages. Changing this default therefore changes NO behaviour today.
-- It is corrected only so the column stops being misleading if/when the weighted
-- mix is actually implemented. Do not "verify" this patch by looking for a
-- different plan; there won't be one.
--
-- Backfill is deliberately CONSERVATIVE — see the comments on each UPDATE.
-- Idempotent: SET DEFAULT is naturally re-runnable, and each backfill's WHERE
-- clause stops matching the rows it just rewrote (the new value contains no
-- 'lesson', so it can never satisfy the legacy-default predicate again).
--
-- Rollback:
--   ALTER TABLE study_plans
--     ALTER COLUMN preferred_content_types
--       SET DEFAULT ARRAY['quiz','lesson','audio','flashcards','memorecards'],
--     ALTER COLUMN content_type_weights
--       SET DEFAULT '{"quiz":40,"lesson":25,"audio":15,"flashcards":15,"memorecards":5}'::jsonb;
--   -- and, to undo the backfill (restores the legacy value only on rows that
--   -- still carry the exact NEW default — i.e. ones this patch rewrote and the
--   -- student has not touched since):
--   UPDATE study_plans
--     SET preferred_content_types = ARRAY['quiz','lesson','audio','flashcards','memorecards']
--   WHERE preferred_content_types @> ARRAY['quiz','simulado','flashcards','audio','memorecards']::text[]
--     AND preferred_content_types <@ ARRAY['quiz','simulado','flashcards','audio','memorecards']::text[]
--     AND cardinality(preferred_content_types) = 5;
--   UPDATE study_plans
--     SET content_type_weights = '{"quiz":40,"lesson":25,"audio":15,"flashcards":15,"memorecards":5}'::jsonb
--   WHERE content_type_weights = '{"quiz":30,"simulado":20,"lesson":10,"audio":15,"flashcards":20,"memorecards":5}'::jsonb;
--
-- Run with: node scripts/run-sql.js schema-patch-planner-content-types-default.sql

BEGIN;

-- ── 1. Correct the column defaults ───────────────────────────────────────────
-- Mirrors defaultPrefs() in app/src/lib/study-plan/derive.ts. If that function
-- ever changes, change this in the same commit — the two are one contract.

ALTER TABLE study_plans
  ALTER COLUMN preferred_content_types
    SET DEFAULT ARRAY['quiz','simulado','flashcards','audio','memorecards'],
  ALTER COLUMN content_type_weights
    SET DEFAULT '{"quiz":30,"simulado":20,"lesson":10,"audio":15,"flashcards":20,"memorecards":5}'::jsonb;

-- ── 2. Backfill preferred_content_types — ONLY untouched legacy-default rows ──
--
-- Predicate, term by term:
--   @>  ARRAY[...]  the row contains every legacy-default element
--   <@  ARRAY[...]  the row contains nothing else
--   cardinality = 5 no duplicate padding (e.g. {quiz,quiz,lesson,audio,
--                   flashcards,memorecards} is set-equal to the default under
--                   @>/<@ but is NOT the default — it was written by something
--                   else, so leave it alone)
-- Together: exact set equality, order-insensitive (the column is a TEXT[] with
-- no meaningful order; the wizard and the TS fallback write it in different
-- orders), with no false positives.
--
-- A row matching this is indistinguishable from "never configured": it is
-- byte-for-byte what the wrong DEFAULT produced. Anything else — even a single
-- element added or removed — is a real student choice and is NOT touched.

UPDATE study_plans
SET    preferred_content_types = ARRAY['quiz','simulado','flashcards','audio','memorecards']
WHERE  preferred_content_types @> ARRAY['quiz','lesson','audio','flashcards','memorecards']::text[]
  AND  preferred_content_types <@ ARRAY['quiz','lesson','audio','flashcards','memorecards']::text[]
  AND  cardinality(preferred_content_types) = 5;

-- ── 2b. NOT DONE ON PURPOSE: stripping 'lesson' from student-chosen arrays ────
--
-- The obvious follow-on is "also remove the dead 'lesson' element from rows that
-- are not the legacy default". We deliberately do NOT do that:
--
--   * 'lesson' is a REAL, selectable option in the UI. ContentTypesEditor
--     (app/src/app/app/plano/plano-client.tsx) renders all six types —
--     ["quiz","simulado","lesson","audio","flashcards","memorecards"] — as
--     checkboxes, and setContentTypes() persists exactly what is checked. A row
--     containing 'lesson' alongside a non-default set is a student who looked at
--     that checkbox and left it on. Removing it silently un-checks a box the
--     student can see, with no action on their part.
--   * The damage from leaving it is zero. derive.ts has no allowedTypes.has(
--     "lesson") branch, so the element is inert; it costs one wrong digit in the
--     "N/5 tipos" summary and nothing else. The damage from removing it is not
--     zero: if narrative lessons are ever re-added to the schedule, every
--     student who had opted in would silently be opted out, and there would be
--     no record that we did it.
--   * Reversibility: the legacy-default backfill above is fully reversible
--     (see Rollback) because the source value is known. A blanket strip is not —
--     once 'lesson' is gone from an arbitrary array we cannot tell which rows
--     originally had it.
--
-- Conclusion: over-reaching. The real fix for the misleading "N/5" is in the UI
-- (count only schedulable types), not by rewriting student data. If 'lesson' is
-- ever formally retired as an option, retire it in the picker first, then write
-- a dedicated patch that strips it — with a backup table.

-- ── 3. Backfill content_type_weights — ONLY untouched legacy-default rows ─────
--
-- jsonb equality is key-order-insensitive and duplicate-free by construction,
-- so a plain `=` against the legacy default literal is already the exact
-- "never customised" test — no @>/<@/cardinality dance needed here.
-- Cosmetic only (see the header note: the engine reads this column but does not
-- act on it).

UPDATE study_plans
SET    content_type_weights = '{"quiz":30,"simulado":20,"lesson":10,"audio":15,"flashcards":20,"memorecards":5}'::jsonb
WHERE  content_type_weights = '{"quiz":40,"lesson":25,"audio":15,"flashcards":15,"memorecards":5}'::jsonb;

COMMIT;
