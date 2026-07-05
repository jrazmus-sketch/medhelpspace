-- Instagram Studio — user-saved custom templates (shared across content admins).
-- The studio (/admin/estudio) lets Justin & Karina build a card — a base layout
-- plus typed field values, freeform elements (logo/badge/text/box/image), and
-- style (accent, background, ratio). "Save as template" snapshots that whole
-- working state into a reusable row so a hand-built layout can be reapplied in
-- one click. Shared (not per-browser) so both admins see the same library.
--
-- `payload` is the full snapshot: { values, overlays, accent, bg, layout,
-- footer, textScale, ratioId, glow/grid }. Uploaded images inside it are stored
-- as inlined data: URLs by the client before save (blob: URLs die on reload);
-- site-library images stay as their /public path.
--
-- Run with: node scripts/run-sql.js schema-patch-estudio-templates.sql
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS estudio_templates (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT         NOT NULL,
  -- Which built-in template this design derives from (renderer + field schema).
  base_template_id  TEXT         NOT NULL,
  -- Full studio snapshot (see header). Validated/shaped by the app, not the DB.
  payload           JSONB        NOT NULL,
  -- SET NULL (not CASCADE): an admin leaving shouldn't erase a shared template.
  created_by        UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estudio_templates_recent_idx
  ON estudio_templates(updated_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Content-capable admins (same set that can open the studio: super/content) may
-- read + manage every saved template — it's a shared team library, not per-user.
-- Server actions run under the caller's session, so these policies are the real
-- gate (defense-in-depth: the actions also re-check the role).
ALTER TABLE estudio_templates ENABLE ROW LEVEL SECURITY;

-- New tables are auto-granted to anon/authenticated in Supabase; lock anon out
-- entirely (this is admin-only tooling) and let RLS gate authenticated callers.
REVOKE ALL ON estudio_templates FROM anon;

DROP POLICY IF EXISTS estudio_templates_admin_all ON estudio_templates;
CREATE POLICY estudio_templates_admin_all ON estudio_templates
  FOR ALL
  USING      (current_user_role() IN ('super_admin','content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin','content_admin'));

-- ── ROLLBACK (manual) ─────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS estudio_templates;
