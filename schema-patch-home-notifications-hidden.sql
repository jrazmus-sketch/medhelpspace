-- Notificações box on the Revalida home (/app) — hide with the X, restore from the bell (Karina 2026-11-20, 23h28 BRT).
--
-- The X on the home box now ONLY hides the box for that member (this column, on the account, so it follows them to
-- any device). It never deletes, dismisses or marks a notification as read: the announcements stay in the bell.
-- Restore: "Mostrar notificações na página inicial" in the bell sets it back to false.
--
-- Before this patch the X (shown only on the welcome message) wrote announcement_dismissals, which removed the welcome
-- from the box AND the bell. Those rows are KEPT as history but no longer filter anything (lib/announcements.ts);
-- every member who had dismissed a welcome starts with the box hidden — exactly what they see today — and can now
-- restore it from the bell. (On 20/11/2026 that is one member: the one who tested it.)
--
-- Idempotent. Rollback: schema-patch-home-notifications-hidden-rollback.sql

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS home_notifications_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.home_notifications_hidden IS
  'Member hid the Notificações box on the Revalida home with its X. Only hides the box: notifications stay in the bell, unread stays unread. Restored from the bell.';

UPDATE profiles p
   SET home_notifications_hidden = true
 WHERE home_notifications_hidden = false
   AND EXISTS (
     SELECT 1
       FROM announcement_dismissals d
       JOIN announcements a ON a.id = d.announcement_id
      WHERE d.user_id = p.id
        AND a.is_welcome
   );
