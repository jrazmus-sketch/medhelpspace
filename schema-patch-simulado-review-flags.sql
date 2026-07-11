-- Simulado-100 review flags — Karina's pre-launch review of the free simulado set.
--
-- /admin/simulado-100 renders all 100 curated questions (full enunciado +
-- alternativas + gabarito + comentário) and lets content admins flag any that
-- should be SWAPPED out (questão anulada pelo INEP, enunciado problemático, tema
-- repetido), with an optional note. Presence of a row = flagged; unflagging
-- deletes the row.
--
-- Consumed by scripts/build-simulado-100.js: on re-run it EXCLUDES flagged ids
-- and picks replacements from the same área/topic pool (then --apply rewrites
-- app/src/lib/magnet/simulado-questions.ts).
--
-- RLS: deny-all (enabled, no policies) — mirrors `leads`. All reads/writes go
-- through role-checked server actions (app/src/actions/simulado-review.ts,
-- super_admin/content_admin only) using the service-role client.
--
-- Run with: node scripts/run-sql.js schema-patch-simulado-review-flags.sql

CREATE TABLE IF NOT EXISTS simulado_review_flags (
  question_id BIGINT      PRIMARY KEY REFERENCES quiz_questions(id) ON DELETE CASCADE,
  note        TEXT,
  updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE simulado_review_flags ENABLE ROW LEVEL SECURITY;

-- Belt-and-braces on top of RLS: strip the default PostgREST grants so even a
-- future permissive policy can't expose this to members (supabase default-grants
-- gotcha — new tables are granted to anon/authenticated at creation).
REVOKE ALL ON simulado_review_flags FROM anon, authenticated;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS simulado_review_flags;
