-- Per-SECTION completion for the header "Sua jornada" meter.
-- Supersedes the 3 item-type buckets (lessons/quiz/flash) from
-- schema-patch-site-completion.sql with real site sections, so the popover names
-- match what members actually see in the "Estudar" nav.
--
-- Sections shown (a bar appears only when its total > 0 — see site-completion.ts):
--   Questões   = quiz_questions on pages with view IN ('quiz','simulados')
--   Resumos    = lessons on pages with view = 'resumos'
--   MedVoice   = lessons on track_id = 1 pages
--   AudioCards = lessons on track_id = 2 pages
--   Revalida Up= lessons on pages with view = 'revalida-up'
--   Flashcards = flashcard_items on any accessible page
--   Fórmula    = lessons on pages with view = 'formula'   (gated → counts once 60D unlocks)
--
-- The lesson_section CASE mirrors getStudyTypeKey() precedence (view first, then
-- track) so a page lands in exactly one section, matching how the nav routes it.
-- Simulado case-stem lessons and uncategorized lessons are intentionally dropped:
-- a simulado's completion is its questions, and orphan lessons belong to no
-- nav section. So the denominator is slightly smaller (and more honest) than the
-- old "Aulas" bucket.
--
-- Accessible = status='publish' AND (content_module_id IS NULL OR the member's
-- cohort has unlocked that module). Same gating as before: locked 60D content
-- (Fórmula + legacy MemoreCards/Simulados subtree) stays out until its unlock
-- date, then folds in — so Fórmula simply appears as a new bar on unlock.
--
-- "done" counts distinct attempted/completed items, each restricted to the SAME
-- accessible-page + section set as its total, so done can never exceed total.
--
-- Server-only: called via admin.rpc(...) (service_role) from
-- lib/progress/site-completion.ts; anon/authenticated keep no EXECUTE.
--
-- Run with: node scripts/run-sql.js schema-patch-site-completion-sections.sql
--
-- Rollback: restore the prior definition from schema-patch-site-completion.sql
--   (DROP FUNCTION first — the return signature differs).

DROP FUNCTION IF EXISTS public.get_site_completion(uuid);

CREATE FUNCTION public.get_site_completion(p_user uuid)
RETURNS TABLE (
  questoes_total   bigint, questoes_done   bigint,
  resumos_total    bigint, resumos_done    bigint,
  medvoice_total   bigint, medvoice_done   bigint,
  audiocards_total bigint, audiocards_done bigint,
  revalida_total   bigint, revalida_done   bigint,
  flashcards_total bigint, flashcards_done bigint,
  formula_total    bigint, formula_done    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ap AS (
    SELECT
      p.id,
      (p.view IN ('quiz', 'simulados')) AS is_questoes,
      CASE
        WHEN p.view = 'resumos'     THEN 'resumos'
        WHEN p.view = 'formula'     THEN 'formula'
        WHEN p.view = 'revalida-up' THEN 'revalida'
        WHEN p.track_id = 1         THEN 'medvoice'
        WHEN p.track_id = 2         THEN 'audiocards'
        ELSE NULL
      END AS lesson_section
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
    -- Questões
    (SELECT count(*) FROM quiz_questions q
       WHERE q.page_id IN (SELECT id FROM ap WHERE is_questoes)),
    (SELECT count(DISTINCT qa.question_id) FROM quiz_attempts qa
       JOIN quiz_questions q ON q.id = qa.question_id
      WHERE qa.user_id = p_user
        AND q.page_id IN (SELECT id FROM ap WHERE is_questoes)),
    -- Resumos
    (SELECT count(*) FROM lessons l
       WHERE l.page_id IN (SELECT id FROM ap WHERE lesson_section = 'resumos')),
    (SELECT count(DISTINCT lc.lesson_id) FROM lesson_completions lc
       JOIN lessons l ON l.id = lc.lesson_id
      WHERE lc.user_id = p_user
        AND l.page_id IN (SELECT id FROM ap WHERE lesson_section = 'resumos')),
    -- MedVoice
    (SELECT count(*) FROM lessons l
       WHERE l.page_id IN (SELECT id FROM ap WHERE lesson_section = 'medvoice')),
    (SELECT count(DISTINCT lc.lesson_id) FROM lesson_completions lc
       JOIN lessons l ON l.id = lc.lesson_id
      WHERE lc.user_id = p_user
        AND l.page_id IN (SELECT id FROM ap WHERE lesson_section = 'medvoice')),
    -- AudioCards
    (SELECT count(*) FROM lessons l
       WHERE l.page_id IN (SELECT id FROM ap WHERE lesson_section = 'audiocards')),
    (SELECT count(DISTINCT lc.lesson_id) FROM lesson_completions lc
       JOIN lessons l ON l.id = lc.lesson_id
      WHERE lc.user_id = p_user
        AND l.page_id IN (SELECT id FROM ap WHERE lesson_section = 'audiocards')),
    -- Revalida Up
    (SELECT count(*) FROM lessons l
       WHERE l.page_id IN (SELECT id FROM ap WHERE lesson_section = 'revalida')),
    (SELECT count(DISTINCT lc.lesson_id) FROM lesson_completions lc
       JOIN lessons l ON l.id = lc.lesson_id
      WHERE lc.user_id = p_user
        AND l.page_id IN (SELECT id FROM ap WHERE lesson_section = 'revalida')),
    -- Flashcards (flashcard_items live on quiz-view pages; bucketed by item type, not view)
    (SELECT count(*) FROM flashcard_items fi
       WHERE fi.page_id IN (SELECT id FROM ap)),
    (SELECT count(DISTINCT fa.flashcard_item_id) FROM flashcard_attempts fa
       JOIN flashcard_items fi ON fi.id = fa.flashcard_item_id
      WHERE fa.user_id = p_user
        AND fi.page_id IN (SELECT id FROM ap)),
    -- Fórmula MedHelp (gated; nonzero only after the 60D unlock)
    (SELECT count(*) FROM lessons l
       WHERE l.page_id IN (SELECT id FROM ap WHERE lesson_section = 'formula')),
    (SELECT count(DISTINCT lc.lesson_id) FROM lesson_completions lc
       JOIN lessons l ON l.id = lc.lesson_id
      WHERE lc.user_id = p_user
        AND l.page_id IN (SELECT id FROM ap WHERE lesson_section = 'formula'));
$$;

-- Server-only: keep EXECUTE off anon/authenticated, allow the admin client.
REVOKE ALL ON FUNCTION public.get_site_completion(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_site_completion(uuid) TO service_role;
