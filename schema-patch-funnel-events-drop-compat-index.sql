-- schema-patch-funnel-events-drop-compat-index.sql
-- DEPLOY-TIME FINALIZATION — run this ONLY AFTER the per-funnel beacon code
-- (route with onConflict "session_id,event_type,funnel") is live in production.
--
-- Context: schema-patch-funnel-events-per-funnel.sql dropped the old 2-column
-- unique index and added the 3-column one. Because that patch was applied to
-- prod before the code deployed, the then-live route (onConflict on the 2-col
-- key) would have failed every beacon write, so the 2-col index
-- `funnel_events_session_type_uniq` was temporarily re-created to keep prod
-- writing. It is safe while all rows are single-funnel, but once the new code
-- records real per-funnel events, a session that visits two funnels would be
-- rejected by the stricter 2-col unique. Drop it here to enable per-funnel dedup.
--
-- Run with: node scripts/run-sql.js schema-patch-funnel-events-drop-compat-index.sql

DROP INDEX IF EXISTS funnel_events_session_type_uniq;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- CREATE UNIQUE INDEX funnel_events_session_type_uniq ON funnel_events (session_id, event_type);
--   (only valid while every row shares one funnel value)
