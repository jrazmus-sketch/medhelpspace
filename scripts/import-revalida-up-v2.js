#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * import-revalida-up-v2.js — generate the SQL that REPLACES the Revalida Up /
 * CaiuNaProva section with Karina's v2 rewrite (2026-09-13), delivered as
 * `<specialty>/<slug>.md.docx` files (markdown converted to Word).
 *
 * GENERATOR ONLY. Reads the .docx files and WRITES parsed/revalida-up-v2-import.sql.
 * It does NOT connect to or modify the database. Apply with the existing runner,
 * once per database (dev = local, run-sql default = prod):
 *
 *   node scripts/import-revalida-up-v2.js                     # generate + dry-run report
 *   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
 *     node scripts/run-sql.js parsed/revalida-up-v2-import.sql   # local
 *   node scripts/run-sql.js parsed/revalida-up-v2-import.sql     # prod
 *
 * Why UPDATE-in-place and never delete+reinsert: 165 topic_content rows (study
 * plan) and every lesson_completion key on pages.id with ON DELETE CASCADE. A
 * delete would silently wipe them. So:
 *   - a slug that already exists  → UPDATE pages (title, specialty, status) +
 *                                   UPDATE its lesson (title, body_html); ids kept
 *   - a RENAMED slug (see RENAMES)→ UPDATE pages.slug on the existing row first,
 *                                   then treated as existing; id + history kept
 *   - a brand-new slug            → INSERT page (id = MAX(id)+n) + lesson
 *   - a live slug absent from v2  → status='draft' (EXPLICIT list only, see
 *                                   RETIRE — never a blanket "NOT IN")
 *
 * Decisions baked in (Karina, "Revalida Up Update" 2026-09-13):
 *   - every title ends in "Revalida Up" (files say "Revalida UP")
 *   - specialty comes from the FOLDER the file sits in (the frontmatter header
 *     disagrees with the folder for 4 files and the folder matches both Karina's
 *     organisation and production). `--specialty-from=header` flips that.
 *   - slug comes from the frontmatter, never the filename (4 files carry a
 *     "(1)" download suffix in their name)
 *   - the docx has no `---` dividers; an <hr> is emitted between insights so the
 *     slide splitter in revalida-up-renderer.tsx (split on <hr>) keeps working
 *
 * Output HTML matches the .prose-caiunaprova contract of the June import:
 *   <h2>CaiuNaProva – X</h2>
 *   <h3>① …</h3><ul><li>…</li></ul><blockquote><p><strong>PADRÃO DE PROVA:</strong> …</p></blockquote>
 *   <hr> … (next insight)
 */
"use strict";

const fs = require("fs");
const path = require("path");
// fflate lives in app/node_modules (Next.js dep); root node_modules has no zip lib.
const { unzipSync, strFromU8 } = require(path.join(__dirname, "..", "app", "node_modules", "fflate"));

const SRC =
  process.env.REVALIDA_SRC ||
  "C:/Users/jrazm/OneDrive/Desktop/Medhelpspace/novo revalida up/novo revalida up";
const OUT = path.join(__dirname, "..", "parsed", "revalida-up-v2-import.sql");
const SPECIALTY_FROM = (process.argv.find((a) => a.startsWith("--specialty-from=")) || "--specialty-from=folder")
  .split("=")[1]; // folder | header

// Canonical specialty slugs (specialties.slug). "outros" (id 18) is a real group.
const SPECIALTIES = new Set([
  "cardiologia", "dermatologia", "emergencia", "endocrinologia",
  "gastroenterologia", "hematologia", "infectologia", "nefrologia",
  "neurologia", "pneumologia", "psiquiatria", "reumatologia",
  "cirurgia-geral", "ginecologia", "obstetricia", "pediatria", "saude-coletiva",
  "outros",
]);

// Live slug → v2 slug. Same topic, new address: the existing row is renamed so
// its id (and therefore completions + study-plan links) survives.
const RENAMES = {
  "coluna-vertebral-e-trauma-raquimedular-revalida-up": "coluna-vertebral-trauma-raquimedular-revalida-up",
  "crescimento-e-desenvolvimento-revalida-up": "crescimento-e-desenvolvimento-infantil-revalida-up",
  "psiquiatria-na-infancia-revalida-up": "psiquiatria-infantil-revalida-up",
  "sindrome-desconforto-respiratorio-recem-nascido-revalida-up": "sindrome-do-desconforto-respiratorio-do-recem-nascido-revalida-up",
};

// Live topics with NO v2 file. Retired to status='draft' (kept, never deleted),
// pending Karina's confirmation that the omission is intentional. EXPLICIT list:
// anything else that is live-but-absent shows up in the verification query
// instead of being touched.
const RETIRE = [
  "doencas-hepatobiliares-revalida-up",
  "processo-saude-doenca-revalida-up",
  "saude-do-trabalhador-revalida-up",
  "vigilancia-epidemiologica-revalida-up",
  "sus-historico-principios-e-diretrizes-revalida-up",
  // Legacy spelling of the SUS slug still present on the LOCAL dev DB (renamed on
  // prod in July). No such row on prod → no-op there.
  "sus-historico-principios-diretrizes-revalida-up",
];
const RETIRE_NOTE = "retirado 2026-09-13: sem arquivo na versão v2 do Revalida Up (aguardando confirmação da Karina)";

// ── docx → paragraphs ────────────────────────────────────────────────────────

function xmlDecode(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, "&");
}
function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const flagOn = (rpr, tag) => new RegExp(`<w:${tag}\\b(?![^>]*w:val="(?:0|false)")`).test(rpr);

/** Parse word/document.xml into [{style, list, runs:[{text,b,i}]}]. */
function docxParagraphs(file) {
  const zip = unzipSync(new Uint8Array(fs.readFileSync(file)));
  const xml = strFromU8(zip["word/document.xml"]);
  const paras = [];
  for (const pm of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const p = pm[1];
    const style = (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || "";
    const list = /<w:numPr>/.test(p);
    const runs = [];
    for (const rm of p.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const r = rm[1];
      const rpr = (r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || ["", ""])[1];
      let text = "";
      for (const t of r.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
        text += t[1] != null ? xmlDecode(t[1]) : t[0] === "<w:tab/>" ? "\t" : "\n";
      }
      if (!text) continue;
      const b = flagOn(rpr, "b"), i = flagOn(rpr, "i");
      const last = runs[runs.length - 1];
      if (last && last.b === b && last.i === i) last.text += text; // merge same-format runs
      else runs.push({ text, b, i });
    }
    paras.push({ style, list, runs });
  }
  return paras;
}

const plain = (para) => para.runs.map((r) => r.text).join("");

/** Inline HTML from runs: escape, then <strong>/<em> per merged run. */
function inlineHtml(runs) {
  // Trim leading/trailing whitespace of the paragraph as a whole, not per run.
  let html = runs
    .map((r) => {
      let t = escHtml(r.text);
      if (r.b) t = `<strong>${t}</strong>`;
      if (r.i) t = `<em>${t}</em>`;
      return t;
    })
    .join("");
  // Bold/italic wrappers around pure whitespace add nothing.
  html = html.replace(/<strong>(\s*)<\/strong>/g, "$1").replace(/<em>(\s*)<\/em>/g, "$1");
  return html.trim();
}

// ── one file → { fm, html, stats } ───────────────────────────────────────────

const FM_RE = /^title:\s*(.*?)\s+slug:\s*(\S+)\s+specialty:\s*(\S+)\s+view:\s*(\S+)\s+type:\s*(\S+)\s*$/;
const PADRAO_RE = /^PADR[ÃA]O DE PROVA/i;

function convert(file) {
  const paras = docxParagraphs(file);
  const warnings = [];
  let fm = null;
  const body = [];
  let li = [];
  let h3 = 0, padrao = 0, bullets = 0, stray = 0;
  const flush = () => { if (li.length) { body.push("<ul>" + li.join("") + "</ul>"); li = []; } };

  for (const para of paras) {
    const text = plain(para).trim();
    if (!fm && para.style === "Heading2" && /^title:/.test(text)) {
      const m = text.match(FM_RE);
      if (!m) { warnings.push(`unparseable frontmatter: ${text.slice(0, 80)}`); continue; }
      fm = { title: m[1].trim(), slug: m[2], specialty: m[3], view: m[4], type: m[5] };
      continue;
    }
    if (!text) { continue; }
    if (para.style === "Heading2") { flush(); body.push(`<h2>${inlineHtml(para.runs)}</h2>`); }
    else if (para.style === "Heading3") {
      flush();
      if (h3 > 0) body.push("<hr>");
      h3++;
      body.push(`<h3>${escHtml(text)}</h3>`);
    }
    else if (para.list) { bullets++; li.push(`<li>${inlineHtml(para.runs)}</li>`); }
    else if (PADRAO_RE.test(text)) { flush(); padrao++; body.push(`<blockquote><p>${inlineHtml(para.runs)}</p></blockquote>`); }
    else { flush(); stray++; body.push(`<p>${inlineHtml(para.runs)}</p>`); }
  }
  flush();
  if (!fm) warnings.push("no frontmatter heading found");
  if (h3 === 0) warnings.push("0 insights (<h3>)");
  if (padrao !== h3) warnings.push(`PADRÃO count ${padrao} != insight count ${h3}`);
  if (stray) warnings.push(`${stray} stray paragraph(s) emitted as <p>`);
  return { fm, html: body.join("\n"), stats: { h3, padrao, bullets, stray }, warnings };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".docx") && !entry.name.startsWith("~$")) out.push(full);
  }
  return out;
}
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const fixTitle = (t) => t.replace(/\s*revalida\s*up\s*$/i, "").trim() + " Revalida Up";

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(SRC)) { console.error(`Source dir not found: ${SRC}`); process.exit(1); }
  const files = walk(SRC).sort();
  const rows = [];
  const warnings = [];
  const bySpecialty = {};
  const seen = new Map();

  for (const file of files) {
    const rel = path.relative(SRC, file).split(path.sep).join("/");
    const folder = path.basename(path.dirname(file));
    const { fm, html, stats, warnings: w } = convert(file);
    for (const x of w) warnings.push(`${rel}: ${x}`);
    if (!fm) continue;
    if (fm.type !== "plain-content") warnings.push(`${rel}: type='${fm.type}'`);
    if (fm.view !== "revalida-up") warnings.push(`${rel}: view='${fm.view}'`);
    if (fm.specialty !== folder) warnings.push(`${rel}: header specialty '${fm.specialty}' != folder '${folder}' → using ${SPECIALTY_FROM}`);
    const specialty = SPECIALTY_FROM === "header" ? fm.specialty : folder;
    if (!SPECIALTIES.has(specialty)) warnings.push(`${rel}: unknown specialty '${specialty}'`);
    if (seen.has(fm.slug)) warnings.push(`${rel}: DUPLICATE slug '${fm.slug}' (also ${seen.get(fm.slug)})`);
    seen.set(fm.slug, rel);
    if (RETIRE.includes(fm.slug)) warnings.push(`${rel}: slug is in RETIRE list but has a v2 file — remove it from RETIRE`);
    if (Object.keys(RENAMES).includes(fm.slug)) warnings.push(`${rel}: slug is an OLD name in RENAMES — file should carry the new slug`);
    bySpecialty[specialty] = (bySpecialty[specialty] || 0) + 1;
    rows.push({ slug: fm.slug, title: fixTitle(fm.title), specialty, html, ...stats });
  }
  rows.sort((a, b) => a.slug.localeCompare(b.slug));

  for (const [oldSlug, newSlug] of Object.entries(RENAMES)) {
    if (!seen.has(newSlug)) warnings.push(`RENAMES: target '${newSlug}' has no v2 file (from '${oldSlug}')`);
  }

  const valueLines = rows
    .map((r, i) => `  (${i + 1}, ${sqlStr(r.slug)}, ${sqlStr(r.title)}, ${sqlStr(r.specialty)}, ${sqlStr(r.html)})`)
    .join(",\n");
  const renameLines = Object.entries(RENAMES)
    .map(([o, n]) =>
      `UPDATE pages SET slug = ${sqlStr(n)}, updated_at = now()\n` +
      `WHERE slug = ${sqlStr(o)} AND view = 'revalida-up'\n` +
      `  AND NOT EXISTS (SELECT 1 FROM pages WHERE slug = ${sqlStr(n)});`
    )
    .join("\n");
  const retireList = RETIRE.map(sqlStr).join(", ");

  const sql = `-- revalida-up-v2-import.sql  (GENERATED by scripts/import-revalida-up-v2.js — do not hand-edit)
--
-- Replaces the Revalida Up / CaiuNaProva section with Karina's v2 rewrite:
-- ${rows.length} topic files → UPDATE-in-place for existing slugs, INSERT for new ones,
-- ${Object.keys(RENAMES).length} slug renames on existing rows, ${RETIRE.length} live topics retired to draft.
-- run-sql.js wraps this whole file in one transaction (all-or-nothing).
-- Rollback: parsed/revalida-up-rollback-2026-09-13-<db>.sql (captured before apply).

-- 0. Staging table with the v2 content (dropped at commit).
CREATE TEMP TABLE np (rn int, slug text PRIMARY KEY, title text, spec_slug text, body text) ON COMMIT DROP;
INSERT INTO np (rn, slug, title, spec_slug, body) VALUES
${valueLines};

-- Guard: every specialty slug must resolve, or the whole file aborts.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(DISTINCT np.spec_slug, ', ') INTO missing
  FROM np LEFT JOIN specialties s ON s.slug = np.spec_slug WHERE s.id IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'unknown specialty slug(s): %', missing; END IF;
END $$;

-- 1. Renames: same topic, new address. The existing row keeps its id, so
--    lesson_completions and topic_content (study plan) links survive.
${renameLines}

-- 2. Existing topics: overwrite title / specialty / status on the page …
UPDATE pages p
SET title = np.title,
    specialty_id = s.id,
    status = 'publish',
    updated_at = now()
FROM np JOIN specialties s ON s.slug = np.spec_slug
WHERE p.slug = np.slug AND p.view = 'revalida-up';

--    … and the body on its (single) lesson.
UPDATE lessons l
SET title = np.title,
    body_html = np.body,
    updated_at = now()
FROM np JOIN pages p ON p.slug = np.slug AND p.view = 'revalida-up'
WHERE l.page_id = p.id AND l.position = 1;

--    Existing page that somehow has no lesson row → give it one.
INSERT INTO lessons (page_id, position, title, body_html)
SELECT p.id, 1, np.title, np.body
FROM np JOIN pages p ON p.slug = np.slug AND p.view = 'revalida-up'
WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.page_id = p.id AND l.position = 1);

-- 3. New topics: insert page (id = current MAX(id) + n) + lesson.
WITH base AS (SELECT COALESCE(MAX(id), 0) AS m FROM pages),
newrows AS (
  SELECT np.*, row_number() OVER (ORDER BY np.slug) AS n
  FROM np WHERE NOT EXISTS (SELECT 1 FROM pages p WHERE p.slug = np.slug)
),
ins AS (
  INSERT INTO pages
    (id, slug, title, type, status, view, content_module_id, specialty_id, wp_created_at, wp_modified_at)
  SELECT base.m + newrows.n, newrows.slug, newrows.title,
         'plain-content'::page_type, 'publish', 'revalida-up'::page_view, NULL,
         (SELECT id FROM specialties WHERE slug = newrows.spec_slug), now(), now()
  FROM newrows CROSS JOIN base
  RETURNING id, slug
)
INSERT INTO lessons (page_id, position, title, body_html)
SELECT ins.id, 1, np.title, np.body
FROM ins JOIN np ON np.slug = ins.slug;

-- 4. Retire the live topics that have no v2 file (explicit list; kept as draft).
UPDATE pages
SET status = 'draft',
    notes = concat_ws(' | ', notes, ${sqlStr(RETIRE_NOTE)}),
    updated_at = now()
WHERE view = 'revalida-up' AND status = 'publish'
  AND slug IN (${retireList});

-- ── Verification (printed by run-sql.js) ──
-- Expect ${rows.length} published, ${RETIRE.length} + legacy skeleton as draft.
SELECT status, count(*) AS revalida_up_pages FROM pages WHERE view = 'revalida-up' GROUP BY status ORDER BY status;

-- Expect 0 rows: published revalida-up pages the v2 set does not know about.
SELECT p.id, p.slug, p.title AS unexpected_live_page
FROM pages p WHERE p.view = 'revalida-up' AND p.status = 'publish'
  AND NOT EXISTS (SELECT 1 FROM np WHERE np.slug = p.slug);

-- Expect 0: published pages whose title does not end in "Revalida Up".
SELECT count(*) AS titles_not_normalised FROM pages
WHERE view = 'revalida-up' AND status = 'publish' AND title NOT LIKE '% Revalida Up';

-- Expect 0: published pages whose lesson body is not the v2 body.
SELECT count(*) AS lessons_not_v2
FROM pages p JOIN lessons l ON l.page_id = p.id AND l.position = 1
JOIN np ON np.slug = p.slug
WHERE p.view = 'revalida-up' AND p.status = 'publish' AND l.body_html IS DISTINCT FROM np.body;

-- Per-specialty counts after the import.
SELECT s.slug, count(p.id) AS topics
FROM pages p JOIN specialties s ON s.id = p.specialty_id
WHERE p.view = 'revalida-up' AND p.status = 'publish'
GROUP BY s.slug ORDER BY s.slug;
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, sql, "utf8");

  // ── summary ────────────────────────────────────────────────────────────────
  const tot = (k) => rows.reduce((n, r) => n + r[k], 0);
  console.log(`\nRevalida Up v2 import — generated SQL`);
  console.log(`  source    : ${SRC}`);
  console.log(`  output    : ${OUT}  (${(sql.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  specialty : from ${SPECIALTY_FROM}`);
  console.log(`  files     : ${files.length}   rows: ${rows.length}`);
  console.log(`  insights  : ${tot("h3")}   PADRÃO: ${tot("padrao")}   bullets: ${tot("bullets")}   stray <p>: ${tot("stray")}\n`);
  console.log(`  per specialty:`);
  for (const s of Object.keys(bySpecialty).sort()) console.log(`    ${s.padEnd(20)} ${bySpecialty[s]}`);
  console.log(`\n  renames (${Object.keys(RENAMES).length}):`);
  for (const [o, n] of Object.entries(RENAMES)) console.log(`    ${o}  →  ${n}`);
  console.log(`  retire to draft (${RETIRE.length}):`);
  for (const s of RETIRE) console.log(`    ${s}`);
  if (warnings.length) {
    console.log(`\n  ⚠ ${warnings.length} warning(s):`);
    for (const w of warnings.slice(0, 60)) console.log(`    - ${w}`);
    if (warnings.length > 60) console.log(`    … +${warnings.length - 60} more`);
  } else {
    console.log(`\n  ✓ no warnings — all ${rows.length} files validated clean`);
  }
  console.log(`\n  Apply (one database at a time — review the SQL first):`);
  console.log(`    DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" node scripts/run-sql.js parsed/revalida-up-v2-import.sql   # local`);
  console.log(`    node scripts/run-sql.js parsed/revalida-up-v2-import.sql                                                                   # prod\n`);
}

main();
