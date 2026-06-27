#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * import-revalida-up.js — generate the SQL that imports the 187 Revalida UP /
 * CaiuNaProva topic pages (Documents/revalida-up/<specialty>/**.md) into the
 * `pages` + `lessons` tables.
 *
 * GENERATOR ONLY. This script reads the local .md files and WRITES
 * parsed/revalida-up-import.sql. It does NOT connect to or modify the database.
 * Apply the result (in this order) with the existing runner:
 *
 *   node scripts/run-sql.js schema-patch-revalida-up-view.sql   # enum value, FIRST (own commit)
 *   node scripts/run-sql.js parsed/revalida-up-import.sql        # the 187 pages + lessons
 *
 * Decisions baked in (see CLAUDE.md + session plan):
 *  - specialty comes from frontmatter (honors the 11 cross-tags: GI cancers →
 *    gastroenterologia, trauma → emergencia, cirurgia-pediatrica → cirurgia-geral)
 *  - slug == filename; type=plain-content; view=revalida-up;
 *    content_module_id=NULL (day-1, ungated — post Revalida Up⇄Fórmula swap); status=publish
 *  - the legacy WP skeleton (hub 4308 + 17 specialty stubs) is archived to
 *    status=draft so it never surfaces ("fresh routes" decision)
 *  - PADRÃO DE PROVA lines are authored as bold paragraphs in source; emitted as
 *    <blockquote> so the .prose-caiunaprova purple-square callout CSS applies
 *
 * Output SQL is idempotent: pages use ON CONFLICT (slug) DO NOTHING and the
 * lesson insert only fires for rows actually inserted, so re-applying is a no-op.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const SRC = process.env.REVALIDA_SRC || "C:/Users/jrazm/Documents/revalida-up";
const OUT = path.join(__dirname, "..", "parsed", "revalida-up-import.sql");

// Canonical specialty slugs (schema.sql seed + schema-patch-002). Frontmatter
// `specialty:` must be one of these — they map 1:1 to specialties.slug.
const SPECIALTIES = new Set([
  "cardiologia", "dermatologia", "emergencia", "endocrinologia",
  "gastroenterologia", "hematologia", "infectologia", "nefrologia",
  "neurologia", "pneumologia", "psiquiatria", "reumatologia",
  "cirurgia-geral", "ginecologia", "obstetricia", "pediatria", "saude-coletiva",
  "outros",
]);

// Legacy Revalida Up skeleton: hub (4308) + 17 specialty stubs. Archived, not deleted.
const LEGACY_SKELETON_IDS = [
  4308, 4569, 4573, 4578, 4582, 4585, 4588, 4594, 4597, 4602,
  4605, 4608, 4611, 4615, 4618, 4622, 4625, 4628,
];

// ── helpers ────────────────────────────────────────────────────────────────

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function parseFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { error: "no frontmatter" };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { fm, body: m[2] };
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inline: HTML-escape, then **bold** → <strong>. (escapeHtml leaves * untouched.)
function inline(s) {
  return escHtml(s).replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
}

const PADRAO_RE = /^\*\*PADR[ÃA]O DE PROVA/i;

/**
 * Convert the uniform CaiuNaProva markdown body to the HTML the
 * .prose-caiunaprova CSS expects. Returns { html, padrao, blockquotes }.
 */
function mdToHtml(body) {
  const out = [];
  let li = [];
  let padrao = 0;
  let blockquotes = 0;
  const flush = () => {
    if (li.length) { out.push("<ul>" + li.join("") + "</ul>"); li = []; }
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, ""); // rstrip (drops md hard-break spaces)
    if (line === "") { flush(); continue; }
    if (line.startsWith("## ")) { flush(); out.push("<h2>" + inline(line.slice(3)) + "</h2>"); }
    else if (line.startsWith("### ")) { flush(); out.push("<h3>" + inline(line.slice(4)) + "</h3>"); }
    else if (line.startsWith("- ")) { li.push("<li>" + inline(line.slice(2)) + "</li>"); }
    else if (/^-{3,}$/.test(line)) { flush(); out.push("<hr>"); }
    else if (PADRAO_RE.test(line)) { flush(); padrao++; blockquotes++; out.push("<blockquote><p>" + inline(line) + "</p></blockquote>"); }
    else { flush(); out.push("<p>" + inline(line) + "</p>"); }
  }
  flush();
  return { html: out.join("\n"), padrao, blockquotes };
}

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Source dir not found: ${SRC}`);
    process.exit(1);
  }
  const files = walk(SRC).sort();
  const rows = [];
  const warnings = [];
  const bySpecialty = {};

  for (const file of files) {
    const base = path.basename(file, ".md");
    const { fm, body, error } = parseFile(file);
    if (error) { warnings.push(`${base}: ${error}`); continue; }

    for (const f of ["title", "slug", "specialty", "view", "type"]) {
      if (!fm[f]) warnings.push(`${base}: missing frontmatter '${f}'`);
    }
    if (fm.slug !== base) warnings.push(`${base}: slug '${fm.slug}' != filename`);
    if (fm.type !== "plain-content") warnings.push(`${base}: type='${fm.type}' (expected plain-content)`);
    if (fm.view !== "revalida-up") warnings.push(`${base}: view='${fm.view}' (expected revalida-up)`);
    if (!SPECIALTIES.has(fm.specialty)) warnings.push(`${base}: unknown specialty '${fm.specialty}'`);

    const { html, padrao, blockquotes } = mdToHtml(body);
    if (!/<h2>/.test(html)) warnings.push(`${base}: no <h2> (CaiuNaProva header) produced`);
    if (padrao === 0) warnings.push(`${base}: 0 PADRÃO DE PROVA callouts produced`);

    bySpecialty[fm.specialty] = (bySpecialty[fm.specialty] || 0) + 1;
    rows.push({ slug: fm.slug, title: fm.title, specialty: fm.specialty, html, padrao, blockquotes });
  }

  rows.sort((a, b) => a.slug.localeCompare(b.slug));

  // Build the VALUES list for the CTE: (rn, slug, title, spec_slug, body_html)
  const valueLines = rows.map((r, i) =>
    `  (${i + 1}, ${sqlStr(r.slug)}, ${sqlStr(r.title)}, ${sqlStr(r.specialty)}, ${sqlStr(r.html)})`
  ).join(",\n");

  const sql = `-- revalida-up-import.sql  (GENERATED by scripts/import-revalida-up.js — do not hand-edit)
--
-- Imports ${rows.length} Revalida UP / CaiuNaProva topic pages into pages + lessons,
-- and archives the legacy WP skeleton. Apply AFTER schema-patch-revalida-up-view.sql
-- (the 'revalida-up' enum value must already be committed):
--
--   node scripts/run-sql.js parsed/revalida-up-import.sql
--
-- run-sql.js wraps this whole file in one transaction (all-or-nothing).

-- 1. Archive the legacy Revalida Up skeleton (hub + 17 empty specialty stubs)
--    so it never surfaces. Content was '<h2>Specialty</h2>' stubs only.
UPDATE pages
SET status = 'draft', updated_at = now()
WHERE id IN (${LEGACY_SKELETON_IDS.join(", ")});

-- 2. Insert ${rows.length} topic pages (new bigint ids = current MAX(id) + row number)
--    plus one lesson row each carrying the converted CaiuNaProva HTML body.
WITH base AS (
  SELECT COALESCE(MAX(id), 0) AS m FROM pages
),
np (rn, slug, title, spec_slug, body) AS (
  VALUES
${valueLines}
),
ins AS (
  INSERT INTO pages
    (id, slug, title, type, status, view, content_module_id, specialty_id, wp_created_at, wp_modified_at)
  SELECT
    base.m + np.rn,
    np.slug,
    np.title,
    'plain-content'::page_type,
    'publish',
    'revalida-up'::page_view,
    NULL,
    (SELECT id FROM specialties WHERE slug = np.spec_slug),
    now(),
    now()
  FROM np CROSS JOIN base
  ON CONFLICT (slug) DO NOTHING
  RETURNING id, slug
)
INSERT INTO lessons (page_id, position, title, body_html)
SELECT ins.id, 1, np.title, np.body
FROM ins
JOIN np ON np.slug = ins.slug;
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, sql, "utf8");

  // ── summary ────────────────────────────────────────────────────────────────
  console.log(`\nRevalida UP import — generated SQL`);
  console.log(`  source : ${SRC}`);
  console.log(`  output : ${OUT}`);
  console.log(`  files  : ${files.length}   rows: ${rows.length}\n`);
  console.log(`  per specialty (from frontmatter):`);
  for (const s of Object.keys(bySpecialty).sort()) {
    console.log(`    ${s.padEnd(20)} ${bySpecialty[s]}`);
  }
  const totalPadrao = rows.reduce((n, r) => n + r.padrao, 0);
  console.log(`\n  PADRÃO DE PROVA callouts: ${totalPadrao}`);
  console.log(`  SQL size: ${(sql.length / 1024 / 1024).toFixed(2)} MB`);

  if (warnings.length) {
    console.log(`\n  ⚠ ${warnings.length} warning(s):`);
    for (const w of warnings.slice(0, 50)) console.log(`    - ${w}`);
    if (warnings.length > 50) console.log(`    … +${warnings.length - 50} more`);
  } else {
    console.log(`\n  ✓ no warnings — all ${rows.length} files validated clean`);
  }

  console.log(`\n  To apply (writes to the live DB — review the SQL first):`);
  console.log(`    node scripts/run-sql.js schema-patch-revalida-up-view.sql`);
  console.log(`    node scripts/run-sql.js parsed/revalida-up-import.sql\n`);
}

main();
