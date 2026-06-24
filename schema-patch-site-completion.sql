-- Site-wide completion counts for the header "Sua jornada" progress meter.
-- One round-trip returning the numerator/denominator for each content pillar,
-- so the member header can show overall completion without fetching every
-- attempt row per page load.
--
-- Scope: ONLY content the member can actually access right now (decided 2026-06-24).
--   A page counts toward the denominator when:
--     · status = 'publish'        — drafts are excluded, and
--     · content_module_id IS NULL — ungated/day-1 content, OR
--       the member's cohort has unlocked that module
--       (cohort_module_access.unlock_date <= today).
--   So locked MedHelp 60D content (content_module_id = 1: Fórmula + the legacy
--   MemoreCards/Simulados subtree) is excluded until the cohort's 60D unlock date,
--   then folds in automatically — the bar can't be dragged down by material the
--   member can't open yet. Mirrors the gating in lib/medhelp-60d.ts +
--   the [specialty]/[slug] content route (status='publish' + requireActiveMembership).
--
--   "done" = lessons completed (lesson_completions),
--            quiz questions attempted (distinct question_id in quiz_attempts),
--            flashcard items attempted (distinct flashcard_item_id in flashcard_attempts),
--   each restricted to the same accessible-page set so done can never exceed total.
--
-- Called only via admin.rpc(...) (service_role) from lib/progress/site-completion.ts,
-- so anon/authenticated never need EXECUTE — matching the lockdown applied to the
-- other server-only SECURITY DEFINER functions in schema-patch-harden-function-security.sql.
--
-- Run with: node scripts/run-sql.js schema-patch-site-completion.sql
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.get_site_completion(uuid);

CREATE OR REPLACE FUNCTION public.get_site_completion(p_user uuid)
RETURNS TABLE (
  lessons_total bigint,
  lessons_done  bigint,
  quiz_total    bigint,
  quiz_done     bigint,
  flash_total   bigint,
  flash_done    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH accessible_pages AS (
    SELECT p.id
    FROM pages p
    WHERE p.status = 'publish'
      AND (
        p.content_module_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM user_cohort_memberships ucm
          JOIN cohort_module_access cma ON cma.cohort_id = ucm.cohort_id
          WHERE ucm.user_id = p_user
            AND cma.content_module_id = p.content_module_id
            AND cma.unlock_date <= current_date
        )
      )
  )
  SELECT
    (SELECT count(*)
       FROM lessons l
      WHERE l.page_id IN (SELECT id FROM accessible_pages)),
    (SELECT count(DISTINCT lc.lesson_id)
       FROM lesson_completions lc
       JOIN lessons l ON l.id = lc.lesson_id
      WHERE lc.user_id = p_user
        AND l.page_id IN (SELECT id FROM accessible_pages)),
    (SELECT count(*)
       FROM quiz_questions q
      WHERE q.page_id IN (SELECT id FROM accessible_pages)),
    (SELECT count(DISTINCT qa.question_id)
       FROM quiz_attempts qa
       JOIN quiz_questions q ON q.id = qa.question_id
      WHERE qa.user_id = p_user
        AND q.page_id IN (SELECT id FROM accessible_pages)),
    (SELECT count(*)
       FROM flashcard_items fi
      WHERE fi.page_id IN (SELECT id FROM accessible_pages)),
    (SELECT count(DISTINCT fa.flashcard_item_id)
       FROM flashcard_attempts fa
       JOIN flashcard_items fi ON fi.id = fa.flashcard_item_id
      WHERE fa.user_id = p_user
        AND fi.page_id IN (SELECT id FROM accessible_pages));
$$;

-- Server-only: keep EXECUTE off anon/authenticated, allow the admin client.
REVOKE ALL ON FUNCTION public.get_site_completion(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_site_completion(uuid) TO service_role;
