-- schema-patch-revalida-up-view.sql
--
-- Adds 'revalida-up' to the page_view enum so the 187 Revalida UP / CaiuNaProva
-- topic pages can carry view='revalida-up' — the trigger PlainContentRenderer
-- keys on to apply the .prose-caiunaprova styling (➤ header, purple ① headings,
-- ✔ checklists, purple-square PADRÃO DE PROVA callout).
--
-- ORDERING: ALTER TYPE ... ADD VALUE creates a value that cannot be USED in the
-- same transaction it is added (PostgreSQL rule). run-sql.js wraps each file in
-- one transaction, so this file must be applied and COMMITTED on its own FIRST,
-- then parsed/revalida-up-import.sql (which uses the value) is applied second.
--
--   node scripts/run-sql.js schema-patch-revalida-up-view.sql   <-- run this first
--   node scripts/run-sql.js parsed/revalida-up-import.sql        <-- then this
--
-- Idempotent: IF NOT EXISTS makes re-runs a no-op.
-- Rollback: enum values cannot be dropped in Postgres without recreating the
-- type. Leaving an unused value is harmless, so there is no rollback step.

ALTER TYPE page_view ADD VALUE IF NOT EXISTS 'revalida-up';
