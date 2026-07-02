-- Welcome announcement: per-member "pin to top until dismissed"
-- Run with: node scripts/run-sql.js schema-patch-welcome-announcement.sql
--
-- Adds an is_welcome flag on announcements. A welcome announcement sorts to the
-- top of every member's notification strip until THAT member dismisses it (a
-- per-user action, distinct from "read"). Dismissals live in their own table so
-- opening the strip — which marks items read — never dismisses the welcome.

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS is_welcome boolean NOT NULL DEFAULT false;

-- Only one welcome at a time: unique across rows where is_welcome is true.
-- (Rows with is_welcome = false are excluded, so they never collide.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_announcements_single_welcome
  ON announcements (is_welcome) WHERE is_welcome;

CREATE TABLE IF NOT EXISTS announcement_dismissals (
  announcement_id int         NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  dismissed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

ALTER TABLE announcement_dismissals ENABLE ROW LEVEL SECURITY;

-- Users can dismiss (insert) and read their own dismissals. Admin client
-- (service role) bypasses RLS for the member-facing feed query.
DROP POLICY IF EXISTS "users can dismiss announcements" ON announcement_dismissals;
CREATE POLICY "users can dismiss announcements"
  ON announcement_dismissals FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users can read own dismissals" ON announcement_dismissals;
CREATE POLICY "users can read own dismissals"
  ON announcement_dismissals FOR SELECT
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (manual):
--   DROP TABLE IF EXISTS announcement_dismissals;
--   DROP INDEX IF EXISTS uq_announcements_single_welcome;
--   ALTER TABLE announcements DROP COLUMN IF EXISTS is_welcome;
