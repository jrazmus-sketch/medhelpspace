#!/usr/bin/env node
'use strict';

/**
 * Imports the free 100-question simulado into `simulado_questions`.
 *
 * Source of truth is Karina's two PDFs (questions + gabarito comentado), parsed
 * offline into three JSON files that must sit in the --dir folder:
 *
 *   merged.json        100 questions: enunciado, alternatives, correct_index,
 *                      comentario, distratores, conceito_chave, has_figure
 *   classification.json 100 entries: area (one of 5 slugs) + tema
 *   figure-urls.json   { "<question number>": "<Bunny CDN url>" } for the 7 figures
 *
 * The whole set is written atomically for its set_version, so the exam is never
 * served a half-written set.
 *
 * IDs ARE STABLE ACROSS RE-IMPORTS. Rows are upserted on (set_version, position)
 * rather than deleted and reinserted, because leads.sim_progress is keyed by
 * simulado_questions.id: a delete/insert cycle would hand every question a new id
 * and silently wipe the answers of everyone with an exam in progress. A correction
 * to a tema or an área must never cost a candidate their work.
 *
 * MEMBER MIRROR (--member-page <slug>): the same 100 questions also ship inside
 * MedHelp 60D as one of the "Simulados 100Q". Members read from `quiz_questions`
 * (that's what the simulado player, progress stats, Revisão and the admin editor
 * all expect), so the set exists in two tables. Rather than let those drift, this
 * script writes BOTH from the one source: a fix to a comentário lands in the funnel
 * and in 60D from a single command. Member rows are matched on (page_id, position),
 * so quiz_questions ids are stable and member progress survives a re-import.
 *
 * Usage:
 *   node scripts/import-simulado-100.js --dir <folder>           # dry run
 *   node scripts/import-simulado-100.js --dir <folder> --apply   # write to DB
 *   node scripts/import-simulado-100.js --dir <folder> --apply \
 *        --member-page simulado-100q-3                           # + sync 60D copy
 */

const fs = require('fs');
const path = require('path');

const SET_VERSION = 2;
const AREAS = ['clinica-medica', 'cirurgia', 'go', 'pediatria', 'saude-coletiva'];
const AREA_LABELS = {
  'clinica-medica': 'Clínica Médica',
  cirurgia: 'Cirurgia Geral',
  go: 'Ginecologia e Obstetrícia',
  pediatria: 'Pediatria',
  'saude-coletiva': 'Saúde Coletiva',
};

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', 'app', '.env.local');
  let raw;
  try { raw = fs.readFileSync(envPath, 'utf8'); }
  catch { return; }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

function buildConnectionUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!supabaseUrl || !password) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD (or DATABASE_URL) in app/.env.local');
  }
  const m = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!m) throw new Error(`Cannot extract project ref from ${supabaseUrl}`);
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${m[1]}.supabase.co:5432/postgres`;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(rows) {
  const errors = [];
  const seen = new Set();

  if (rows.length !== 100) errors.push(`expected 100 questions, got ${rows.length}`);

  for (const r of rows) {
    const at = `Q${r.position}`;
    if (seen.has(r.position)) errors.push(`${at}: duplicate position`);
    seen.add(r.position);

    if (!Number.isInteger(r.position) || r.position < 1 || r.position > 100) {
      errors.push(`${at}: position out of range`);
    }
    if (!r.enunciado || r.enunciado.trim().length < 50) errors.push(`${at}: enunciado too short`);
    if (!Array.isArray(r.alternatives) || r.alternatives.length !== 4) {
      errors.push(`${at}: expected 4 alternatives, got ${r.alternatives?.length}`);
    } else if (r.alternatives.some((a) => !a || !a.trim())) {
      errors.push(`${at}: empty alternative text`);
    }
    if (!Number.isInteger(r.correct_index) || r.correct_index < 0 || r.correct_index > 3) {
      errors.push(`${at}: correct_index out of range (${r.correct_index})`);
    }
    for (const f of ['comentario', 'distratores', 'conceito_chave', 'tema']) {
      if (!r[f] || !String(r[f]).trim()) errors.push(`${at}: empty ${f}`);
    }
    if (!AREAS.includes(r.area)) errors.push(`${at}: invalid area "${r.area}"`);
    if (r.media_url && !/^https:\/\//.test(r.media_url)) errors.push(`${at}: media_url is not https`);
  }

  for (let i = 1; i <= 100; i++) if (!seen.has(i)) errors.push(`missing question ${i}`);
  return errors;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnvLocal();

  const apply = process.argv.includes('--apply');
  const dirIdx = process.argv.indexOf('--dir');
  if (dirIdx === -1 || !process.argv[dirIdx + 1]) {
    console.error('Usage: node scripts/import-simulado-100.js --dir <folder> [--apply]');
    process.exit(1);
  }
  const dir = path.resolve(process.argv[dirIdx + 1]);

  const memberIdx = process.argv.indexOf('--member-page');
  const memberPage = memberIdx === -1 ? null : process.argv[memberIdx + 1] ?? null;
  if (memberIdx !== -1 && !memberPage) {
    console.error('--member-page requires a page slug (e.g. simulado-100q-3)');
    process.exit(1);
  }

  const read = (name) => {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) {
      console.error(`Missing required file: ${p}`);
      process.exit(1);
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  };

  const merged = read('merged.json');
  const classification = read('classification.json');
  const figures = read('figure-urls.json');

  const classBy = new Map(classification.map((c) => [c.number, c]));

  const rows = merged.map((q) => {
    const c = classBy.get(q.number);
    return {
      set_version: SET_VERSION,
      position: q.number,
      enunciado: q.enunciado,
      alternatives: q.alternatives,
      correct_index: q.correct_index,
      comentario: q.comentario,
      distratores: q.distratores,
      conceito_chave: q.conceito_chave,
      area: c?.area,
      tema: c?.tema,
      media_url: figures[String(q.number)] ?? null,
    };
  });

  const errors = validate(rows);
  if (errors.length) {
    console.error(`\nVALIDATION FAILED — ${errors.length} problem(s):\n`);
    errors.slice(0, 40).forEach((e) => console.error('  ' + e));
    if (errors.length > 40) console.error(`  ...and ${errors.length - 40} more`);
    process.exit(1);
  }

  // Summary
  const byArea = {};
  for (const r of rows) byArea[r.area] = (byArea[r.area] ?? 0) + 1;
  const temas = new Set(rows.map((r) => r.tema));

  console.log(`\n${apply ? 'IMPORTING' : 'DRY RUN'} — set_version ${SET_VERSION}\n`);
  console.log(`  questions      ${rows.length}`);
  console.log(`  with figures   ${rows.filter((r) => r.media_url).length}`);
  console.log(`  distinct temas ${temas.size}`);
  console.log('  by grande área:');
  for (const a of AREAS) {
    console.log(`     ${AREA_LABELS[a].padEnd(26)} ${String(byArea[a] ?? 0).padStart(3)}`);
  }
  const dist = rows.reduce((m, r) => ((m[r.correct_index] = (m[r.correct_index] ?? 0) + 1), m), {});
  console.log(`  answer spread  A=${dist[0] ?? 0} B=${dist[1] ?? 0} C=${dist[2] ?? 0} D=${dist[3] ?? 0}`);
  console.log('  validation     PASS');

  if (!apply) {
    console.log('\nDry run — nothing written. Re-run with --apply.');
    return;
  }

  const postgres = require('postgres');
  const db = postgres(buildConnectionUrl(), { max: 1, connect_timeout: 15, idle_timeout: 0 });

  try {
    await db.begin(async (tx) => {
      const [{ count: before }] = await tx`
        SELECT count(*)::int AS count FROM simulado_questions WHERE set_version = ${SET_VERSION}
      `;

      for (const r of rows) {
        await tx`
          INSERT INTO simulado_questions
            (set_version, position, enunciado, alternatives, correct_index,
             comentario, distratores, conceito_chave, area, tema, media_url)
          VALUES
            (${r.set_version}, ${r.position}, ${r.enunciado}, ${db.json(r.alternatives)},
             ${r.correct_index}, ${r.comentario}, ${r.distratores}, ${r.conceito_chave},
             ${r.area}, ${r.tema}, ${r.media_url})
          ON CONFLICT (set_version, position) DO UPDATE SET
            enunciado      = EXCLUDED.enunciado,
            alternatives   = EXCLUDED.alternatives,
            correct_index  = EXCLUDED.correct_index,
            comentario     = EXCLUDED.comentario,
            distratores    = EXCLUDED.distratores,
            conceito_chave = EXCLUDED.conceito_chave,
            area           = EXCLUDED.area,
            tema           = EXCLUDED.tema,
            media_url      = EXCLUDED.media_url
        `;
      }

      // A shorter set would otherwise leave orphans behind.
      const removed = await tx`
        DELETE FROM simulado_questions
        WHERE set_version = ${SET_VERSION} AND position > ${rows.length}
      `;
      console.log(
        `\n  upserted ${rows.length} row(s) (was ${before})` +
          (removed.count ? `, removed ${removed.count} orphan(s)` : ""),
      );
    });

    const [{ count }] = await db`
      SELECT count(*)::int AS count FROM simulado_questions WHERE set_version = ${SET_VERSION}
    `;
    console.log(`  verified in DB: ${count} rows at set_version ${SET_VERSION}`);

    if (memberPage) await syncMemberCopy(db, rows, memberPage);
  } finally {
    await db.end();
  }
}

// ── Member mirror (MedHelp 60D → Simulados 100Q) ──────────────────────────────

// The member quiz renderer expects HTML, and answers as [{text, correct, feedback}].
// The commented gabarito is folded into explanation_html in the same order the
// result page shows it: why the answer is right, where the distractors mislead,
// then the conceito-chave.
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildExplanation(r) {
  return (
    `<p><strong>Comentário.</strong> ${esc(r.comentario)}</p>` +
    `<p><strong>Por que as outras estão erradas.</strong> ${esc(r.distratores)}</p>` +
    `<p><strong>Conceito-chave:</strong> ${esc(r.conceito_chave)}</p>`
  );
}

async function syncMemberCopy(db, rows, slug) {
  const [page] = await db`
    SELECT id, title, content_module_id FROM pages WHERE slug = ${slug}
  `;
  if (!page) {
    throw new Error(
      `--member-page: no page with slug "${slug}". Run schema-patch-simulados-100q-60d.sql first.`,
    );
  }

  console.log(`\n  syncing member copy → ${slug} (page ${page.id}, "${page.title}")`);
  if (page.content_module_id !== 1) {
    console.log(
      `  WARNING: page is not tagged into MedHelp 60D (content_module_id=${page.content_module_id}) — it will be visible outside the 60D gate.`,
    );
  }

  await db.begin(async (tx) => {
    const [{ count: before }] = await tx`
      SELECT count(*)::int AS count FROM quiz_questions WHERE page_id = ${page.id}
    `;

    for (const r of rows) {
      const answers = r.alternatives.map((text, i) => ({
        text,
        correct: i === r.correct_index,
        feedback: '',
      }));
      await tx`
        INSERT INTO quiz_questions (page_id, position, question, answers, media_url, explanation_html)
        VALUES (${page.id}, ${r.position}, ${`<p>${esc(r.enunciado)}</p>`},
                ${db.json(answers)}, ${r.media_url}, ${buildExplanation(r)})
        ON CONFLICT (page_id, position) DO UPDATE SET
          question         = EXCLUDED.question,
          answers          = EXCLUDED.answers,
          media_url        = EXCLUDED.media_url,
          explanation_html = EXCLUDED.explanation_html
      `;
    }

    const removed = await tx`
      DELETE FROM quiz_questions WHERE page_id = ${page.id} AND position > ${rows.length}
    `;
    console.log(
      `  upserted ${rows.length} member question(s) (was ${before})` +
        (removed.count ? `, removed ${removed.count} orphan(s)` : ''),
    );
  });

  const [{ count }] = await db`
    SELECT count(*)::int AS count FROM quiz_questions WHERE page_id = ${page.id}
  `;
  console.log(`  verified in DB: ${count} questions on ${slug}`);
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
