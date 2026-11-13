#!/usr/bin/env node
'use strict';
/**
 * Narration × text check for AudioCards (single source, TEST). For each AudioCard it transcribes the
 * published audio with Whisper (or reuses an .srt), then looks for every card's question and answer, in
 * order, inside what was heard. A card side whose words are not found is reported as a mismatch.
 *
 *   node scripts/audiocards-asr-check.js --labels "Valvopatias,Fibromialgia" [--srt-dir d] [--apply]
 *   node scripts/audiocards-asr-check.js --all [--whisper <exe>] [--apply]
 *   --text current          (default) compare with the current Flashcards text
 *   --text json:<file>      compare with a snapshot {fc:[{page_slug,group_label,position,text,answer}]}
 *   --apply                 store the result on the AudioCard's latest recording (audiocard_recordings)
 *
 * Whisper writes numbers as digits and misspells some terms ("metimasol"); the matcher tolerates one-letter
 * differences per word, so it finds WORDS that differ (an English term against a Portuguese one), not a
 * single vowel ("pelo/pela"). Mismatches are for a person to listen to, never auto-corrected.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const postgres = require(path.join(__dirname, '..', 'node_modules', 'postgres'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const URL = arg('--db', 'postgresql://postgres:postgres@127.0.0.1:55322/postgres');
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(URL)) { console.error('TEST build: local database only'); process.exit(2); }
const WHISPER = arg('--whisper', process.env.WHISPER_BIN || 'whisper');
const SRT_DIR = arg('--srt-dir', null);
const TEXT = arg('--text', 'current');
const THRESHOLD = Number(arg('--threshold', '0.8'));
const REPORT = arg('--report', null);
const report = [];
const sql = postgres(URL, { max: 1, onnotice: () => {} });

const NUM = { um: '1', uma: '1', dois: '2', duas: '2', tres: '3', quatro: '4', cinco: '5', seis: '6', sete: '7', oito: '8',
  nove: '9', dez: '10', onze: '11', doze: '12', treze: '13', quatorze: '14', catorze: '14', quinze: '15', vinte: '20',
  trinta: '30', quarenta: '40', cinquenta: '50', sessenta: '60', setenta: '70', oitenta: '80', noventa: '90', cem: '100' };
// Units: Whisper writes "4 m por segundo", "40" for "40 mmHg"; never a pedagogical difference on their own.
const UNITS = new Set('metros metro mmhg mg ml kg cm mm mcg ui mui meq mmol'.split(' '));
const STOP = new Set('a o as os de da do das dos e em no na nos nas um uma por para com sem que se ao aos ou mais'.split(' '));
const norm = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/(\w)-(\w)/g, '$1$2').replace(/[^a-z0-9]+/g, ' ').trim();
const toks = (s) => norm(s).split(' ').filter(Boolean).map((t) => NUM[t] || t);
function lev1(a, b) { // edit distance <= 1
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++e > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Portuguese sound-alike form: Whisper hears "ressecção" as "recepção", "macicez" as "macisseis".
const phon = (t) => t.replace(/c(?=[ei])/g, 's').replace(/z$/, 's').replace(/ph/g, 'f').replace(/h/g, '').replace(/(.)\1+/g, '$1');
const same = (a, b) => a === b || (a.length >= 4 && lev1(a, b))
  || (a.length >= 7 && b.length >= 7 && a.slice(0, 6) === b.slice(0, 6))
  || (a.length >= 6 && lev(phon(a), phon(b)) <= 2);
function lcs(x, y) { // token LCS length with fuzzy equality
  const m = x.length, n = y.length; let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) { const cur = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) cur[j] = same(x[i - 1], y[j - 1]) ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur; }
  return prev[n];
}
function parseSrt(file) {
  const out = [];
  for (const block of fs.readFileSync(file, 'utf8').split(/\r?\n\r?\n/)) {
    const m = block.match(/(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)\s*\r?\n([\s\S]*)/);
    if (!m) continue;
    const t = (h, mi, se, ms) => +h * 3600 + +mi * 60 + +se + +ms / 1000;
    out.push({ start: t(m[1], m[2], m[3], m[4]), end: t(m[5], m[6], m[7], m[8]), text: m[9].replace(/\r?\n/g, ' ') });
  }
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function download(url, file) { // the CDN occasionally drops a connection: retry, never crash the run
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url); if (!res.ok) throw new Error(`audio ${res.status}`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer())); return;
    } catch (e) { if (i >= 4) throw e; await sleep(5000 * i); }
  }
}
function whisper(file, dir, fmt) {
  execFileSync(WHISPER, [file, '--model', 'large-v3-turbo', '--language', 'pt', '--output_format', fmt, '--output_dir', dir, '--verbose', 'False'],
    { stdio: 'ignore', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
}

async function heard(audioUrl) {
  // <specialty folder>__<file>: two specialties can have an audio with the same file name.
  const base = `${path.basename(path.dirname(new globalThis.URL(audioUrl).pathname))}__${path.basename(audioUrl).replace(/-A\.mp3$/i, '').replace(/\.mp3$/i, '')}`;
  // With --srt-dir the transcript is kept there, so an interrupted run resumes where it stopped.
  const dir = SRT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'asr-'));
  fs.mkdirSync(dir, { recursive: true });
  const mp3 = path.join(dir, base + '.mp3'), srt = path.join(dir, base + '.srt');
  if (!fs.existsSync(srt)) {
    if (!fs.existsSync(mp3)) await download(audioUrl, mp3);
    whisper(mp3, dir, 'srt');
  }
  return { segments: parseSrt(srt), mp3, url: audioUrl, dir };
}

// Whisper, on a whole file, sometimes drops a sentence inside a long segment. Before reporting a card,
// transcribe just that stretch of audio again and look for the words there.
async function secondPass(a, from, to, T) {
  if (!fs.existsSync(a.mp3)) await download(a.url, a.mp3);
  const clipDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-clip-'));
  const clip = path.join(clipDir, 'clip.mp3');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(Math.max(0, from)), '-to', String(to), '-i', a.mp3, clip], { stdio: 'ignore' });
  whisper(clip, clipDir, 'txt');
  const C = toks(fs.readFileSync(path.join(clipDir, 'clip.txt'), 'utf8'));
  fs.rmSync(clipDir, { recursive: true, force: true });
  let best = 0;
  for (let s = 0; s < C.length; s++) for (const w of [T.length - 2, T.length, T.length + 3]) {
    if (w <= 0 || s + w > C.length) continue;
    best = Math.max(best, lcs(T, C.slice(s, s + w)) / T.length);
  }
  const joined = C.slice(0, -1).map((h, i) => h + C[i + 1]);
  const missing = T.filter((t) => t.length >= 4 && !STOP.has(t) && !UNITS.has(t) && !C.some((h) => same(t, h)) && !joined.some((h) => same(t, h)));
  return { ok: best >= THRESHOLD && !missing.length, best, missing, heard: C.join(' ') };
}

(async () => {
  const labels = arg('--labels', null)?.split(',').map((s) => s.trim());
  const groups = await sql`select g.id, g.label, d.slug deck, l.id lesson_id, l.audio_url
    from flashcard_groups g join pages d on d.id = g.page_id join lessons l on l.id = g.audiocard_lesson_id
    where l.audio_url is not null ${labels ? sql`and g.label = any(${labels})` : sql``} order by d.slug, g.position`;
  if (!labels && !has('--all')) { console.error('use --labels or --all'); process.exit(2); }
  const snap = TEXT.startsWith('json:') ? require(path.resolve(TEXT.slice(5))) : null;
  let total = 0;
  const failed = [];
  for (const g of groups) {
   try {
    const cards = snap
      ? snap.fc.filter((f) => f.page_slug === g.deck && f.group_label === g.label).sort((a, b) => a.position - b.position)
      : await sql`select position, text, answer from flashcard_items where group_id = ${g.id} order by position`;
    const a = await heard(g.audio_url);
    const H = [], segOf = [];
    a.segments.forEach((sg, i) => { for (const t of toks(sg.text)) { H.push(t); segOf.push(i); } });
    let cursor = 0; const mism = [];
    for (const c of cards) for (const [side, txt] of [['question', c.text], ['answer', c.answer]]) {
      const T = toks(txt); if (!T.length) continue;
      const anchor = cursor;   // where the previous card side ended in the transcript
      let best = 0, bestAt = cursor, bestLen = T.length;
      const from = Math.max(0, cursor - 10), to = Math.min(H.length, cursor + T.length * 4 + 60);
      for (let s = from; s < to; s++) for (const w of [T.length - 2, T.length, T.length + 3]) {
        if (w <= 0 || s + w > H.length) continue;
        const sc = lcs(T, H.slice(s, s + w)) / T.length;
        if (sc > best) { best = sc; bestAt = s; bestLen = w; }
      }
      if (best >= 0.5) cursor = bestAt + bestLen;
      const win = H.slice(Math.max(0, bestAt - 3), bestAt + bestLen + 3);
      const joined = win.slice(0, -1).map((h, i) => h + win[i + 1]);   // "por que" -> "porque", "tubulo viloso"
      const missing = T.filter((t) => t.length >= 4 && !STOP.has(t) && !UNITS.has(t) && !win.some((h) => same(t, h)) && !joined.some((h) => same(t, h)));
      if (best < THRESHOLD || missing.length) {
        // Re-listen from where the previous side ended: when Whisper dropped this side, the best match lies
        // somewhere later and must not decide where to listen. At most 90 s.
        const t0 = Math.max(0, Math.min(anchor, bestAt) - 8);
        const t1 = Math.min(H.length - 1, Math.max(anchor + T.length + 12, bestAt + bestLen + 8));
        const s0 = a.segments[segOf[Math.min(H.length - 1, t0)]] || a.segments[0];
        let s1 = a.segments[segOf[t1]] || a.segments[a.segments.length - 1];
        if (s1.end - s0.start > 90) s1 = { end: s0.start + 90 };
        const p2 = await secondPass(a, s0.start - 2, s1.end + 2, T);
        if (p2.ok) continue;   // the words are in the audio: whole-file transcription had dropped them
        mism.push({ position: c.position, side, score: +p2.best.toFixed(2),
          at: `${Math.floor(s0.start / 60)}:${String(Math.floor(s0.start % 60)).padStart(2, '0')}`,
          expected: norm(txt), heard: p2.heard, missing_words: p2.missing });
      }
    }
    if (!mism.length && SRT_DIR && fs.existsSync(a.mp3)) fs.rmSync(a.mp3);   // keep the audio only where a person must listen
    total += mism.length;
    report.push({ deck: g.deck, label: g.label, cards: cards.length, mismatches: mism });
    if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
    console.log(`\n${g.deck.replace('-flashcards', '')} › ${g.label}: ${cards.length} cartões, ${mism.length} divergência(s)`);
    for (const m of mism) console.log(`  card ${m.position} ${m.side} (~${m.at}) palavras não ouvidas: ${m.missing_words.join(' ')}\n     ouvido: ${m.heard}`);
    if (has('--apply')) {
      await sql`update audiocard_recordings set asr_checked_at = now(), asr_model = 'whisper large-v3-turbo', asr_mismatches = ${sql.json(mism)}
        where id = (select id from audiocard_recordings where lesson_id = ${g.lesson_id} order by recorded_at desc, id desc limit 1)`;
    }
   } catch (e) {
    failed.push(`${g.deck}/${g.label}: ${e.message}`);
    console.log(`\n${g.deck.replace('-flashcards', '')} › ${g.label}: ERRO (${e.message}) — rode de novo para retomar`);
   }
  }
  if (failed.length) console.log(`\n${failed.length} AudioCard(s) com erro:\n  ${failed.join('\n  ')}`);
  console.log(`\n${groups.length} AudioCards verificados, ${total} divergência(s).`);
  await sql.end();
})().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
