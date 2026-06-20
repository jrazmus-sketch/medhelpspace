-- schema-patch-swap-revalida-formula-gating.sql
--
-- Swaps the MedHelp 60D gating between Revalida Up and Fórmula MedHelp:
--   • Revalida Up  → ungated (day-1):  content_module_id 1 → NULL   (187 pages)
--   • Fórmula MedHelp → gated (60D):   content_module_id NULL → 1   (209 pages:
--       191 plain-content leaves + 17 per-specialty -formula hubs + 1 top hub)
--
-- Access control is driven by content_module_id (requireActiveMembership reads it
-- in the [slug] route), so this flip is the core of "which section gates which".
-- Idempotent: the WHERE guards make re-runs a no-op.
--
-- ROLLBACK (swap back):
--   UPDATE pages SET content_module_id = 1    WHERE view='revalida-up' AND content_module_id IS NULL;
--   UPDATE pages SET content_module_id = NULL WHERE view='formula'     AND content_module_id = 1;

UPDATE pages
SET content_module_id = NULL, updated_at = now()
WHERE view = 'revalida-up' AND content_module_id = 1;

UPDATE pages
SET content_module_id = 1, updated_at = now()
WHERE view = 'formula' AND content_module_id IS NULL;
