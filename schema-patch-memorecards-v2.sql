-- schema-patch-memorecards-v2.sql
--
-- MemoreCards v2 (Karina, 2026-09-23): the visual review cards become a MedVoice-style
-- section — grande área → especialidade → tema → one image at a time — inside
-- MedHelp 60D. They REPLACE the legacy memorecards pages, which were H5P
-- CoursePresentation shells (`presentation_slides`): 18 pages, 16 of them empty.
--
-- One row per card image, attached to the REVALIDA UP topic page it belongs to.
-- Her rule: the structure of MemoreCards is the structure of Revalida Up ("se o tema
-- existe no Revalida Up, ele também deverá ter espaço previsto nos MemoreCards"), so
-- the theme list, names, order and specialty all come from the topic pages, never
-- from a second taxonomy. Keying on the page id (not a slug string) means a topic
-- that is renamed or re-filed under another specialty carries its cards along.
--
-- A topic with no rows is simply "not yet available": it stays in the structure and
-- is left out of the study sequence — her item 9 — without any flag to maintain.
--
-- Access: members reach the cards through server components on the service-role
-- client, gated in app code by the MedHelp 60D unlock (get60dAccess), exactly like
-- Simulados 100Q. The read policy below is defense-in-depth in the same terms as
-- presentation_slides: module 1 unlocked AND the topic page published. Writes are
-- super_admin / content_admin only. RLS is enabled at creation (default-grants rule).
--
-- (topic_page_id, position) is UNIQUE, which also gives the FK its index — the
-- 2026-09-22 audit found several FKs without one.
--
-- Idempotent. Apply to BOTH databases:
--   node scripts/run-sql.js schema-patch-memorecards-v2.sql                                   # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-memorecards-v2.sql                                # local
--   then locally: NOTIFY pgrst, 'reload schema';
--
-- Rollback (nothing else references the table):
--   DROP TABLE IF EXISTS memorecard_items;

BEGIN;

CREATE TABLE IF NOT EXISTS memorecard_items (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_page_id bigint      NOT NULL REFERENCES pages(id) ON DELETE CASCADE,  -- a view='revalida-up' page
  position      smallint    NOT NULL CHECK (position > 0),                     -- 1-based order within the theme
  image_url     text        NOT NULL,
  width         smallint    NOT NULL CHECK (width > 0),                        -- intrinsic pixels, so the viewer
  height        smallint    NOT NULL CHECK (height > 0),                       -- reserves the right box (no jump)
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memorecard_items_topic_position_key UNIQUE (topic_page_id, position)
);

COMMENT ON TABLE memorecard_items IS
  'MemoreCards v2: one image card per row, attached to its Revalida Up topic page. A topic with no rows is not yet available and stays out of the study sequence.';

ALTER TABLE memorecard_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memorecard_items_read ON memorecard_items;
CREATE POLICY memorecard_items_read ON memorecard_items FOR SELECT USING (
  user_has_module_access(1::smallint)
  AND EXISTS (
    SELECT 1 FROM pages p
    WHERE p.id = memorecard_items.topic_page_id AND p.status = 'publish'
  )
);

DROP POLICY IF EXISTS memorecard_items_admin_all ON memorecard_items;
CREATE POLICY memorecard_items_admin_all ON memorecard_items
  USING      (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

COMMIT;
