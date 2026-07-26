#!/usr/bin/env node
'use strict';

/**
 * Captures the marketing screenshots used on /simulado-revalida ("Veja por dentro")
 * from the REAL running app, so they can be regenerated whenever the exam or the
 * report UI changes instead of quietly rotting into a lie.
 *
 * Writes app/public/landing/simulado/{exam,report}-{desktop,phone}.webp
 *
 * Requires the dev server on :3001 and the LOCAL Supabase stack, because it seeds
 * two throwaway leads (one mid-exam, one submitted with a believable score) to have
 * something real to photograph. Both are deleted afterwards.
 *
 * Browser: drives the installed Chrome via puppeteer-core with a THROWAWAY profile.
 * It never touches the user's Chrome or the chrome-devtools-mcp profile.
 *
 *   npm i -D puppeteer-core     (if not present)
 *   node scripts/capture-simulado-shots.js
 *
 * Dev-only chrome is suppressed before each shot: the LGPD consent bar (via a
 * pre-set cookie), Next's dev indicator, the Vercel toolbar and the TanStack Query
 * devtools button — all of which appeared in the first pass and made the shots
 * unusable.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SHOT_BASE || 'http://localhost:3001';
const DB_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const OUT = path.join(__dirname, '..', 'app', 'public', 'landing', 'simulado');

const SHOTS = [
  { name: 'exam-desktop',   url: '/simulado-revalida/prova',     lead: 'exam',   width: 1200, height: 900,  resize: 1600 },
  { name: 'exam-phone',     url: '/simulado-revalida/prova',     lead: 'exam',   width: 390,  height: 844,  resize: 620 },
  { name: 'report-desktop', url: '/simulado-revalida/resultado', lead: 'report', width: 1200, height: 980,  resize: 1600 },
  { name: 'report-phone',   url: '/simulado-revalida/resultado', lead: 'report', width: 390,  height: 844,  resize: 620 },
];

// Plausible addresses: the masked hint is visible in the exam shot, and
// "@local.test" in a marketing screenshot looks broken.
const EMAILS = { exam: 'ana.souza@gmail.com', report: 'ana.martins@gmail.com' };

const HIDE_DEV_CHROME = `
  nextjs-portal, #__next-build-watcher, [data-nextjs-toolbar],
  vercel-live-feedback, [data-vercel-toolbar],
  .tsqd-open-btn-container, .tsqd-parent-container { display: none !important; }
`;

async function seed(db, email, { answered, correct, submitted }) {
  const qs = await db`
    SELECT id, position, correct_index, area FROM simulado_questions
    WHERE set_version = 2 ORDER BY position
  `;
  if (qs.length === 0) throw new Error('no simulado_questions at set_version 2 — import first');

  const progress = {};
  qs.slice(0, correct).forEach((q) => { progress[q.id] = { a: q.correct_index }; });
  qs.slice(correct, answered).forEach((q) => { progress[q.id] = { a: (q.correct_index + 1) % 4 }; });

  const areas = {};
  for (const [i, q] of qs.slice(0, answered).entries()) {
    areas[q.area] ??= { correct: 0, answered: 0 };
    areas[q.area].answered++;
    if (i < correct) areas[q.area].correct++;
  }
  const areaScores = Object.entries(areas).map(([key, v]) => ({
    key, label: key, correct: v.correct, answered: v.answered,
    total: qs.filter((q) => q.area === key).length,
  }));

  await db`DELETE FROM leads WHERE email = ${email}`;
  await db`
    INSERT INTO leads (email, source, target_cohort, first_name, completed_at, sim_set_version,
                       sim_progress, sim_flagged, sim_answered, sim_started_at, verified_at,
                       sim_completed_at, sim_score, sim_area_scores)
    VALUES (${email}, 'simulado-100', 'revalida-2027-1', 'Ana', now(), 2,
            ${db.json(progress)}, ${db.json([])}, ${answered}, now(), now(),
            ${submitted ? db`now()` : null}, ${submitted ? correct : null},
            ${submitted ? db.json(areaScores) : null})
  `;
  const [lead] = await db`SELECT result_token FROM leads WHERE email = ${email}`;
  return lead.result_token;
}

async function main() {
  const postgres = require('postgres');
  const puppeteer = require('puppeteer-core');

  if (!fs.existsSync(CHROME)) {
    throw new Error(`Chrome not found at ${CHROME}. Set CHROME_PATH.`);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const db = postgres(DB_URL, { max: 1 });
  const tokens = {
    exam: await seed(db, EMAILS.exam, { answered: 23, correct: 15, submitted: false }),
    report: await seed(db, EMAILS.report, { answered: 100, correct: 61, submitted: true }),
  };

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mhs-shots-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir,
    args: ['--no-sandbox', '--hide-scrollbars'],
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mhs-png-'));
  console.log(`\ncapturing from ${BASE}:`);

  for (const s of SHOTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: 2 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.setCookie(
      { name: 'mhs_sim', value: tokens[s.lead], domain: 'localhost', path: '/' },
      { name: 'mhs_analytics_consent', value: 'granted', domain: 'localhost', path: '/' },
    );
    await page.goto(BASE + s.url, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1600));

    await page.addStyleTag({ content: HIDE_DEV_CHROME });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')]
        .find((b) => b.getAttribute('aria-label') === 'Dispensar aviso');
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    const png = path.join(tmp, `${s.name}.png`);
    await page.screenshot({ path: png });
    await page.close();
    console.log(`  ${s.name.padEnd(16)} ${s.width}x${s.height} @2x`);
  }

  await browser.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  await db`DELETE FROM leads WHERE email IN (${EMAILS.exam}, ${EMAILS.report})`;
  await db.end();

  console.log(`\nPNGs written to ${tmp}`);
  console.log('Convert to WebP into app/public/landing/simulado/ , e.g.:');
  console.log(`  python -c "from PIL import Image; import glob,os;` +
    ` [Image.open(f).convert('RGB').save(os.path.join(r'${OUT.replace(/\\/g, '/')}',` +
    ` os.path.basename(f).replace('.png','.webp')),'WEBP',quality=88,method=6) for f in glob.glob(r'${tmp.replace(/\\/g, '/')}/*.png')]"`);
  console.log('\nthrowaway profile deleted; test leads removed');
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
