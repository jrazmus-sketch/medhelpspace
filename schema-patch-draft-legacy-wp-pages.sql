-- schema-patch-draft-legacy-wp-pages.sql
--
-- Data fix (no DDL). Unpublishes 7 leftover WordPress / WooCommerce / Divi-demo
-- pages that were imported into `pages` but have no role in the new app. They
-- have no specialty, view, track, or content module, so the member router cannot
-- render them: the admin "Ver no site" link (and any direct hit) resolves to a
-- 404 at /app/<slug>. Flipping them to draft removes them from the live site
-- while keeping the rows for reference.
--
--   id 2     sample-page           "Sample Page"           — WP default page
--   id 19    shop                  "Loja"                  — WooCommerce shop placeholder
--   id 29    schedule              "Schedule"              — Divi demo layout
--   id 31    talk                  "Talk"                  — Divi demo layout
--   id 39    contact               "Contact"               — Divi demo layout
--   id 645   questions-page-blank  "Question Page Blank"   — blank scratch template
--   id 8039  loja                  "Loja"                  — legacy store page (the live
--                                                            store is the /loja route,
--                                                            driven by cohorts, not pages)
--
-- Safety verified before writing:
--   • 0 inbound nav_items.target_page_id reference any of these 7 (checked).
--   • 0 references to their slugs anywhere in app/src (grep clean).
--   • The /loja store route reads getCohortsForSale(), not the pages table, so
--     drafting the `shop`/`loja` rows does not affect the store.
-- The other WP defaults (hello-world, privacy-policy, refund_returns) are already
-- draft, so they are intentionally not touched here.
--
-- Idempotent: the `AND status = 'publish'` guard makes a re-run a no-op.
-- Reversible: see the Rollback block at the bottom.

BEGIN;

-- ── Unpublish the 7 legacy WP/Woo/demo pages ──
UPDATE pages
SET status = 'draft', updated_at = now()
WHERE id IN (2, 19, 29, 31, 39, 645, 8039)
  AND status = 'publish';

-- ── Verification ──
-- Expect: all 7 now 'draft'.
SELECT id, slug, title, status
FROM pages
WHERE id IN (2, 19, 29, 31, 39, 645, 8039)
ORDER BY id;

COMMIT;

-- ── Rollback (manual) ──
-- Re-publishes the 7 pages:
--
--   UPDATE pages
--   SET status = 'publish', updated_at = now()
--   WHERE id IN (2, 19, 29, 31, 39, 645, 8039)
--     AND status = 'draft';
