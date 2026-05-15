-- Notifications system
-- Run with: node scripts/run-sql.js schema-patch-notifications.sql

CREATE TABLE IF NOT EXISTS announcement_categories (
  id         serial      PRIMARY KEY,
  slug       text        UNIQUE NOT NULL,
  label      text        NOT NULL,
  color      text        NOT NULL DEFAULT '#9ca3af',
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO announcement_categories (slug, label, color, sort_order) VALUES
  ('exame',    'Exame',    '#7c3aed', 0),
  ('conteudo', 'Conteúdo', '#a78bfa', 1),
  ('noticias', 'Notícias', '#4ade80', 2),
  ('geral',    'Geral',    '#9ca3af', 3)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS announcements (
  id          serial      PRIMARY KEY,
  title       text        NOT NULL,
  body_html   text,
  category_id int         NOT NULL REFERENCES announcement_categories(id),
  priority    text        NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  status      text        NOT NULL DEFAULT 'draft'  CHECK (status  IN ('draft','published','scheduled')),
  pinned      boolean     NOT NULL DEFAULT false,
  publish_at  timestamptz NOT NULL DEFAULT now(),
  cohort_id   int         REFERENCES cohorts(id) ON DELETE SET NULL,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_status_publish_at
  ON announcements (status, publish_at DESC);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id int         NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS site_settings (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO site_settings (key, value) VALUES
  ('ticker_label', 'NOTIFICAÇÕES')
ON CONFLICT (key) DO NOTHING;

-- RLS: members can read published announcements targeted to all or their cohort
ALTER TABLE announcements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings         ENABLE ROW LEVEL SECURITY;

-- Admins bypass all RLS via admin client (service role)
-- Member-facing: read published announcements
DROP POLICY IF EXISTS "members can read published announcements" ON announcements;
CREATE POLICY "members can read published announcements"
  ON announcements FOR SELECT
  USING (
    status = 'published'
    AND publish_at <= now()
    AND (
      cohort_id IS NULL
      OR cohort_id IN (
        SELECT cohort_id FROM user_cohort_memberships WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "members can read categories" ON announcement_categories;
CREATE POLICY "members can read categories"
  ON announcement_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "members can read site settings" ON site_settings;
CREATE POLICY "members can read site settings"
  ON site_settings FOR SELECT USING (true);

-- Users can insert/read their own reads
DROP POLICY IF EXISTS "users can mark reads" ON announcement_reads;
CREATE POLICY "users can mark reads"
  ON announcement_reads FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users can read own reads" ON announcement_reads;
CREATE POLICY "users can read own reads"
  ON announcement_reads FOR SELECT
  USING (user_id = auth.uid());
