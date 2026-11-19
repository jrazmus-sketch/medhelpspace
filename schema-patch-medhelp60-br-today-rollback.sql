-- schema-patch-medhelp60-br-today-rollback.sql — restores user_has_module_access with the UTC current_date and
-- drops br_today(). Deploy the app version without the br_today() call (lib/medhelp-60d.ts) BEFORE running this,
-- or the 60D check falls back to the app's own Brasília day (it does not break).

CREATE OR REPLACE FUNCTION public.user_has_module_access(mod_id smallint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM user_cohort_memberships ucm
    JOIN cohorts c              ON c.id  = ucm.cohort_id
    JOIN cohort_module_access a ON a.cohort_id = c.id
                               AND a.content_module_id = mod_id
    WHERE ucm.user_id = auth.uid()
      AND now()          BETWEEN c.membership_starts_at AND c.membership_ends_at
      AND a.unlock_date <= current_date
  )
$function$;

DROP FUNCTION IF EXISTS public.br_today();
