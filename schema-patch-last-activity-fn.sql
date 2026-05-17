-- Get the most recent study activity timestamp for each of a list of users.
-- Combines quiz_attempts.created_at and lesson_completions.completed_at.
-- Used by the lifecycle-notifications cron (phase 6, missed-3-days nudge)
-- to avoid N×2 per-user queries.
--
-- Run with: node scripts/run-sql.js schema-patch-last-activity-fn.sql
--
-- Rollback:
--   DROP FUNCTION IF EXISTS get_last_activity_per_user(uuid[]);

CREATE OR REPLACE FUNCTION get_last_activity_per_user(user_ids uuid[])
RETURNS TABLE (user_id uuid, last_activity timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, MAX(ts) AS last_activity
  FROM (
    SELECT user_id, created_at  AS ts FROM quiz_attempts      WHERE user_id = ANY(user_ids)
    UNION ALL
    SELECT user_id, completed_at AS ts FROM lesson_completions WHERE user_id = ANY(user_ids)
  ) combined
  GROUP BY user_id;
$$;
