-- Structured page control for the ClinAct sales page (Etapa 3, Karina 2026-09-01/02).
--
-- `site_content` already makes every string on a landing editable without a
-- deploy. Three things it cannot express, and that her brief asks for:
--
--   1. section visibility — hide a section without deleting its copy;
--   2. section order;
--   3. whether the page is public at all.
--
-- Deliberately NOT stored as strings in site_content: a boolean kept as text is
-- one typo away from silently meaning "visible" ("false", "FALSE", "não", "0"
-- all read as truthy somewhere). These are real booleans and integers.
--
-- Deliberately NOT a page builder. Her words: "um editor estruturado e seguro,
-- específico para a página do ClinAct". The sections are defined in code; this
-- table only says which are shown, in what order, and whether the page is live.
--
-- HER DECISION 6, which this exists to enforce: the sales page must NOT be
-- public until signup + the four free cases + subscription work end to end.
-- `site_pages.published = false` keeps /clinact serving today's placeholder to
-- the public while admins see the real page for review. One flag flips it.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-site-sections.sql                     # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-site-sections.sql                   # local
--
-- Rollback:
--   DROP TABLE IF EXISTS site_sections;
--   DROP TABLE IF EXISTS site_pages;

BEGIN;

-- ── Is the page public at all? ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_pages (
  page       text        PRIMARY KEY,
  published  boolean     NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE site_pages IS
  'Page-level publish gate. false = only admins see the real page; the public keeps getting the placeholder.';

-- ── Which sections are shown, and in what order ──────────────────────────────

CREATE TABLE IF NOT EXISTS site_sections (
  page       text        NOT NULL,
  key        text        NOT NULL,
  visible    boolean     NOT NULL DEFAULT true,
  position   integer     NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page, key)
);

CREATE INDEX IF NOT EXISTS site_sections_page_idx ON site_sections (page, position);

COMMENT ON TABLE site_sections IS
  'Visibility + order for the structured landing sections. Sections themselves are defined in code; a row missing here means the section renders in its code-declared default position.';

-- ── Access ───────────────────────────────────────────────────────────────────
-- Read path is the service-role client, like site_content. RLS on as
-- defence-in-depth: nothing here is secret (it describes a public page), but
-- nothing needs to reach it from the browser either.

ALTER TABLE site_pages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_sections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON site_pages    FROM anon, authenticated;
REVOKE ALL ON site_sections FROM anon, authenticated;

-- ── Seed: the ClinAct sales page, unpublished, in her brief's order ──────────
-- Her §1 order: problema → proposta → experiência → diferenciais → acompanhamento
-- → experimentação gratuita → assinatura. "o-que-e-nao-e" starts hidden: she
-- marked it optional and hideable.

INSERT INTO site_pages (page, published) VALUES ('clinact', false)
ON CONFLICT (page) DO NOTHING;

INSERT INTO site_sections (page, key, visible, position) VALUES
  ('clinact', 'hero',            true,  1),
  ('clinact', 'problema',        true,  2),
  ('clinact', 'competencias',    true,  3),
  ('clinact', 'casos',           true,  4),
  ('clinact', 'midia',           true,  5),
  ('clinact', 'confianca',       true,  6),
  ('clinact', 'evolucao',        true,  7),
  ('clinact', 'revisao',         true,  8),
  ('clinact', 'leve-deste-caso', true,  9),
  ('clinact', 'biblioteca',      true, 10),
  ('clinact', 'gratuitos',       true, 11),
  ('clinact', 'para-quem',       true, 12),
  ('clinact', 'o-que-e-nao-e',   false, 13),
  ('clinact', 'planos',          true, 14)
ON CONFLICT (page, key) DO NOTHING;

COMMIT;
