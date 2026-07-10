'use strict';
/**
 * build-simulado-100.js — assembles the free 100-question simulado from REAL
 * past-Revalida questions (view='quiz' bank) and writes:
 *
 *   app/src/lib/magnet/simulado-questions.ts   (SIMULADO_100_IDS + block map)
 *   docs/simulado-100-review.md                (Karina's review sheet)
 *
 * Selection rules:
 *   - pool: quiz_questions under view='quiz' pages, real INEP editions 2020-2025.2
 *   - EXCLUDES the 15 ids already used by /questoes-revalida (MAGNET_ALL_IDS)
 *   - EXCLUDES specialty 'outros' (ambiguous área)
 *   - dedupes cross-listed questions by (questão number, edition) tag — the same
 *     INEP question appears under >1 topic page; we keep ONE copy (highest-incidence
 *     topic wins, then lowest id)
 *   - 5 blocks of 20 by grande área: Clínica Médica (group 'Clínica Médica' +
 *     emergencia), Cirurgia, GO (gineco+obstetrícia), Pediatria, Saúde Coletiva
 *   - within an área: topics ranked by topics.incidence_count (source_page_id join),
 *     round-robin one question per topic per pass (breadth over depth), preferring
 *     the edition least represented so far (spread 2020→2025.2)
 *   - fully deterministic — re-running against unchanged data yields the same set
 *
 * READ-ONLY against the DB. Writes only the two local files above.
 * Dry run by default; --apply writes the files.
 *
 *   node scripts/build-simulado-100.js [--apply]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

// Keep in sync with app/src/lib/magnet/questions.ts (MAGNET_ALL_IDS).
const MAGNET_ALL_IDS = [
  3169, 2758, 2765, 3303, 3033,
  3214, 2893, 2912, 3099, 2831, 3138, 3344, 2717, 2855, 2696,
];

function loadEnvLocal() {
  const raw = fs.readFileSync(path.join(ROOT, 'app', '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
function connUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
  return `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`;
}

// Grande-área blueprint: 20 questions each, in the block order shown to the lead.
const AREAS = [
  { key: 'clinica-medica', label: 'Clínica Médica' },
  { key: 'cirurgia', label: 'Cirurgia' },
  { key: 'go', label: 'Ginecologia e Obstetrícia' },
  { key: 'pediatria', label: 'Pediatria' },
  { key: 'saude-coletiva', label: 'Saúde Coletiva' },
];
const PER_AREA = 20;

function areaOf(specSlug, groupLabel) {
  if (specSlug === 'outros') return null; // excluded
  if (specSlug === 'ginecologia' || specSlug === 'obstetricia') return 'go';
  if (specSlug === 'pediatria') return 'pediatria';
  if (specSlug === 'cirurgia-geral') return 'cirurgia';
  if (specSlug === 'saude-coletiva') return 'saude-coletiva';
  if (groupLabel === 'Clínica Médica' || specSlug === 'emergencia') return 'clinica-medica';
  return 'clinica-medica';
}

// Tag formats seen in the bank: "Questão 99 (Revalida 2020)",
// "Questão 38 · Revalida 2020", "Questão 64 (Revalida 2023.1)". Tolerant match:
// questão number, then a short separator, then the Revalida edition.
function editionTag(html) {
  const text = stripHtml(html);
  const m = text.match(/Quest[aã]o\s+(\d+)[\s\S]{0,12}?Revalida\s+(20\d\d(?:\.[12])?)/i);
  if (!m) return null;
  return { num: m[1], edition: m[2] };
}

function stripHtml(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

(async () => {
  loadEnvLocal();
  const postgres = require(path.join(ROOT, 'node_modules', 'postgres'));
  const db = postgres(connUrl(), { max: 1 });
  try {
    // LATERAL keeps this one-row-per-question even when >1 topics row points at
    // the same source page (highest-incidence topic wins).
    const rows = await db`
      SELECT q.id, q.page_id, q.question, q.media_url,
             length(trim(coalesce(q.explanation_html,''))) expl_len,
             s.slug spec_slug, s.group_label,
             p.title page_title,
             t.name topic_name,
             coalesce(t.incidence_count, 0) incidence,
             coalesce(t.priority_tier, '-') tier
      FROM quiz_questions q
      JOIN pages p ON p.id = q.page_id
      JOIN specialties s ON s.id = p.specialty_id
      LEFT JOIN LATERAL (
        SELECT name, incidence_count, priority_tier FROM topics
        WHERE source_page_id = p.id
        ORDER BY incidence_count DESC NULLS LAST, id LIMIT 1
      ) t ON true
      WHERE p.view = 'quiz'`;
    console.log(`pool: ${rows.length} rows under view='quiz'`);

    const excluded = new Set(MAGNET_ALL_IDS);
    // 1) Filter + tag
    const candidates = [];
    let noTag = 0, outros = 0, magnetHit = 0;
    for (const r of rows) {
      if (excluded.has(Number(r.id))) { magnetHit++; continue; }
      const area = areaOf(r.spec_slug, r.group_label);
      if (!area) { outros++; continue; }
      const tag = editionTag(r.question);
      // Untagged questions can't be dedupe-verified or edition-claimed — skip them
      // (4 of 891; the marketing claim is "questões reais com edição identificada").
      if (!tag) { noTag++; continue; }
      candidates.push({
        id: Number(r.id),
        area,
        spec: r.spec_slug,
        topicName: r.topic_name ?? r.page_title,
        incidence: Number(r.incidence),
        tier: r.tier,
        edition: tag ? tag.edition : '?',
        qnum: tag ? tag.num : '?',
        // dedupe key: same INEP question cross-listed under 2+ topic pages
        dedupeKey: tag ? `${tag.edition}#${tag.num}` : `id:${r.id}`,
        media: Boolean(r.media_url),
        hasExpl: Number(r.expl_len) > 30,
        preview: stripHtml(r.question).slice(0, 150),
      });
    }
    console.log(`filtered: -${magnetHit} magnet ids, -${outros} outros, ${noTag} untagged kept; candidates=${candidates.length}`);

    // Also drop the DUPLICATE copies of the magnet 15 (same INEP question under
    // another page) so the funnels never show the same question twice.
    const magnetTags = new Set(
      rows.filter((r) => excluded.has(Number(r.id)))
        .map((r) => editionTag(r.question))
        .filter(Boolean)
        .map((t) => `${t.edition}#${t.num}`),
    );

    // 2) Dedupe cross-listed: keep highest-incidence topic copy, then lowest id
    const byKey = new Map();
    let magnetDupDropped = 0;
    for (const c of candidates) {
      if (magnetTags.has(c.dedupeKey)) { magnetDupDropped++; continue; }
      const prev = byKey.get(c.dedupeKey);
      if (!prev || c.incidence > prev.incidence || (c.incidence === prev.incidence && c.id < prev.id)) {
        byKey.set(c.dedupeKey, c);
      }
    }
    const deduped = [...byKey.values()];
    console.log(`deduped: ${deduped.length} unique questions (dropped ${candidates.length - magnetDupDropped - deduped.length} cross-listed dups, ${magnetDupDropped} magnet-question dups)`);

    // 3) Per-área selection
    const picked = [];
    const editionCount = new Map(); // global edition spread
    for (const area of AREAS) {
      const pool = deduped.filter((c) => c.area === area.key);
      // topics ranked by incidence desc, then name for determinism
      const topics = new Map();
      for (const c of pool) {
        const key = c.topicName ?? '(sem tópico)';
        if (!topics.has(key)) topics.set(key, { incidence: c.incidence, items: [] });
        topics.get(key).items.push(c);
      }
      const rankedTopics = [...topics.entries()]
        .sort((a, b) => b[1].incidence - a[1].incidence || a[0].localeCompare(b[0]))
        .map(([name, t]) => ({ name, ...t }));
      for (const t of rankedTopics) t.items.sort((a, b) => a.id - b.id);

      const areaPicked = [];
      let pass = 0;
      while (areaPicked.length < PER_AREA && pass < 50) {
        let advanced = false;
        for (const t of rankedTopics) {
          if (areaPicked.length >= PER_AREA) break;
          if (t.items.length === 0) continue;
          // choose the item whose edition is least represented globally
          let best = 0;
          for (let i = 1; i < t.items.length; i++) {
            const bi = editionCount.get(t.items[i].edition) ?? 0;
            const bb = editionCount.get(t.items[best].edition) ?? 0;
            if (bi < bb || (bi === bb && t.items[i].id < t.items[best].id)) best = i;
          }
          const chosen = t.items.splice(best, 1)[0];
          // one question per topic per pass → breadth first
          areaPicked.push(chosen);
          editionCount.set(chosen.edition, (editionCount.get(chosen.edition) ?? 0) + 1);
          advanced = true;
          if (pass === 0) continue; // first pass: strictly one per topic
        }
        if (!advanced) break;
        pass++;
      }
      if (areaPicked.length < PER_AREA) {
        console.warn(`  ! área ${area.key}: only ${areaPicked.length}/${PER_AREA} available`);
      }
      console.log(`  área ${area.label}: picked ${areaPicked.length} from ${pool.length} candidates across ${rankedTopics.length} topics`);
      picked.push({ area, items: areaPicked });
    }

    const flat = picked.flatMap((p) => p.items);
    console.log(`\nTOTAL picked: ${flat.length}`);
    console.log('edition spread:', [...editionCount.entries()].sort().map(([e, n]) => `${e}:${n}`).join('  '));
    const noExpl = flat.filter((c) => !c.hasExpl);
    if (noExpl.length) console.warn(`  ! ${noExpl.length} picked questions lack explanation_html: ids ${noExpl.map((c) => c.id).join(', ')}`);

    // 4) Emit files
    const tsLines = [];
    tsLines.push('// GENERATED by scripts/build-simulado-100.js — do not hand-edit ids here.');
    tsLines.push('// To swap a question after Karina\'s review, edit the OVERRIDES in that script');
    tsLines.push('// and re-run with --apply, or replace an id in place (keep 20 per bloco).');
    tsLines.push('//');
    tsLines.push('// 100 REAL past-Revalida (INEP) questions, 5 blocos of 20 by grande área,');
    tsLines.push('// editions 2020–2025.2 mixed, incidence-weighted topic coverage, deduped');
    tsLines.push('// against /questoes-revalida (MAGNET_ALL_IDS) including cross-listed copies.');
    tsLines.push('');
    tsLines.push('export type SimuladoBloco = {');
    tsLines.push('  key: string;');
    tsLines.push('  label: string;');
    tsLines.push('  questionIds: number[];');
    tsLines.push('};');
    tsLines.push('');
    tsLines.push('export const SIMULADO_BLOCOS: SimuladoBloco[] = [');
    for (const p of picked) {
      tsLines.push(`  {`);
      tsLines.push(`    key: ${JSON.stringify(p.area.key)},`);
      tsLines.push(`    label: ${JSON.stringify(p.area.label)},`);
      tsLines.push(`    questionIds: [`);
      for (let i = 0; i < p.items.length; i += 10)
        tsLines.push(`      ${p.items.slice(i, i + 10).map((c) => c.id).join(', ')},`);
      tsLines.push(`    ],`);
      tsLines.push(`  },`);
    }
    tsLines.push('];');
    tsLines.push('');
    tsLines.push('export const SIMULADO_100_IDS: number[] = SIMULADO_BLOCOS.flatMap((b) => b.questionIds);');
    tsLines.push('export const SIMULADO_TOTAL = SIMULADO_100_IDS.length; // 100');
    tsLines.push('');

    const md = [];
    md.push('# Simulado 100Q — planilha de revisão (Karina)');
    md.push('');
    md.push(`Gerado em 2026-07-10 por \`scripts/build-simulado-100.js\`. ${flat.length} questões REAIS`);
    md.push('do Revalida (INEP), 5 blocos de 20 por grande área, edições 2020–2025.2.');
    md.push('');
    md.push('**Como revisar:** marque a coluna *Trocar?* com ✗ para qualquer questão que deva sair');
    md.push('(ex.: questão ANULADA pelo INEP, enunciado problemático, tema repetido). Me avise e eu');
    md.push('troco pela próxima candidata do mesmo tópico/área — os ids ficam em');
    md.push('`app/src/lib/magnet/simulado-questions.ts`.');
    md.push('');
    md.push(`Distribuição por edição: ${[...editionCount.entries()].sort().map(([e, n]) => `${e} (${n})`).join(', ')}`);
    md.push('');
    for (const p of picked) {
      md.push(`## Bloco: ${p.area.label} (${p.items.length})`);
      md.push('');
      md.push('| # | id | Edição | Q# | Especialidade | Tópico | Tier | Imagem | Enunciado (início) | Trocar? |');
      md.push('|---|----|--------|----|--------------|--------|------|--------|--------------------|---------|');
      p.items.forEach((c, i) => {
        md.push(`| ${i + 1} | ${c.id} | ${c.edition} | ${c.qnum} | ${c.spec} | ${(c.topicName ?? '').replace(/\|/g, '/')} | ${c.tier} | ${c.media ? 'sim' : ''} | ${c.preview.replace(/\|/g, '/')} |  |`);
      });
      md.push('');
    }

    const tsPath = path.join(ROOT, 'app', 'src', 'lib', 'magnet', 'simulado-questions.ts');
    const mdPath = path.join(ROOT, 'docs', 'simulado-100-review.md');
    if (APPLY) {
      fs.writeFileSync(tsPath, tsLines.join('\n'), 'utf8');
      fs.mkdirSync(path.dirname(mdPath), { recursive: true });
      fs.writeFileSync(mdPath, md.join('\n'), 'utf8');
      console.log(`\nWROTE ${tsPath}`);
      console.log(`WROTE ${mdPath}`);
    } else {
      console.log('\nDRY RUN — pass --apply to write the two files. First bloco preview:');
      console.log(picked[0].items.slice(0, 5).map((c) => `  ${c.id}  ${c.edition} Q${c.qnum}  [${c.spec}] ${c.preview.slice(0, 80)}`).join('\n'));
    }
  } finally {
    await db.end();
  }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
