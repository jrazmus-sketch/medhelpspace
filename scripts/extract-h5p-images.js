#!/usr/bin/env node
/**
 * extract-h5p-images.js
 *
 * Reads the WordPress backup (.gz), walks H5P parameters JSON, and populates:
 *   - quiz_questions.media_url  (matched by h5p_sub_id = question subContentId)
 *   - presentation_slides.image_url  (broken 'images/file-xxx#tmp' refs → WP URL)
 *
 * Flashcard items: none of the 3506 rows have images in the source H5P — skipped.
 *
 * WP URL pattern: https://medhelpspace.com.br/wp-content/uploads/h5p/content/{id}/images/{file}
 *
 * Usage:
 *   node scripts/extract-h5p-images.js            # dry run
 *   node scripts/extract-h5p-images.js --apply    # commit to Supabase
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '../app/.env.local') });

const APPLY = process.argv.includes('--apply');
const WP_BASE = 'https://medhelpspace.com.br/wp-content/uploads/h5p/content';
const ROOT = path.join(__dirname, '..');

// Auto-detect the backup file (most recent -db.gz)
const BACKUP = (() => {
  const candidates = fs.readdirSync(ROOT)
    .filter(f => f.endsWith('-db.gz'))
    .sort()
    .reverse();
  if (!candidates.length) throw new Error('No *-db.gz backup file found in project root.');
  return path.join(ROOT, candidates[0]);
})();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Extract the parameters JSON string from a wp_h5p_contents INSERT line.
 * The JSON appears directly after ", {libraryId}, '" in the line.
 */
function extractParamsJson(line, libraryId) {
  const marker = `, ${libraryId}, '`;
  const markerIdx = line.indexOf(marker);
  if (markerIdx < 0) return null;

  const start = markerIdx + marker.length;
  if (line[start] !== '{') return null;

  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < line.length; i++) {
    const ch = line[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return line.slice(start, i + 1); }
    }
  }
  return null;
}

/**
 * Recursively find the first object.path that starts with "images/".
 * H5P stores image references as { path: "images/file-xxx.jpg", mime: "..." }.
 */
const RE_IMAGES = /^images[/\\]/;

function findImagePath(obj) {
  if (obj === null || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = findImagePath(item);
      if (r) return r;
    }
    return null;
  }
  if (typeof obj.path === 'string' && RE_IMAGES.test(obj.path)) return obj.path;
  for (const val of Object.values(obj)) {
    const r = findImagePath(val);
    if (r) return r;
  }
  return null;
}

/** Strip H5P's #tmp suffix and return just the filename. */
function filename(rawPath) {
  return rawPath.split('#')[0].replace(/\\/g, '/').split('/').pop();
}

// ─── scan backup ─────────────────────────────────────────────────────────────

async function scanBackup() {
  // subContentId → { contentId, url }
  const quizImageMap = new Map();
  // filename (no #tmp) → wp url
  const slideImageMap = new Map();

  let scanned = 0;

  await new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(BACKUP).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });

    rl.on('line', (rawLine) => {
      const line = rawLine.trimEnd();
      if (!line.startsWith('INSERT INTO `wp_h5p_contents`')) return;

      const idM = line.match(/^INSERT INTO `wp_h5p_contents` VALUES \((\d+),/);
      if (!idM) return;
      const contentId = parseInt(idM[1]);

      const libM = line.match(/, (\d+), '\{/);
      if (!libM) return;
      const libraryId = parseInt(libM[1]);
      if (libraryId !== 15 && libraryId !== 35) return;

      scanned++;

      const rawJson = extractParamsJson(line, libraryId);
      if (!rawJson) return;

      let params;
      try { params = JSON.parse(rawJson); } catch { return; }

      // ── H5P.QuestionSet (lib 15) ─────────────────────────────────────────
      if (libraryId === 15) {
        for (const q of (params.questions || [])) {
          const subId = q.subContentId;
          if (!subId) continue;

          // Image lives at q.params.media.type.params.file (H5P.Image element)
          const mediaType = q.params?.media?.type;
          if (!mediaType) continue;

          const imgPath = findImagePath(mediaType.params?.file ?? mediaType.params);
          if (!imgPath) continue;

          const fn = filename(imgPath);
          quizImageMap.set(subId, {
            contentId,
            url: `${WP_BASE}/${contentId}/images/${fn}`,
          });
        }
      }

      // ── H5P.CoursePresentation (lib 35) ──────────────────────────────────
      if (libraryId === 35) {
        const slides = params.presentation?.slides || [];
        for (const slide of slides) {
          for (const el of (slide.elements || [])) {
            const action = el.action;
            if (!action?.library?.startsWith('H5P.Image')) continue;

            const imgPath = findImagePath(action.params?.file ?? action.params);
            if (!imgPath) continue;

            const fn = filename(imgPath);
            slideImageMap.set(fn, `${WP_BASE}/${contentId}/images/${fn}`);
          }
        }
      }
    });

    rl.on('close', resolve);
    rl.on('error', reject);
  });

  return { quizImageMap, slideImageMap, scanned };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Backup: ${path.basename(BACKUP)}`);
  console.log(APPLY ? 'MODE: APPLY' : 'MODE: DRY RUN  (add --apply to commit)');
  console.log('');

  console.log('Scanning H5P content…');
  const { quizImageMap, slideImageMap, scanned } = await scanBackup();

  console.log(`  H5P rows scanned : ${scanned}`);
  console.log(`  Quiz images found : ${quizImageMap.size}`);
  console.log(`  Slide images found: ${slideImageMap.size}`);
  console.log('');

  let quizUpdated = 0, quizFailed = 0;
  let slidesUpdated = 0, slidesFailed = 0;

  // ── quiz_questions ─────────────────────────────────────────────────────────
  if (quizImageMap.size > 0) {
    console.log('--- quiz_questions ---');
    for (const [subId, { url }] of quizImageMap) {
      if (!APPLY) {
        console.log(`  DRY  h5p_sub_id=${subId.slice(0, 8)}…  →  ${url.split('/').pop()}`);
        quizUpdated++;
        continue;
      }
      const { data: updatedRows, error } = await supabase
        .from('quiz_questions')
        .update({ media_url: url })
        .eq('h5p_sub_id', subId)
        .select('id');
      if (error) {
        console.log(`  FAIL ${subId}: ${error.message}`);
        quizFailed++;
      } else if (!updatedRows || updatedRows.length === 0) {
        console.log(`  MISS h5p_sub_id=${subId.slice(0, 8)}…  (no matching row in quiz_questions)`);
        quizFailed++;
      } else {
        console.log(`  OK   h5p_sub_id=${subId.slice(0, 8)}…  row_id=${updatedRows[0].id}  →  ${url.split('/').pop()}`);
        quizUpdated++;
      }
    }
    console.log(`  Result: ${quizUpdated} updated, ${quizFailed} failed`);
    console.log('');
  }

  // ── presentation_slides ────────────────────────────────────────────────────
  if (slideImageMap.size > 0) {
    console.log('--- presentation_slides ---');

    const { data: brokenSlides, error: fetchErr } = await supabase
      .from('presentation_slides')
      .select('id, image_url')
      .like('image_url', 'images/%');

    if (fetchErr) {
      console.log(`  ERROR fetching broken slides: ${fetchErr.message}`);
    } else if (!brokenSlides?.length) {
      console.log('  No broken slides found in DB.');
    } else {
      console.log(`  Broken slides in DB: ${brokenSlides.length}`);

      for (const slide of brokenSlides) {
        const fn = filename(slide.image_url);
        const newUrl = slideImageMap.get(fn);

        if (!newUrl) {
          console.log(`  MISS slide.id=${slide.id}  ${fn}  (not in H5P content)`);
          slidesFailed++;
          continue;
        }

        if (!APPLY) {
          console.log(`  DRY  slide.id=${slide.id}  ${fn}  →  ...content/${newUrl.split('/content/')[1]}`);
          slidesUpdated++;
          continue;
        }

        const { error } = await supabase
          .from('presentation_slides')
          .update({ image_url: newUrl })
          .eq('id', slide.id);

        if (error) {
          console.log(`  FAIL slide.id=${slide.id}: ${error.message}`);
          slidesFailed++;
        } else {
          slidesUpdated++;
        }
      }
      console.log(`  Result: ${slidesUpdated} updated, ${slidesFailed} misses/failures`);
    }
    console.log('');
  }

  console.log('═══ Summary ═══════════════════════════');
  console.log(`quiz_questions.media_url     : ${quizUpdated}`);
  console.log(`presentation_slides.image_url: ${slidesUpdated}`);
  if (!APPLY) console.log('\nRun with --apply to write to Supabase.');
}

main().catch(console.error);
