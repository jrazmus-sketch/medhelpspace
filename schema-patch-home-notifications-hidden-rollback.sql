-- Rollback of schema-patch-home-notifications-hidden.sql. Deploy the previous code first (it filters dismissed
-- welcomes again and never reads this column). announcement_dismissals was never touched, so nothing else to restore.
ALTER TABLE profiles DROP COLUMN IF EXISTS home_notifications_hidden;
