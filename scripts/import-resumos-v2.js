#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * import-resumos-v2.js — generate the SQL that REPLACES every Resumo Narrativo with
 * Karina's 2026-10-05 delivery ("Atualização resumos narrativos": "Todos os resumos
 * narrativos que estão na plataforma devem ser excluídos e substituídos por esses").
 * Delivered as `<folder>/<slug>-resumos.md.docx` — Google-Docs exports of plain text
 * (line breaks, literal • bullets), some with Word heading styles / numbered lists.
 *
 * GENERATOR ONLY. Reads the .docx files and WRITES parsed/resumos-v2-import.sql.
 * It does NOT connect to the database. Snapshot first, then apply once per database:
 *
 *   node scripts/import-resumos-v2.js                                  # generate + report
 *   node scripts/snapshot-resumos.js local && node scripts/snapshot-resumos.js prod
 *   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
 *     node scripts/run-sql.js parsed/resumos-v2-import.sql            # local
 *   node scripts/run-sql.js parsed/resumos-v2-import.sql              # prod
 *
 * "Excluídos e substituídos" is honoured WITHOUT deleting rows: lesson_completions
 * key on pages.id/lessons.id with ON DELETE CASCADE, so a delete would wipe every
 * student's progress. Instead:
 *   - a file whose topic already has a page → UPDATE that page + its single lesson
 *     in place (id, completions and URL kept). Matched by slug, or through MATCH
 *     when Karina renamed the file: the EXISTING slug is kept on purpose, because
 *     the "Revisar o resumo do tema" link from Questões (lib/review/remediation.ts)
 *     derives the resumo slug from the question page slug, and the old slugs are
 *     the ones it finds (28 of 31 renamed topics; checked 2026-10-05).
 *   - RENAMES: the 3 topics whose NEW slug is the one remediation looks for → the
 *     existing row's slug is changed (id kept).
 *   - a brand-new topic → INSERT page + lesson.
 *   - a live resumo with no file in the delivery → status='draft' (EXPLICIT RETIRE
 *     list, never a blanket NOT IN), so it leaves every menu but stays restorable.
 *   - the hub card lists (nav_items of every Resumos specialty hub) are REBUILT from
 *     the delivery, so renamed / moved / retired topics land in the right hub.
 *
 * Specialty comes from the FOLDER (clinica-medica/<x> → x, outros/<x> → outros):
 * the same rule Karina confirmed for Revalida Up (2026-09-13). "Outros" (oftalmo,
 * otorrino, urologia) gets its first Resumos hub, `outros-resumos`.
 *
 * Output HTML follows the .prose-resumo contract (plain-content-renderer.tsx):
 *   <h2>Tema</h2>
 *   <p><span style="color: #b046e9;"><strong>“…” – Uma história chamada Tema</strong></span><br /><em>Resumos Narrativos – …</em></p>
 *   <h3>Cena 1 – …</h3>   ← brand purple via .prose-resumo h3; ≥3 headings → TOC
 *   <p>line<br />• bullet<br />…</p>
 *   <h3>✔ Checklist Final – Destrave a Questão</h3> …
 * Word heading-4 → <h4>, Word numbered/bulleted lists → <ol>/<ul>. Text is never
 * rewritten: only HTML-escaped and split into lines/paragraphs as she wrote it.
 */
"use strict";

const fs = require("fs");
const path = require("path");
// fflate lives in app/node_modules (Next.js dep); root node_modules has no zip lib.
const { unzipSync, strFromU8 } = require(path.join(__dirname, "..", "app", "node_modules", "fflate"));

const SRC =
  process.env.RESUMOS_SRC ||
  path.join(__dirname, "..", "parsed", "resumos-2026-10-05", "#novo resumos narrativos");
const OUT = path.join(__dirname, "..", "parsed", "resumos-v2-import.sql");

// Canonical specialty slugs (specialties.slug). "outros" (id 18) is a real group.
const SPECIALTIES = new Set([
  "cardiologia", "dermatologia", "emergencia", "endocrinologia",
  "gastroenterologia", "hematologia", "infectologia", "nefrologia",
  "neurologia", "pneumologia", "psiquiatria", "reumatologia",
  "cirurgia-geral", "ginecologia", "obstetricia", "pediatria", "saude-coletiva",
  "outros",
]);

// Per-file slug when the filename cannot be the slug. Meningites came twice, with
// two different texts — one in Infectologia (keeps the live page) and one in
// Neurologia, which becomes its own page.
const FILE_SLUG_OVERRIDES = {
  "clinica-medica/neurologia/meningites-resumos.md.docx": "meningites-neurologia-resumos",
  // filename carries a stray space before "-resumos"
  "outros/otorrinolaringologia/infeccoes-cervicofaciais-e-glandulas-salivares -resumos.md.docx":
    "infeccoes-cervicofaciais-e-glandulas-salivares-resumos",
};

// New file slug → the LIVE slug it replaces, which is KEPT (see header: remediation
// links and student URLs resolve by these slugs).
const MATCH = {
  "diabetes-mellitus-resumos": "diabetes-resumos",
  "doenca-das-adrenais-resumos": "doencas-das-adrenais-resumos",
  "ulcera-peptica-resumos": "ulcera-peptica-e-h-pylori-resumos",
  "dengue-chikungunya-zika-febre-amarela-resumos": "arboviroses-resumos",
  "hiv-e-hiv-tuberculose-resumos": "hiv-resumos",
  "ulceras-genitais-por-ist-resumos": "ulceras-genitais-ist-resumos",
  "disturbios-hidroeletroliticos-nefrologicos-resumos": "disturbios-hidroeletroliticos-resumos",
  "cefaleia-resumos": "cefaleias-resumos",
  "pneumonia-adquirida-na-comunidade-resumos": "pneumonia-resumos",
  "transtornos-alimentares-resumos": "transtorno-alimentares-resumos",
  "transtornos-do-humor-resumos": "transtorno-de-humor-resumos",
  "lupus-eritematoso-sistemico-resumos": "lupus-resumos",
  "dislipidemia-resumos": "dislipidemias-resumos",
  "transtornos-de-personalidade-resumos": "transtorno-de-personalidade-resumos",
  "apendicite-aguda-resumos": "apendicite-resumos",
  "cancer-colorretal-resumos": "cancer-de-colorretal-resumos",
  "hernias-da-parede-abdominal-resumos": "hernias-resumos",
  "queimaduras-resumos": "queimados-resumos",
  "traumatismo-cranioencefalico-resumos": "tec-resumos",
  "colecistite-aguda-resumos": "colecistite-resumos",
  "trauma-atendimento-inicial-via-aerea-resumos": "trauma-atendimento-inicial-e-vias-aereas-resumos",
  "diabetes-gestacional-resumos": "diabetes-da-gestacao-resumos",
  "isoimunizacao-rhd-resumos": "isoimunizacao-rh-resumos",
  "alimentacao-complementar-resumos": "alimentacao-complementar-do-lactente-resumos",
  "desnutricao-e-obesidade-resumos": "desnutricao-e-obesidade-na-infancia-resumos",
  "diarreia-aguda-e-desidratacao-resumos": "diarreia-e-desidratacao-resumos",
  "maus-tratos-e-prevencao-de-acidentes-na-infancia-resumos": "maus-tratos-e-prevencoes-de-acidentes-na-infancia-resumos",
  "ivas-resfriado-sinusite-otite-resumos": "ivas-resfriado-sinusite-e-otite-resumos",
  "atencao-a-pessoa-idosa-resumos": "atencao-ao-idoso-resumos",
  "sus-historico-principios-diretrizes-resumos": "sus-historico-principios-e-diretrizes-resumos",
};

// Live slug → new slug: same topic, and the NEW slug is the one remediation looks
// for (mieloma-multiplo, hiv-na-gestacao, neuroblastoma question pages). The row is
// renamed, so its id and completions survive.
const RENAMES = {
  "mieloma-multiplo-resumo": "mieloma-multiplo-resumos",
  "hiv-e-gestacao-resumos": "hiv-na-gestacao-resumos",
  "tumor-neuroendocrino-infantil-resumos": "neuroblastoma-resumos",
};

// Live resumos with NO file in the delivery → draft. Explicit; anything else that is
// live-but-absent shows up in the verification query instead of being touched.
const RETIRE = [
  "acidentes-por-animais-peconhentos-resumos",
  "luto-resumos",
  "perioperatorio-resumos",
  "feridas-cirurgicas-resumos",
  "distopias-genitais-resumos",
  "febre-sem-sinais-de-localizacao-resumos",
  "testes-diagnosticos-resumos",
  // legacy text-lesson stub ("PASTE TEXT HERE" ×2) that showed as a second
  // "Insuficiência Cardíaca" card in Cardiologia Resumos
  "insuficiencia-cardiaca",
];
const RETIRE_NOTE = "retirado 2026-10-05: sem arquivo na atualização dos resumos narrativos (Karina)";

// Card label / page title when the file's "Uma história chamada X" is not a good
// card name. Keyed by final slug.
const LABEL_OVERRIDES = {
  // title names only the two diseases ("Actinomicose cervicofacial e parotidite
  // epidêmica"); the card keeps her file's topic name
  "infeccoes-cervicofaciais-e-glandulas-salivares-resumos": "Infecções Cervicofaciais e Glândulas Salivares",
};

// Area hubs inside a specialty's Resumos hub (Karina 2026-10-06: "igual ao Revalida
// Up"): Resumos → Outros → Oftalmologia / Otorrinolaringologia / Urologia → resumos.
// The area is the delivery's sub-folder; the specialty hub's cards become the areas.
const AREAS = {
  outros: [
    { area: "oftalmologia", label: "Oftalmologia" },
    { area: "otorrinolaringologia", label: "Otorrinolaringologia" },
    { area: "urologia", label: "Urologia" },
  ],
};
const areaSlug = (area) => `${area}-resumos`;

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

/** numId → { ilvl → numFmt } from word/numbering.xml. */
function listFormats(zip) {
  const xml = zip["word/numbering.xml"] ? strFromU8(zip["word/numbering.xml"]) : "";
  const abs = {};
  for (const m of xml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const lv = {};
    for (const l of m[2].matchAll(/<w:lvl\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) {
      lv[l[1]] = (l[2].match(/<w:numFmt w:val="([^"]+)"/) || [])[1] || "bullet";
    }
    abs[m[1]] = lv;
  }
  const out = {};
  for (const m of xml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId w:val="(\d+)"/g)) {
    out[m[1]] = abs[m[2]] || {};
  }
  return out;
}

/** Parse word/document.xml into [{style, list:{numId,ilvl}|null, lines:[…]}]. */
function docxParagraphs(file) {
  const zip = unzipSync(new Uint8Array(fs.readFileSync(file)));
  const xml = strFromU8(zip["word/document.xml"]);
  const formats = listFormats(zip);
  const paras = [];
  for (const pm of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const p = pm[1];
    const style = (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || "";
    let list = null;
    if (/<w:numPr>/.test(p)) {
      const numId = (p.match(/<w:numId w:val="(\d+)"/) || [])[1] || "0";
      const ilvl = (p.match(/<w:ilvl w:val="(\d+)"/) || [])[1] || "0";
      const fmt = (formats[numId] || {})[ilvl] || "bullet";
      if (numId !== "0") list = { numId, ilvl, ordered: fmt !== "bullet" && fmt !== "none" };
    }
    let text = "";
    for (const rm of p.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      for (const t of rm[1].matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>|<w:cr\/>/g)) {
        text += t[1] != null ? xmlDecode(t[1]) : t[0] === "<w:tab/>" ? " " : "\n";
      }
    }
    paras.push({ style, list, lines: text.split("\n").map((l) => l.replace(/\s+$/, "").replace(/^\s+/, "")) });
  }
  return paras;
}

// ── one file → { header, html, stats, warnings } ─────────────────────────────

const FRONTMATTER_RE = /^title:.*\bslug:\s*\S+/;
const SCENE_RE = /^Cena\s+\d+\s*[–—-]/;
const CHECK_RE = /^(✔️?\s*)?Checklist Final\b/;
const FINAL_RE = /^RESUMO NARRATIVO FINAL$/;
const SUBTITLE_RE = /(Resumos Narrativos|Clínica em Cena).*MedHelpSpace/i;
const HEADING_STYLE = /^Heading[123]$/;

function convert(file) {
  const paras = docxParagraphs(file);
  const warnings = [];
  const blocks = [];
  let titleLine = null;
  let subtitle = null;
  let fmSlug = null;
  const stats = { scenes: 0, h3: 0, h4: 0, lists: 0, paras: 0, checklist: 0 };

  // Header: the first non-empty line is the story title; the "Resumos Narrativos …
  // | MedHelpSpace Revalida" line right after it is the subtitle. Both are taken out
  // of the stream; everything after them is the body.
  const stream = [];
  for (const para of paras) {
    const nonEmpty = para.lines.filter(Boolean);
    if (!nonEmpty.length) { stream.push({ ...para, lines: [] }); continue; }
    if (FRONTMATTER_RE.test(nonEmpty.join(" "))) {
      fmSlug = (nonEmpty.join(" ").match(/\bslug:\s*(\S+)/) || [])[1] || null;
      continue;
    }
    stream.push(para);
  }
  outer: for (const para of stream) {
    for (let i = 0; i < para.lines.length; i++) {
      const line = para.lines[i];
      if (!line) continue;
      // Some Outros files open with her generator's "RESUMO NARRATIVO FINAL" label
      // above the title — a version stamp, not content.
      if (titleLine == null && FINAL_RE.test(line)) { para.lines[i] = ""; continue; }
      if (titleLine == null) {
        // Title and subtitle typed on one line (parasitoses-intestinais).
        const both = line.match(/^(.*?)\s+((?:Resumos Narrativos|Clínica em Cena)\b.*MedHelpSpace.*)$/i);
        if (both) { titleLine = both[1]; subtitle = both[2]; para.lines[i] = ""; break outer; }
        titleLine = line; para.lines[i] = ""; continue;
      }
      if (subtitle == null && SUBTITLE_RE.test(line)) { subtitle = line; para.lines[i] = ""; }
      break outer;
    }
  }
  if (!titleLine) warnings.push("no title line");
  else if (!/Uma história chamada/i.test(titleLine)) warnings.push(`title without "Uma história chamada": ${titleLine.slice(0, 90)}`);
  if (!subtitle) warnings.push("no 'Resumos Narrativos … MedHelpSpace' subtitle");

  // Body
  let pLines = [];
  let list = null; // { ordered, numId, items: [] }
  const listCount = {}; // numId → items emitted so far (an interrupted list resumes its numbering)
  const flushP = () => {
    while (pLines.length && !pLines[pLines.length - 1]) pLines.pop();
    if (pLines.length) {
      blocks.push(`<p>${pLines.map(escHtml).join("<br />")}</p>`);
      stats.paras++;
    }
    pLines = [];
  };
  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? "ol" : "ul";
    const done = listCount[list.numId] || 0;
    const start = list.ordered && done > 0 ? ` start="${done + 1}"` : "";
    blocks.push(`<${tag}${start}>${list.items.map((li) => `<li>${li}</li>`).join("")}</${tag}>`);
    listCount[list.numId] = done + list.items.length;
    stats.lists++;
    list = null;
  };
  const heading = (text, level) => {
    flushP(); flushList();
    blocks.push(`<h${level}>${escHtml(text)}</h${level}>`);
    if (level === 3) {
      stats.h3++;
      if (SCENE_RE.test(text)) stats.scenes++;
      if (CHECK_RE.test(text)) stats.checklist++;
    } else stats.h4++;
  };

  // Word heading styles are trusted relative to the file's own scene level: files
  // that style "Cena N" as Heading 2 use Heading 3 for sub-topics inside a scene
  // (→ <h4>), files that style scenes as Heading 3 use Heading 4 for those. A file
  // where most paragraphs carry a heading style (parasitoses-intestinais: every
  // line is Heading 3) has no usable styles — the text rules alone decide.
  const levelOf = (style) => +((style.match(/^Heading(\d)$/) || [])[1] || 0);
  const nonEmptyParas = stream.filter((p) => p.lines.some(Boolean));
  const headingParas = nonEmptyParas.filter((p) => levelOf(p.style) > 0);
  const plainHeadings = headingParas.filter((p) => {
    const t = p.lines.filter(Boolean).join(" ");
    return !SCENE_RE.test(t) && !CHECK_RE.test(t);
  });
  const stylesUsable = plainHeadings.length <= nonEmptyParas.length / 2;
  if (!stylesUsable) warnings.push(`heading styles ignored (${plainHeadings.length}/${nonEmptyParas.length} paragraphs are non-scene headings)`);
  const sceneLevel = Math.max(0, ...headingParas
    .filter((p) => SCENE_RE.test(p.lines.filter(Boolean).join(" ")))
    .map((p) => levelOf(p.style)));

  for (const para of stream) {
    const lines = para.lines;
    const text = lines.filter(Boolean).join(" ").trim();
    if (!text) { flushP(); continue; }
    const level = stylesUsable ? levelOf(para.style) : 0;
    if (level > 0) {
      const sub = !SCENE_RE.test(text) && !CHECK_RE.test(text) &&
        (level >= 4 || (sceneLevel > 0 && level > sceneLevel));
      heading(text, sub ? 4 : 3);
      continue;
    }
    if (stylesUsable && para.style && !/^(Normal|Title|Subtitle)?$/.test(para.style)) warnings.push(`unhandled style '${para.style}': ${text.slice(0, 60)}`);
    if (para.list) {
      flushP();
      if (list && (list.numId !== para.list.numId || list.ordered !== para.list.ordered)) flushList();
      if (!list) list = { numId: para.list.numId, ordered: para.list.ordered, items: [] };
      if (para.list.ilvl !== "0") warnings.push(`nested list level ${para.list.ilvl} flattened: ${text.slice(0, 60)}`);
      list.items.push(lines.filter(Boolean).map(escHtml).join("<br />"));
      continue;
    }
    flushList();
    for (const line of lines) {
      if (!line) { flushP(); continue; }
      if (SCENE_RE.test(line) || CHECK_RE.test(line) || FINAL_RE.test(line)) { heading(line, 3); continue; }
      pLines.push(line);
    }
    flushP();
  }
  flushP(); flushList();

  if (stats.scenes === 0) warnings.push("0 'Cena N –' headings");
  if (stats.checklist === 0) warnings.push("no '✔ Checklist Final' heading");

  return { titleLine, subtitle, fmSlug, blocks, stats, warnings };
}

/** Topic name from "“…” – Uma história chamada X" (fallback: text after the last " – "). */
function topicFrom(titleLine) {
  if (!titleLine) return null;
  const m = titleLine.match(/Uma história chamada\s+(.+?)\s*$/i);
  if (m) return m[1].replace(/[.:]$/, "").trim();
  const parts = titleLine.split(/\s+[–—-]\s+/);
  return parts.length > 1 ? parts[parts.length - 1].trim() : titleLine.replace(/[“”"]/g, "").trim();
}

function bodyHtml(topic, r) {
  const head = [`<h2>${escHtml(topic)}</h2>`];
  if (r.titleLine) {
    const sub = r.subtitle ? `<br /><em>${escHtml(r.subtitle)}</em>` : "";
    head.push(`<p><span style="color: #b046e9;"><strong>${escHtml(r.titleLine)}</strong></span>${sub}</p>`);
  }
  return head.concat(r.blocks).join("\n");
}

// ── helpers ──────────────────────────────────────────────────────────────────

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && /\.docx$/.test(entry.name) && !entry.name.startsWith("~$")) out.push(full);
  }
  return out;
}
const sqlStr = (s) => (s == null ? "NULL" : "'" + String(s).replace(/'/g, "''") + "'");
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Every delivered file → one row. Exported for the review scripts. */
function buildRows() {
  const files = walk(SRC).sort();
  const rows = [];
  const warnings = [];
  const seen = new Map();
  for (const file of files) {
    const rel = path.relative(SRC, file).split(path.sep).join("/");
    const parts = rel.split("/");
    const top = parts[0];
    const sub = parts.length > 2 ? parts[1] : null;
    const specialty = top === "clinica-medica" ? sub : top === "outros" ? "outros" : top;
    const fileSlug = FILE_SLUG_OVERRIDES[rel] || parts[parts.length - 1].replace(/\.md\.docx$|\.docx$/, "");
    const r = convert(file);
    for (const w of r.warnings) warnings.push(`${rel}: ${w}`);
    if (!SPECIALTIES.has(specialty)) warnings.push(`${rel}: unknown specialty '${specialty}'`);
    if (!/^[a-z0-9-]+-resumos$/.test(fileSlug)) warnings.push(`${rel}: odd slug '${fileSlug}'`);
    if (r.fmSlug && r.fmSlug !== fileSlug && !MATCH[fileSlug]) warnings.push(`${rel}: header slug '${r.fmSlug}' ignored (filename wins)`);
    const slug = fileSlug; // the slug this topic will live at
    const matchSlug = MATCH[fileSlug] || null;
    if (seen.has(slug)) warnings.push(`${rel}: DUPLICATE slug '${slug}' (also ${seen.get(slug)})`);
    seen.set(slug, rel);
    const topic = LABEL_OVERRIDES[slug] || topicFrom(r.titleLine) || slug;
    const area = AREAS[specialty] ? sub : null;
    if (AREAS[specialty] && !AREAS[specialty].some((a) => a.area === sub)) warnings.push(`${rel}: '${sub}' is not an area of ${specialty} (AREAS)`);
    rows.push({
      rel, specialty, sub, area, slug,
      dbSlug: matchSlug || slug, // the row to write to (MATCH keeps the live slug)
      label: topic,
      title: `${topic} Resumos`,
      html: bodyHtml(topic, r),
      stats: r.stats,
      titleLine: r.titleLine,
    });
  }
  for (const [newSlug, liveSlug] of Object.entries(MATCH)) {
    if (!seen.has(newSlug)) warnings.push(`MATCH: '${newSlug}' has no file (meant for live '${liveSlug}')`);
  }
  for (const [o, n] of Object.entries(RENAMES)) {
    if (!seen.has(n)) warnings.push(`RENAMES: target '${n}' has no file (from '${o}')`);
  }
  for (const s of RETIRE) if (seen.has(s)) warnings.push(`RETIRE: '${s}' has a file — remove it from RETIRE`);
  return { files, rows, warnings };
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(SRC)) { console.error(`Source dir not found: ${SRC}`); process.exit(1); }
  const { files, rows, warnings } = buildRows();

  // Hub card order: alphabetical inside each hub (a specialty hub, or an area hub).
  const hubKey = (r) => `${r.specialty}/${r.area || ""}`;
  const ordered = rows.slice().sort((a, b) => hubKey(a).localeCompare(hubKey(b)) || collator.compare(a.label, b.label));
  const pos = new Map();
  const counters = {};
  for (const r of ordered) { const k = hubKey(r); counters[k] = (counters[k] || 0) + 1; pos.set(r.slug, counters[k]); }
  const areaValues = Object.entries(AREAS)
    .flatMap(([spec, list]) => list.map((a, i) => `(${sqlStr(spec)}, ${sqlStr(a.area)}, ${sqlStr(areaSlug(a.area))}, ${sqlStr(a.label)}, ${i + 1})`))
    .join(",\n  ");

  const valueLines = rows
    .map((r) => `  (${sqlStr(r.slug)}, ${sqlStr(r.dbSlug)}, ${sqlStr(r.title)}, ${sqlStr(r.label)}, ${sqlStr(r.specialty)}, ${sqlStr(r.area)}, ${pos.get(r.slug)}, ${sqlStr(r.html)})`)
    .join(",\n");
  const renameLines = Object.entries(RENAMES)
    .map(([o, n]) =>
      `UPDATE pages SET slug = ${sqlStr(n)}\n` +
      `WHERE slug = ${sqlStr(o)} AND view = 'resumos'\n` +
      `  AND NOT EXISTS (SELECT 1 FROM pages WHERE slug = ${sqlStr(n)});`)
    .join("\n");

  const sql = `-- resumos-v2-import.sql  (GENERATED by scripts/import-resumos-v2.js — do not hand-edit)
--
-- Replaces every Resumo Narrativo with Karina's 2026-10-05 delivery:
-- ${rows.length} files → UPDATE-in-place for live topics (${Object.keys(MATCH).length} through MATCH, slug kept),
-- ${Object.keys(RENAMES).length} slug renames, INSERT for new topics, ${RETIRE.length} live pages retired to draft,
-- hub card lists rebuilt. run-sql.js wraps this file in one transaction (all-or-nothing).
-- Rollback: parsed/resumos-rollback-2026-10-05-<db>.sql (scripts/snapshot-resumos.js, before apply).

-- 0. Staging table (dropped at commit).
--    slug = where the topic lives after this file; db_slug = the live row it replaces
--    (differs only for MATCH, where the live slug is kept).
CREATE TEMP TABLE nr (slug text PRIMARY KEY, db_slug text UNIQUE NOT NULL, title text, label text,
                      spec_slug text, area text, hub_pos int, body text) ON COMMIT DROP;
INSERT INTO nr (slug, db_slug, title, label, spec_slug, area, hub_pos, body) VALUES
${valueLines};

-- Guards: every specialty resolves; every MATCH target is a live resumo; every
-- updated page has exactly one lesson. Any failure aborts the whole file.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT nr.spec_slug, ', ') INTO bad
  FROM nr LEFT JOIN specialties s ON s.slug = nr.spec_slug WHERE s.id IS NULL;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'unknown specialty slug(s): %', bad; END IF;

  SELECT string_agg(nr.db_slug, ', ') INTO bad
  FROM nr WHERE nr.db_slug <> nr.slug
    AND NOT EXISTS (SELECT 1 FROM pages p WHERE p.slug = nr.db_slug AND p.view = 'resumos');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'MATCH target(s) missing: %', bad; END IF;

  SELECT string_agg(p.slug, ', ') INTO bad
  FROM pages p JOIN nr ON nr.db_slug = p.slug
  WHERE p.view = 'resumos' AND (SELECT count(*) FROM lessons l WHERE l.page_id = p.id) > 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'page(s) with more than one lesson: %', bad; END IF;

  SELECT string_agg(nr.db_slug, ', ') INTO bad
  FROM nr JOIN pages p ON p.slug = nr.db_slug WHERE p.view IS DISTINCT FROM 'resumos';
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'slug(s) taken by a non-resumos page: %', bad; END IF;
END $$;

-- 1. Renames: same topic, the address remediation looks for. Row id kept.
${renameLines}

-- 2. The Outros hub (first time Outros has Resumos) and its area hubs.
INSERT INTO pages (id, slug, title, type, status, view, content_module_id, specialty_id, wp_created_at, wp_modified_at)
SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM pages), 'outros-resumos', 'Outros Resumos',
       'blurb-nav-hub'::page_type, 'publish', 'resumos'::page_view, NULL,
       (SELECT id FROM specialties WHERE slug = 'outros'), now(), now()
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE slug = 'outros-resumos');

CREATE TEMP TABLE areas (spec_slug text, area text, slug text, label text, pos int) ON COMMIT DROP;
INSERT INTO areas (spec_slug, area, slug, label, pos) VALUES
  ${areaValues};

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(a.slug, ', ') INTO bad
  FROM areas a JOIN pages p ON p.slug = a.slug
  WHERE p.view IS DISTINCT FROM 'resumos' OR p.type <> 'blurb-nav-hub';
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'area hub slug(s) taken by another page: %', bad; END IF;
END $$;

--    Area hub = blurb-nav-hub of the same view + specialty whose parent is the
--    specialty's hub (lib/hub-nesting.ts keeps it out of the top-level lists).
WITH top AS (
  SELECT s.slug AS spec_slug, s.id AS spec_id, p.id AS hub_id
  FROM pages p JOIN specialties s ON s.id = p.specialty_id
  WHERE p.view = 'resumos' AND p.type = 'blurb-nav-hub' AND p.slug = s.slug || '-resumos'
),
base AS (SELECT COALESCE(MAX(id), 0) AS m FROM pages),
todo AS (
  SELECT a.*, row_number() OVER (ORDER BY a.spec_slug, a.pos) AS n
  FROM areas a WHERE NOT EXISTS (SELECT 1 FROM pages p WHERE p.slug = a.slug)
)
INSERT INTO pages (id, slug, title, type, status, view, content_module_id, specialty_id, parent_id, wp_created_at, wp_modified_at)
SELECT base.m + todo.n, todo.slug, todo.label || ' Resumos',
       'blurb-nav-hub'::page_type, 'publish', 'resumos'::page_view, NULL, top.spec_id, top.hub_id, now(), now()
FROM todo CROSS JOIN base JOIN top ON top.spec_slug = todo.spec_slug;

UPDATE pages p
SET title = a.label || ' Resumos', status = 'publish',
    parent_id = (SELECT t.id FROM pages t WHERE t.slug = a.spec_slug || '-resumos' AND t.view = 'resumos')
FROM areas a WHERE p.slug = a.slug AND p.view = 'resumos';

--    hubs: one row per specialty hub (area NULL) and one per area hub.
CREATE TEMP TABLE hubs ON COMMIT DROP AS
SELECT s.slug AS spec_slug, NULL::text AS area, s.id AS spec_id, p.id AS hub_id
FROM pages p JOIN specialties s ON s.id = p.specialty_id
WHERE p.view = 'resumos' AND p.type = 'blurb-nav-hub'
  AND NOT EXISTS (SELECT 1 FROM areas a WHERE a.slug = p.slug)
UNION ALL
SELECT a.spec_slug, a.area, p.specialty_id, p.id
FROM areas a JOIN pages p ON p.slug = a.slug AND p.view = 'resumos';

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT nr.spec_slug || '/' || COALESCE(nr.area, ''), ', ') INTO bad
  FROM nr WHERE NOT EXISTS (
    SELECT 1 FROM hubs h WHERE h.spec_slug = nr.spec_slug AND h.area IS NOT DISTINCT FROM nr.area);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'no Resumos hub for: %', bad; END IF;
  IF (SELECT count(*) FROM hubs) <> (SELECT count(DISTINCT (spec_slug, area)) FROM hubs) THEN
    RAISE EXCEPTION 'more than one Resumos hub for a specialty/area';
  END IF;
END $$;

-- 3. Live topics: title / specialty / parent hub / status on the page …
--    (a topic retired by an earlier run comes back: status → publish, note cleared)
UPDATE pages p
SET title = nr.title,
    specialty_id = h.spec_id,
    parent_id = h.hub_id,
    status = 'publish',
    notes = NULLIF(btrim(replace(replace(COALESCE(p.notes, ''), ${sqlStr(RETIRE_NOTE)}, ''), ' | ', '')), '')
FROM nr JOIN hubs h ON h.spec_slug = nr.spec_slug AND h.area IS NOT DISTINCT FROM nr.area
WHERE p.slug = nr.db_slug AND p.view = 'resumos';

--    … and the body on its single lesson.
UPDATE lessons l
SET title = nr.title,
    body_html = nr.body
FROM nr JOIN pages p ON p.slug = nr.db_slug AND p.view = 'resumos'
WHERE l.page_id = p.id AND l.position = 1;

INSERT INTO lessons (page_id, position, title, body_html)
SELECT p.id, 1, nr.title, nr.body
FROM nr JOIN pages p ON p.slug = nr.db_slug AND p.view = 'resumos'
WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.page_id = p.id);

-- 4. New topics: page (id = MAX(id) + n) + lesson.
WITH base AS (SELECT COALESCE(MAX(id), 0) AS m FROM pages),
newrows AS (
  SELECT nr.*, row_number() OVER (ORDER BY nr.slug) AS n
  FROM nr WHERE NOT EXISTS (SELECT 1 FROM pages p WHERE p.slug = nr.db_slug)
),
ins AS (
  INSERT INTO pages
    (id, slug, title, type, status, view, content_module_id, specialty_id, parent_id, wp_created_at, wp_modified_at)
  SELECT base.m + newrows.n, newrows.slug, newrows.title,
         'plain-content'::page_type, 'publish', 'resumos'::page_view, NULL,
         h.spec_id, h.hub_id, now(), now()
  FROM newrows CROSS JOIN base
  JOIN hubs h ON h.spec_slug = newrows.spec_slug AND h.area IS NOT DISTINCT FROM newrows.area
  RETURNING id, slug
)
INSERT INTO lessons (page_id, position, title, body_html)
SELECT ins.id, 1, nr.title, nr.body
FROM ins JOIN nr ON nr.slug = ins.slug;

-- 5. Retire the live pages that have no file (explicit list; kept as draft).
UPDATE pages
SET status = 'draft',
    notes = concat_ws(' | ', NULLIF(notes, ''), ${sqlStr(RETIRE_NOTE)})
WHERE view = 'resumos' AND status = 'publish'
  AND slug IN (${RETIRE.map(sqlStr).join(", ")});

-- 6. Rebuild every Resumos hub's cards from the delivery (alphabetical per hub);
--    a specialty with areas gets one card per area on its own hub.
DELETE FROM nav_items WHERE source_page_id IN (SELECT hub_id FROM hubs);
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
SELECT h.hub_id, p.id, nr.hub_pos, nr.label, 'cards'
FROM nr
JOIN hubs h ON h.spec_slug = nr.spec_slug AND h.area IS NOT DISTINCT FROM nr.area
JOIN pages p ON p.slug = nr.db_slug AND p.view = 'resumos'
ORDER BY h.hub_id, nr.hub_pos;
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
SELECT top.hub_id, ah.hub_id, a.pos, a.label, 'cards'
FROM areas a
JOIN hubs ah ON ah.spec_slug = a.spec_slug AND ah.area = a.area
JOIN hubs top ON top.spec_slug = a.spec_slug AND top.area IS NULL
ORDER BY a.pos;

-- ── Verification (printed by run-sql.js) ──
-- Expect ${rows.length}: published resumo topics after the import.
SELECT count(*) AS published_resumo_topics FROM pages
WHERE view = 'resumos' AND status = 'publish' AND type <> 'blurb-nav-hub' AND slug <> 'resumos';

-- Expect 0 rows: published resumo topics the delivery does not know about.
SELECT p.id, p.slug, p.title AS unexpected_live_resumo
FROM pages p WHERE p.view = 'resumos' AND p.status = 'publish'
  AND p.type <> 'blurb-nav-hub' AND p.slug <> 'resumos'
  AND NOT EXISTS (SELECT 1 FROM nr WHERE nr.db_slug = p.slug);

-- Expect 0: delivered topics whose lesson body is not the new body.
SELECT count(*) AS lessons_not_v2
FROM nr JOIN pages p ON p.slug = nr.db_slug AND p.view = 'resumos'
LEFT JOIN lessons l ON l.page_id = p.id AND l.position = 1
WHERE l.body_html IS DISTINCT FROM nr.body;

-- Expect 0: hub cards pointing at a page that is not published.
SELECT count(*) AS cards_to_unpublished
FROM nav_items n JOIN hubs h ON h.hub_id = n.source_page_id
JOIN pages p ON p.id = n.target_page_id WHERE p.status <> 'publish';

-- Cards per hub (Outros: 3 area cards; each area hub its resumos).
SELECT h.spec_slug, h.area, count(n.id) AS cards
FROM hubs h LEFT JOIN nav_items n ON n.source_page_id = h.hub_id
GROUP BY h.spec_slug, h.area ORDER BY h.spec_slug, h.area NULLS FIRST;
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, sql, "utf8");

  // ── summary ────────────────────────────────────────────────────────────────
  const tot = (k) => rows.reduce((n, r) => n + r.stats[k], 0);
  const bySpec = {};
  for (const r of rows) bySpec[r.specialty] = (bySpec[r.specialty] || 0) + 1;
  console.log(`\nResumos v2 import — generated SQL`);
  console.log(`  source : ${SRC}`);
  console.log(`  output : ${OUT}  (${(sql.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  files  : ${files.length}   rows: ${rows.length}`);
  console.log(`  scenes : ${tot("scenes")}   h3: ${tot("h3")}   h4: ${tot("h4")}   lists: ${tot("lists")}   paragraphs: ${tot("paras")}   checklists: ${tot("checklist")}\n`);
  for (const s of Object.keys(bySpec).sort()) console.log(`    ${s.padEnd(20)} ${bySpec[s]}`);
  console.log(`\n  MATCH (live slug kept): ${Object.keys(MATCH).length}   RENAMES: ${Object.keys(RENAMES).length}   RETIRE: ${RETIRE.length}`);
  if (warnings.length) {
    console.log(`\n  ⚠ ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`    - ${w}`);
  } else {
    console.log(`\n  ✓ no warnings — all ${rows.length} files validated clean`);
  }
  console.log("");
}

if (require.main === module) main();
module.exports = { buildRows, convert, topicFrom, MATCH, RENAMES, RETIRE, SRC };
