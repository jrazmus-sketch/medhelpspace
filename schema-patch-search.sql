-- Postgres full-text search across pages + lessons
-- Run with: node scripts/run-sql.js schema-patch-search.sql

-- ── pages: search_tsv generated from title (and slug for fallback) ────────────

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese', regexp_replace(coalesce(slug, ''), '-', ' ', 'g')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS pages_search_tsv_idx
  ON pages USING GIN(search_tsv);

-- ── lessons: search_tsv from title + body_html (stripped) ────────────────────

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese',
      coalesce(regexp_replace(body_html, '<[^>]+>', ' ', 'g'), '')
    ), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS lessons_search_tsv_idx
  ON lessons USING GIN(search_tsv);

-- ── Helper RPC: search both tables, return unified results ───────────────────
-- Returns: list of pages + matching lesson title (if matched via lesson)
--
-- Usage from app: supabase.rpc('search_content', { q: 'cardiopatia' })

CREATE OR REPLACE FUNCTION search_content(q TEXT, max_results INT DEFAULT 25)
RETURNS TABLE (
  page_id          BIGINT,
  page_title       TEXT,
  page_slug        TEXT,
  page_type        TEXT,
  specialty_id     INT,
  specialty_slug   TEXT,
  specialty_name   TEXT,
  matched_lesson_id    BIGINT,
  matched_lesson_title TEXT,
  rank             REAL
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH query AS (
    SELECT plainto_tsquery('portuguese', q) AS tsq
  ),
  page_hits AS (
    SELECT
      p.id            AS page_id,
      p.title         AS page_title,
      p.slug          AS page_slug,
      p.type::text    AS page_type,
      p.specialty_id  AS specialty_id,
      ts_rank(p.search_tsv, (SELECT tsq FROM query)) AS rank
    FROM pages p
    WHERE p.search_tsv @@ (SELECT tsq FROM query)
      AND p.status = 'publish'
  ),
  lesson_hits AS (
    SELECT
      p.id            AS page_id,
      p.title         AS page_title,
      p.slug          AS page_slug,
      p.type::text    AS page_type,
      p.specialty_id  AS specialty_id,
      l.id            AS matched_lesson_id,
      l.title         AS matched_lesson_title,
      ts_rank(l.search_tsv, (SELECT tsq FROM query)) AS rank
    FROM lessons l
    JOIN pages p ON p.id = l.page_id
    WHERE l.search_tsv @@ (SELECT tsq FROM query)
      AND p.status = 'publish'
  ),
  combined AS (
    SELECT page_id, page_title, page_slug, page_type, specialty_id,
           NULL::BIGINT AS matched_lesson_id,
           NULL::TEXT   AS matched_lesson_title,
           rank * 1.5 AS rank  -- boost page-title matches
    FROM page_hits
    UNION ALL
    SELECT page_id, page_title, page_slug, page_type, specialty_id,
           matched_lesson_id, matched_lesson_title, rank
    FROM lesson_hits
  ),
  ranked AS (
    SELECT
      page_id, page_title, page_slug, page_type, specialty_id,
      matched_lesson_id, matched_lesson_title,
      MAX(rank) AS rank,
      ROW_NUMBER() OVER (PARTITION BY page_id ORDER BY MAX(rank) DESC) AS rn
    FROM combined
    GROUP BY page_id, page_title, page_slug, page_type, specialty_id,
             matched_lesson_id, matched_lesson_title
  )
  SELECT
    r.page_id, r.page_title, r.page_slug, r.page_type,
    r.specialty_id,
    s.slug AS specialty_slug,
    s.name AS specialty_name,
    r.matched_lesson_id, r.matched_lesson_title,
    r.rank
  FROM ranked r
  LEFT JOIN specialties s ON s.id = r.specialty_id
  WHERE r.rn = 1
  ORDER BY r.rank DESC
  LIMIT max_results
$$;
