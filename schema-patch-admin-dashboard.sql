-- Admin dashboard: active-member counts.
--
-- Powers the "membros ativos" metric on /admin. Counts DISTINCT members who did
-- ANY learning activity (quiz attempt, lesson completion, or flashcard attempt) in
-- the last 7 / 30 days. This cross-table DISTINCT is awkward in PostgREST, so it
-- lives in one SECURITY DEFINER RPC the dashboard calls via the service-role client.
--
-- The dashboard tolerates this function being absent (falls back to 0), so applying
-- it is non-breaking and reversible.
--
-- Run with: node scripts/run-sql.js schema-patch-admin-dashboard.sql

CREATE OR REPLACE FUNCTION get_active_member_counts()
RETURNS TABLE (active_7d INT, active_30d INT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH act AS (
    SELECT user_id, created_at   AS ts FROM quiz_attempts       WHERE created_at   >= now() - interval '30 days'
    UNION ALL
    SELECT user_id, completed_at AS ts FROM lesson_completions  WHERE completed_at >= now() - interval '30 days'
    UNION ALL
    SELECT user_id, attempted_at AS ts FROM flashcard_attempts  WHERE attempted_at >= now() - interval '30 days'
  )
  SELECT
    COUNT(DISTINCT user_id) FILTER (WHERE ts >= now() - interval '7 days')::int  AS active_7d,
    COUNT(DISTINCT user_id)::int                                                  AS active_30d
  FROM act;
$$;

-- Server-only: called via the service-role admin client. Per the project invariant,
-- revoke the default EXECUTE grants from anon/authenticated.
REVOKE EXECUTE ON FUNCTION get_active_member_counts() FROM anon, authenticated;

-- Rollback:
-- DROP FUNCTION IF EXISTS get_active_member_counts();
