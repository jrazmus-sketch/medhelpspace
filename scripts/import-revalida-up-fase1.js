#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * import-revalida-up-fase1.js — generate the SQL for the 24 DEFINITIVE Revalida Up files
 * Karina sent with her "Fase 1" report (2026-11-17, Drive folder "revalida up atualizado",
 * `<tema>-revalida-up.md.docx`). Same Word shape as the September delivery, so the
 * converter of import-revalida-up-v2.js is reused as is.
 *
 * GENERATOR ONLY: reads the .docx files, writes parsed/revalida-up-fase1-import.sql and its
 * rollback. It never connects to a database. Apply with scripts/run-sql.js, once per database.
 *
 *   node scripts/import-revalida-up-fase1.js
 *   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
 *     node scripts/run-sql.js parsed/revalida-up-fase1-import.sql      # local
 *   node scripts/run-sql.js parsed/revalida-up-fase1-import.sql        # prod
 *
 * Unlike the v2 importer this one touches ONLY the delivered themes — it never looks at,
 * retires or "verifies away" any other Revalida Up page.
 *
 * Rules (her report, sections 0 and 4):
 *   - "reutilizar páginas existentes": the FILE NAME is the platform theme, so it picks the
 *     live page (LIVE below). The page keeps its id (Meu Plano links, completions and
 *     MemoreCards key on it), its address (slug) and its specialty — the headers inside the
 *     files name specialties that do not exist ("ortopedia") or that she already ruled wrong
 *     (Otorrinolaringologia = Outros, 2026-09-13).
 *   - title = the title written in the file, normalised to "… Revalida Up" (same as v2).
 *   - text = the file, verbatim.
 *   - "Ortopedia" (arquivo geral) REUSES the page "Trauma e Infecções Musculoesqueléticas
 *     Revalida Up" — never a duplicate: that row is renamed (slug, title) and moves to Outros,
 *     next to the Questões section Outros › Ortopedia.
 *   - "Espondiloartrites" is the only new page (Reumatologia).
 *   - UPDATE in place, never delete + reinsert (topic_content cascades on delete).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { convert, fixTitle, sqlStr } = require("./import-revalida-up-v2.js");

const SRC =
  process.env.REVALIDA_FASE1_SRC ||
  "C:/Users/jrazm/OneDrive/Desktop/Medhelpspace/11-17-2026/extraido/revalida up atualizado";
const OUT = path.join(__dirname, "..", "parsed", "revalida-up-fase1-import.sql");
const OUT_RB = path.join(__dirname, "..", "parsed", "revalida-up-fase1-rollback.sql");

// file name (without .md.docx) → the LIVE page it replaces. A file absent from this map
// replaces the page whose slug IS the file name.
const LIVE = {
  "coluna-vertebral-e-trauma-raquimedular-revalida-up": "coluna-vertebral-trauma-raquimedular-revalida-up",
  "diabetes-na-gestacao-revalida-up": "diabetes-gestacional-revalida-up",
  "diarreia-aguda-revalida-up": "diarreia-e-desidratacao-revalida-up",
  "etica-medica-e-medicina-legal-revalida-up": "etica-medica-medicina-legal-revalida-up",
  "hernias-revalida-up": "hernia-revalida-up",
  "pancreatites-revalida-up": "pancreatite-revalida-up",
  "pre-natal-revalida-up": "assistencia-pre-natal-revalida-up",
};
// Reused under a new address: live slug → { new slug, new specialty }.
const REUSE = {
  "ortopedia-revalida-up": { from: "trauma-infeccoes-musculoesqueleticas-revalida-up", specialty: "outros" },
};
// Brand-new pages: file name → specialty.
const NEW = { "espondiloartrites-revalida-up": "reumatologia" };

function main() {
  if (!fs.existsSync(SRC)) { console.error(`Source dir not found: ${SRC}`); process.exit(1); }
  const files = fs.readdirSync(SRC).filter((f) => /\.md\.docx$/.test(f) && !f.startsWith("~$")).sort();
  const rows = [];
  const problems = [];
  for (const f of files) {
    const name = f.replace(/\.md\.docx$/, "");
    const { fm, html, stats, warnings } = convert(path.join(SRC, f));
    for (const w of warnings) problems.push(`${f}: ${w}`);
    if (!fm) { problems.push(`${f}: no header`); continue; }
    if (fm.view !== "revalida-up" || fm.type !== "plain-content") problems.push(`${f}: view/type = ${fm.view}/${fm.type}`);
    const kind = REUSE[name] ? "reuse" : NEW[name] ? "new" : "update";
    rows.push({
      name, kind,
      live: kind === "reuse" ? REUSE[name].from : kind === "new" ? null : LIVE[name] || name,
      slug: kind === "update" ? LIVE[name] || name : name,           // address after the import
      spec: kind === "reuse" ? REUSE[name].specialty : kind === "new" ? NEW[name] : null, // null = keep
      title: fixTitle(fm.title), fileSlug: fm.slug, fileSpec: fm.specialty, html, ...stats,
    });
  }
  if (problems.length) { console.error("PROBLEMS — nothing written:\n  " + problems.join("\n  ")); process.exit(1); }
  if (rows.length !== 24) { console.error(`expected 24 files, found ${rows.length} — nothing written`); process.exit(1); }

  const values = rows
    .map((r, i) => `  (${i + 1}, ${sqlStr(r.kind)}, ${r.live ? sqlStr(r.live) : "NULL"}, ${sqlStr(r.slug)}, ${r.spec ? sqlStr(r.spec) : "NULL"}, ${sqlStr(r.title)}, ${sqlStr(r.html)})`)
    .join(",\n");
  const touched = rows.map((r) => r.live).filter(Boolean).concat(rows.map((r) => r.slug));
  const touchedList = [...new Set(touched)].map(sqlStr).join(", ");

  const sql = `-- revalida-up-fase1-import.sql  (GENERATED by scripts/import-revalida-up-fase1.js — do not hand-edit)
--
-- Karina 2026-11-17, "Fase 1": the ${rows.length} definitive Revalida Up files. Only these themes are touched.
--   ${rows.filter((r) => r.kind === "update").length} existing pages: title + text replaced in place (same id, address and specialty)
--   ${rows.filter((r) => r.kind === "reuse").length} reused page: "Trauma e Infecções Musculoesqueléticas" becomes the general "Ortopedia" (Outros)
--   ${rows.filter((r) => r.kind === "new").length} new page: Espondiloartrites (Reumatologia)
-- run-sql.js wraps the file in one transaction. Backups: *_bk_fase1_ru. Rollback: revalida-up-fase1-rollback.sql.

CREATE TEMP TABLE np (rn int, kind text, live text, slug text PRIMARY KEY, spec text, title text, body text) ON COMMIT DROP;
INSERT INTO np (rn, kind, live, slug, spec, title, body) VALUES
${values};

-- Guards: every page to replace exists exactly once as a Revalida Up page; a new address is free
-- (or already ours, on a re-run).
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(np.live, ', ') INTO bad FROM np
   WHERE np.kind = 'update' AND (SELECT count(*) FROM pages p WHERE p.slug = np.live AND p.view = 'revalida-up') <> 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'Revalida Up page(s) not found: % — nothing changed', bad; END IF;
  SELECT string_agg(np.slug, ', ') INTO bad FROM np
   WHERE np.kind = 'reuse'
     AND (SELECT count(*) FROM pages p WHERE p.view = 'revalida-up' AND p.slug IN (np.live, np.slug)) <> 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'page to reuse not found (or both addresses exist): % — nothing changed', bad; END IF;
  SELECT string_agg(np.slug, ', ') INTO bad FROM np
   WHERE np.kind = 'new' AND EXISTS (SELECT 1 FROM pages p WHERE p.slug = np.slug AND p.view IS DISTINCT FROM 'revalida-up');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'address already used by another page: % — nothing changed', bad; END IF;
  SELECT string_agg(DISTINCT np.spec, ', ') INTO bad FROM np LEFT JOIN specialties s ON s.slug = np.spec
   WHERE np.spec IS NOT NULL AND s.id IS NULL;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'unknown specialty: % — nothing changed', bad; END IF;
END $$;

-- Backups (full rows, taken once: a re-run keeps the ORIGINAL state).
CREATE TABLE IF NOT EXISTS pages_bk_fase1_ru AS
  SELECT * FROM pages WHERE slug IN (${touchedList});
CREATE TABLE IF NOT EXISTS lessons_bk_fase1_ru AS
  SELECT l.* FROM lessons l JOIN pages p ON p.id = l.page_id WHERE p.slug IN (${touchedList});
ALTER TABLE pages_bk_fase1_ru ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons_bk_fase1_ru ENABLE ROW LEVEL SECURITY;

-- 1. The reused page takes its new address and place (same id).
UPDATE pages p
SET slug = np.slug, specialty_id = (SELECT id FROM specialties WHERE slug = np.spec), updated_at = now()
FROM np WHERE np.kind = 'reuse' AND p.slug = np.live AND p.view = 'revalida-up';

-- 2. Existing pages (incl. the reused one): title on the page, title + text on its lesson.
UPDATE pages p
SET title = np.title, status = 'publish', updated_at = now()
FROM np WHERE np.kind IN ('update', 'reuse') AND p.slug = np.slug AND p.view = 'revalida-up';

UPDATE lessons l
SET title = np.title, body_html = np.body, updated_at = now()
FROM np JOIN pages p ON p.slug = np.slug AND p.view = 'revalida-up'
WHERE np.kind IN ('update', 'reuse') AND l.page_id = p.id AND l.position = 1;

INSERT INTO lessons (page_id, position, title, body_html)
SELECT p.id, 1, np.title, np.body
FROM np JOIN pages p ON p.slug = np.slug AND p.view = 'revalida-up'
WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.page_id = p.id AND l.position = 1);

-- 3. New page(s).
WITH base AS (SELECT COALESCE(MAX(id), 0) AS m FROM pages),
newrows AS (
  SELECT np.*, row_number() OVER (ORDER BY np.slug) AS n
  FROM np WHERE np.kind = 'new' AND NOT EXISTS (SELECT 1 FROM pages p WHERE p.slug = np.slug)
),
ins AS (
  INSERT INTO pages (id, slug, title, type, status, view, content_module_id, specialty_id, notes, wp_created_at, wp_modified_at)
  SELECT base.m + newrows.n, newrows.slug, newrows.title, 'plain-content'::page_type, 'publish', 'revalida-up'::page_view, NULL,
         (SELECT id FROM specialties WHERE slug = newrows.spec), 'Karina 2026-11-17 (Fase 1): Revalida Up novo', now(), now()
  FROM newrows CROSS JOIN base
  RETURNING id, slug
)
INSERT INTO lessons (page_id, position, title, body_html)
SELECT ins.id, 1, np.title, np.body FROM ins JOIN np ON np.slug = ins.slug;

-- ── Verification (printed by run-sql.js) ──
-- Expect ${rows.length}: delivered themes that are published with exactly the delivered text and title.
SELECT count(*) AS delivered_live
FROM np JOIN pages p ON p.slug = np.slug AND p.view = 'revalida-up' AND p.status = 'publish' AND p.title = np.title
JOIN lessons l ON l.page_id = p.id AND l.position = 1 AND l.body_html = np.body;

-- Expect 0: a delivered page with more than one lesson.
SELECT count(*) AS pages_with_extra_lessons
FROM np JOIN pages p ON p.slug = np.slug WHERE (SELECT count(*) FROM lessons l WHERE l.page_id = p.id) <> 1;

SELECT np.kind, p.id, p.slug, p.title, s.slug AS specialty
FROM np JOIN pages p ON p.slug = np.slug LEFT JOIN specialties s ON s.id = p.specialty_id ORDER BY np.rn;
`;

  const rb = `-- revalida-up-fase1-rollback.sql  (GENERATED) — restores the ${rows.length} themes exactly as they were before
-- revalida-up-fase1-import.sql (timestamps included) and removes the page(s) it created.
DO $$
BEGIN
  IF to_regclass('public.pages_bk_fase1_ru') IS NULL OR to_regclass('public.lessons_bk_fase1_ru') IS NULL THEN
    RAISE EXCEPTION 'backup tables *_bk_fase1_ru not found — nothing changed';
  END IF;
END $$;

-- New pages (they have no backup row): remove their Meu Plano links first only if the main Fase 1 patch was
-- rolled back before this file — a remaining link aborts here instead of cascading.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM topic_content tc JOIN pages p ON p.id = tc.page_id
              WHERE p.slug IN (${rows.filter((r) => r.kind === "new").map((r) => sqlStr(r.slug)).join(", ")})
                AND NOT EXISTS (SELECT 1 FROM pages_bk_fase1_ru b WHERE b.id = p.id)) THEN
    RAISE EXCEPTION 'a Meu Plano link still points at a page created by the import — roll back schema-patch-fase1-2026-11-17.sql first';
  END IF;
END $$;
DELETE FROM pages p
 WHERE p.slug IN (${rows.filter((r) => r.kind === "new").map((r) => sqlStr(r.slug)).join(", ")}) AND p.view = 'revalida-up'
   AND NOT EXISTS (SELECT 1 FROM pages_bk_fase1_ru b WHERE b.id = p.id);

-- Triggers off while the rows are restored: the updated_at trigger would stamp "now" over the original dates.
ALTER TABLE pages DISABLE TRIGGER USER;
ALTER TABLE lessons DISABLE TRIGGER USER;

UPDATE pages p
SET slug = b.slug, title = b.title, status = b.status, specialty_id = b.specialty_id, notes = b.notes, updated_at = b.updated_at
FROM pages_bk_fase1_ru b WHERE p.id = b.id;

UPDATE lessons l
SET title = b.title, body_html = b.body_html, updated_at = b.updated_at
FROM lessons_bk_fase1_ru b WHERE l.id = b.id;

ALTER TABLE pages ENABLE TRIGGER USER;
ALTER TABLE lessons ENABLE TRIGGER USER;

-- Expect 0 / 0: pages or lessons that still differ from the backup.
SELECT count(*) AS pages_differ FROM pages p JOIN pages_bk_fase1_ru b ON b.id = p.id
 WHERE (p.slug, p.title, p.status, p.specialty_id, p.updated_at) IS DISTINCT FROM (b.slug, b.title, b.status, b.specialty_id, b.updated_at);
SELECT count(*) AS lessons_differ FROM lessons l JOIN lessons_bk_fase1_ru b ON b.id = l.id
 WHERE (l.title, l.body_html, l.updated_at) IS DISTINCT FROM (b.title, b.body_html, b.updated_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pages p JOIN pages_bk_fase1_ru b ON b.id = p.id WHERE row(p.*) IS DISTINCT FROM row(b.*))
     OR EXISTS (SELECT 1 FROM lessons l JOIN lessons_bk_fase1_ru b ON b.id = l.id WHERE row(l.*) IS DISTINCT FROM row(b.*)) THEN
    RAISE EXCEPTION 'Revalida Up rollback: a page or lesson still differs from the backup - nothing changed';
  END IF;
END $$;
DROP TABLE pages_bk_fase1_ru, lessons_bk_fase1_ru;
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, sql, "utf8");
  fs.writeFileSync(OUT_RB, rb, "utf8");

  const tot = (k) => rows.reduce((n, r) => n + r[k], 0);
  console.log(`\nRevalida Up — Fase 1 (${rows.length} files)`);
  console.log(`  insights: ${tot("h3")}   PADRÃO: ${tot("padrao")}   bullets: ${tot("bullets")}   stray <p>: ${tot("stray")}`);
  for (const r of rows) {
    console.log(`  ${r.kind.padEnd(6)} ${r.slug.replace(/-revalida-up$/, "").padEnd(46)} ${String(r.h3).padStart(2)} insights  "${r.title}"` +
      (r.live && r.live !== r.slug ? `   (was ${r.live.replace(/-revalida-up$/, "")})` : ""));
  }
  console.log(`\n  wrote ${path.relative(process.cwd(), OUT)} (${(sql.length / 1024).toFixed(0)} KB) and ${path.relative(process.cwd(), OUT_RB)}\n`);
}

main();
