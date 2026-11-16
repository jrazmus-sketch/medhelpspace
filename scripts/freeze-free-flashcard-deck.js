// Freeze the 50 free Flashcards (lead magnet) exactly as getWeightedRevalidaDeck ranks them TODAY.
// Karina 2026-11-16: the Meu Plano incidence switch must not change the free deck. See
// schema-patch-free-flashcard-deck.sql for the order of application.
//
//   node scripts/freeze-free-flashcard-deck.js            # dry run: prints the 50 ids, writes nothing
//   node scripts/freeze-free-flashcard-deck.js --apply    # seeds free_flashcard_deck (only if empty)
//
// Targets DATABASE_URL (env wins; else app/.env.local → prod). For local:
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/freeze-free-flashcard-deck.js --apply
//
// The ranking below MIRRORS app/src/lib/magnet/flashcards.ts getWeightedRevalidaDeck step by step
// (same page pick, same topic scope, same stable sort, same round-robin, same top-up, same interleave).
// Run it BEFORE schema-patch-topic-incidence-automatic.sql: after the switch the ranking would differ.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
for (const line of fs.readFileSync(path.join(ROOT, "app/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const postgres = require(path.join(ROOT, "node_modules/postgres"));
const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
const isLocal = /127\.0\.0\.1|localhost/.test(url);
const sql = postgres(url, { max: 1, ssl: isLocal ? false : "require" });

const FLASHCARDS_TRACK_ID = 3;
// Must equal WEIGHTED_DECK_PLAN (specialtyId, cards) in app/src/lib/magnet/flashcards.ts.
const PLAN = [[16, 10], [13, 9], [14, 9], [17, 9], [15, 8], [7, 5]];
const TOP_THEMES = 5;

async function computeDeck(tx) {
  const specs = PLAN.map(([s]) => s);
  const pages = await tx`select id, specialty_id from pages
    where track_id = ${FLASHCARDS_TRACK_ID} and status = 'publish' and specialty_id in ${tx(specs)} order by id`;
  const pageBySpec = new Map();
  for (const p of pages) if (!pageBySpec.has(+p.specialty_id)) pageBySpec.set(+p.specialty_id, +p.id);
  const fft = await tx`select specialty_id, group_label, topic_id from flashcard_theme_topics where specialty_id in ${tx(specs)}`;
  const topics = await tx`select id, incidence_count from topics where specialty_id in ${tx(specs)}`;
  const incByTopic = new Map(topics.map((t) => [+t.id, +t.incidence_count || 0]));
  const incBySpecTheme = new Map();
  for (const m of fft) {
    const inc = incByTopic.get(+m.topic_id);
    if (inc != null) incBySpecTheme.set(`${m.specialty_id}::${m.group_label}`, inc);
  }
  const perSubject = new Map();
  for (const [sid, n] of PLAN) {
    const pid = pageBySpec.get(sid);
    if (pid == null) { perSubject.set(sid, []); continue; }
    const rows = await tx`select id, group_label from flashcard_items where page_id = ${pid} order by group_position, position`;
    const themeMap = new Map();
    for (const r of rows) {
      const k = r.group_label ?? "";
      if (!themeMap.has(k)) themeMap.set(k, []);
      themeMap.get(k).push(+r.id);
    }
    const themes = [...themeMap.entries()]
      .map(([label, cards]) => ({ cards, inc: incBySpecTheme.get(`${sid}::${label}`) ?? -1 }))
      .sort((a, b) => b.inc - a.inc)
      .slice(0, TOP_THEMES);
    const sel = [];
    const cur = themes.map(() => 0);
    let progressed = true;
    while (sel.length < n && progressed) {
      progressed = false;
      for (let i = 0; i < themes.length && sel.length < n; i++) {
        if (cur[i] < themes[i].cards.length) { sel.push(themes[i].cards[cur[i]]); cur[i]++; progressed = true; }
      }
    }
    if (sel.length < n) {
      const chosen = new Set(sel);
      outer: for (const [, cards] of themeMap) for (const c of cards) {
        if (sel.length >= n) break outer;
        if (!chosen.has(c)) { sel.push(c); chosen.add(c); }
      }
    }
    perSubject.set(sid, sel);
  }
  const ids = [];
  const cursors = new Map(PLAN.map(([s]) => [s, 0]));
  let more = true;
  while (more) {
    more = false;
    for (const [sid] of PLAN) {
      const list = perSubject.get(sid) ?? [];
      const c = cursors.get(sid);
      if (c < list.length) { ids.push(list[c]); cursors.set(sid, c + 1); more = true; }
    }
  }
  return ids;
}

(async () => {
  await sql.begin(async (tx) => {
    const ids = await computeDeck(tx);
    console.log(`${isLocal ? "LOCAL" : "PROD"} — today's free deck: ${ids.length} cards`);
    console.log(ids.join(","));
    if (ids.length !== 50) throw new Error(`expected 50 cards, got ${ids.length} — nothing written`);
    const existing = (await tx`select flashcard_item_id from free_flashcard_deck order by position`).map((r) => +r.flashcard_item_id);
    if (existing.length > 0) {
      const same = JSON.stringify(existing) === JSON.stringify(ids);
      console.log(same ? "Already frozen with exactly these 50 cards — nothing to do." :
        "free_flashcard_deck already holds a DIFFERENT deck — refusing to overwrite (TRUNCATE first, on Karina's decision).");
      if (!same) process.exitCode = 1;
      return;
    }
    if (!APPLY) { console.log("Dry run — re-run with --apply to freeze."); return; }
    for (let i = 0; i < ids.length; i++) {
      await tx`insert into free_flashcard_deck (position, flashcard_item_id) values (${i + 1}, ${ids[i]})`;
    }
    console.log("Frozen: 50 rows written to free_flashcard_deck.");
  });
  await sql.end();
})().catch(async (e) => { console.error(e.message); await sql.end(); process.exit(1); });
