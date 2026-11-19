-- schema-patch-medhelp60-br-today.sql
--
-- Karina 2026-11-19 (11h53): the MedHelp 60D must open on its release day — "o comportamento está correto na véspera,
-- no dia da liberação e depois dela". The database compared the release day with `current_date`, which is the UTC
-- day: from 21:00 Brasília time on the EVE the module already counted as open (the content pages and RLS use this
-- function). The day is now Brasília's, the same day the app uses everywhere (lib/br-date.ts).
--
--   br_today()                     the current day in Brasília (America/Sao_Paulo).
--   user_has_module_access(mod_id) unchanged rule, compared with br_today() instead of current_date.
--
-- The app's 60D check (lib/medhelp-60d.ts get60dAccess) reads br_today() too, so the two gates can never disagree.
-- Idempotent. Rollback: schema-patch-medhelp60-br-today-rollback.sql.

CREATE OR REPLACE FUNCTION public.br_today() RETURNS date
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date
$$;
COMMENT ON FUNCTION public.br_today() IS
  'The current day in Brasília. Date-gated access (MedHelp 60D release) compares with this day, never with the UTC current_date.';
REVOKE ALL ON FUNCTION public.br_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.br_today() TO authenticated, service_role;

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
      AND a.unlock_date <= br_today()
  )
$function$;
