-- Index every single-column foreign key that has no index (49 on prod, 2026-09-25).
--
-- Found by the 22/09 pre-launch audit (quiz_attempts.question_id, orders.cohort_id/
-- coupon_id/promotion_id, review_schedule.specialty_id, ...) and generalised: an
-- unindexed FK makes every join on it a scan, and every DELETE on the parent table
-- (ON DELETE CASCADE / SET NULL / the RESTRICT check) scan the child. All tables are
-- small today, so plain CREATE INDEX is instant; run-sql.js wraps the file in one
-- transaction, which rules out CONCURRENTLY anyway.
--
-- Each index is guarded (table + column must exist), so the file is safe on local and
-- prod even if their schemas drift, and safe to re-run.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-fk-indexes.sql                     # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-fk-indexes.sql                   # local
--
-- Rollback: DROP INDEX IF EXISTS <name> for any index below (names are idx_<table>_<column>).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.admin_audit_log') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='admin_audit_log' AND column_name='actor_user_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor_user_id ON public.admin_audit_log (actor_user_id)';
  END IF;
  IF to_regclass('public.admin_audit_log') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='admin_audit_log' AND column_name='target_user_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_user_id ON public.admin_audit_log (target_user_id)';
  END IF;
  IF to_regclass('public.ambassadors') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ambassadors' AND column_name='access_cohort_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ambassadors_access_cohort_id ON public.ambassadors (access_cohort_id)';
  END IF;
  IF to_regclass('public.ambassadors') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ambassadors' AND column_name='access_revoked_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ambassadors_access_revoked_by ON public.ambassadors (access_revoked_by)';
  END IF;
  IF to_regclass('public.ambassadors') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ambassadors' AND column_name='coupon_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ambassadors_coupon_id ON public.ambassadors (coupon_id)';
  END IF;
  IF to_regclass('public.announcement_dismissals') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='announcement_dismissals' AND column_name='user_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_announcement_dismissals_user_id ON public.announcement_dismissals (user_id)';
  END IF;
  IF to_regclass('public.announcement_reads') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='announcement_reads' AND column_name='user_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON public.announcement_reads (user_id)';
  END IF;
  IF to_regclass('public.announcements') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='announcements' AND column_name='category_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_announcements_category_id ON public.announcements (category_id)';
  END IF;
  IF to_regclass('public.announcements') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='announcements' AND column_name='cohort_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_announcements_cohort_id ON public.announcements (cohort_id)';
  END IF;
  IF to_regclass('public.announcements') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='announcements' AND column_name='created_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON public.announcements (created_by)';
  END IF;
  IF to_regclass('public.clinact_attempts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinact_attempts' AND column_name='case_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clinact_attempts_case_id ON public.clinact_attempts (case_id)';
  END IF;
  IF to_regclass('public.clinact_case_versions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinact_case_versions' AND column_name='published_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clinact_case_versions_published_by ON public.clinact_case_versions (published_by)';
  END IF;
  IF to_regclass('public.clinact_cases') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinact_cases' AND column_name='created_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clinact_cases_created_by ON public.clinact_cases (created_by)';
  END IF;
  IF to_regclass('public.clinact_cases') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinact_cases' AND column_name='topic_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clinact_cases_topic_id ON public.clinact_cases (topic_id)';
  END IF;
  IF to_regclass('public.clinact_step_events') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinact_step_events' AND column_name='option_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clinact_step_events_option_id ON public.clinact_step_events (option_id)';
  END IF;
  IF to_regclass('public.clinact_step_events') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinact_step_events' AND column_name='step_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clinact_step_events_step_id ON public.clinact_step_events (step_id)';
  END IF;
  IF to_regclass('public.cohort_promotions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cohort_promotions' AND column_name='cohort_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cohort_promotions_cohort_id ON public.cohort_promotions (cohort_id)';
  END IF;
  IF to_regclass('public.cohort_promotions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cohort_promotions' AND column_name='rollover_to_cohort_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cohort_promotions_rollover_to_cohort_id ON public.cohort_promotions (rollover_to_cohort_id)';
  END IF;
  IF to_regclass('public.coupon_redemptions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='coupon_redemptions' AND column_name='user_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user_id ON public.coupon_redemptions (user_id)';
  END IF;
  IF to_regclass('public.coupons') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='coupons' AND column_name='created_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_coupons_created_by ON public.coupons (created_by)';
  END IF;
  IF to_regclass('public.editable_pages') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='editable_pages' AND column_name='updated_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_editable_pages_updated_by ON public.editable_pages (updated_by)';
  END IF;
  IF to_regclass('public.email_settings') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='email_settings' AND column_name='updated_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_email_settings_updated_by ON public.email_settings (updated_by)';
  END IF;
  IF to_regclass('public.email_templates') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='email_templates' AND column_name='updated_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_email_templates_updated_by ON public.email_templates (updated_by)';
  END IF;
  IF to_regclass('public.estudio_templates') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='estudio_templates' AND column_name='created_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_estudio_templates_created_by ON public.estudio_templates (created_by)';
  END IF;
  IF to_regclass('public.flashcard_progress') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='flashcard_progress' AND column_name='flashcard_item_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_flashcard_progress_flashcard_item_id ON public.flashcard_progress (flashcard_item_id)';
  END IF;
  IF to_regclass('public.lesson_completions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lesson_completions' AND column_name='lesson_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_lesson_completions_lesson_id ON public.lesson_completions (lesson_id)';
  END IF;
  IF to_regclass('public.lesson_completions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lesson_completions' AND column_name='page_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_lesson_completions_page_id ON public.lesson_completions (page_id)';
  END IF;
  IF to_regclass('public.lesson_progress') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lesson_progress' AND column_name='lesson_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson_id ON public.lesson_progress (lesson_id)';
  END IF;
  IF to_regclass('public.orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='cohort_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_cohort_id ON public.orders (cohort_id)';
  END IF;
  IF to_regclass('public.orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='coupon_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_coupon_id ON public.orders (coupon_id)';
  END IF;
  IF to_regclass('public.orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='promotion_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_promotion_id ON public.orders (promotion_id)';
  END IF;
  IF to_regclass('public.pagbank_subscription_api_calls') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pagbank_subscription_api_calls' AND column_name='user_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pagbank_subscription_api_calls_user_id ON public.pagbank_subscription_api_calls (user_id)';
  END IF;
  IF to_regclass('public.profiles') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='last_page_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_last_page_id ON public.profiles (last_page_id)';
  END IF;
  IF to_regclass('public.quiz_attempts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quiz_attempts' AND column_name='page_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quiz_attempts_page_id ON public.quiz_attempts (page_id)';
  END IF;
  IF to_regclass('public.quiz_attempts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quiz_attempts' AND column_name='question_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quiz_attempts_question_id ON public.quiz_attempts (question_id)';
  END IF;
  IF to_regclass('public.quiz_attempts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quiz_attempts' AND column_name='specialty_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quiz_attempts_specialty_id ON public.quiz_attempts (specialty_id)';
  END IF;
  IF to_regclass('public.review_schedule') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='review_schedule' AND column_name='specialty_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_review_schedule_specialty_id ON public.review_schedule (specialty_id)';
  END IF;
  IF to_regclass('public.simulado_review_flags') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='simulado_review_flags' AND column_name='updated_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_simulado_review_flags_updated_by ON public.simulado_review_flags (updated_by)';
  END IF;
  IF to_regclass('public.simulado_sections') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='simulado_sections' AND column_name='updated_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_simulado_sections_updated_by ON public.simulado_sections (updated_by)';
  END IF;
  IF to_regclass('public.site_content') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='site_content' AND column_name='updated_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_site_content_updated_by ON public.site_content (updated_by)';
  END IF;
  IF to_regclass('public.site_pages') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='site_pages' AND column_name='updated_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_site_pages_updated_by ON public.site_pages (updated_by)';
  END IF;
  IF to_regclass('public.study_plan_excluded_specialties') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='study_plan_excluded_specialties' AND column_name='specialty_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_study_plan_excluded_specialties_specialty_id ON public.study_plan_excluded_specialties (specialty_id)';
  END IF;
  IF to_regclass('public.study_plan_focus_specialties') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='study_plan_focus_specialties' AND column_name='specialty_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_study_plan_focus_specialties_specialty_id ON public.study_plan_focus_specialties (specialty_id)';
  END IF;
  IF to_regclass('public.study_plans') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='study_plans' AND column_name='focus_specialty_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_study_plans_focus_specialty_id ON public.study_plans (focus_specialty_id)';
  END IF;
  IF to_regclass('public.study_types') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='study_types' AND column_name='updated_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_study_types_updated_by ON public.study_types (updated_by)';
  END IF;
  IF to_regclass('public.support_ticket_messages') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='support_ticket_messages' AND column_name='author_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_author_id ON public.support_ticket_messages (author_id)';
  END IF;
  IF to_regclass('public.support_tickets') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='support_tickets' AND column_name='cohort_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_support_tickets_cohort_id ON public.support_tickets (cohort_id)';
  END IF;
  IF to_regclass('public.support_tickets') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='support_tickets' AND column_name='handled_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_support_tickets_handled_by ON public.support_tickets (handled_by)';
  END IF;
  IF to_regclass('public.user_cohort_memberships') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_cohort_memberships' AND column_name='promotion_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_cohort_memberships_promotion_id ON public.user_cohort_memberships (promotion_id)';
  END IF;
END
$$;

COMMIT;
