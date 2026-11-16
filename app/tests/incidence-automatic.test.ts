/**
 * Automatic incidence (Karina 2026-11-16). The behaviour itself is a database trigger, tested against a
 * prod copy with real data (reclassify, duplicate section, unpublish, new original, manual write, new topic);
 * these tests keep the code-side guarantees from regressing:
 *   - the free 50 Flashcards come from the frozen table, so the incidence switch cannot move them;
 *   - the switch patch refuses to run before the deck is frozen;
 *   - the count is the approved definition (distinct originals with a PUBLISHED record), and a manual
 *     write can never stick.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

test("free deck: the frozen table is read before any ranking", () => {
  const src = read("app/src/lib/magnet/flashcards.ts");
  const fn = src.slice(src.indexOf("export async function getWeightedRevalidaDeck"));
  const frozenAt = fn.indexOf('from("free_flashcard_deck")');
  const rankAt = fn.indexOf("computeWeightedDeckIds()");
  assert.ok(frozenAt > 0, "getWeightedRevalidaDeck must read free_flashcard_deck");
  assert.ok(frozenAt < rankAt, "the frozen deck must win over the incidence ranking");
});

test("switch patch refuses to run before the free deck is frozen", () => {
  const sql = read("schema-patch-topic-incidence-automatic.sql");
  const guard = sql.indexOf("(SELECT count(*) FROM free_flashcard_deck) <> 50");
  const sw = sql.indexOf("n := refresh_topic_incidence()");
  assert.ok(guard > 0 && guard < sw, "the 50-card guard must precede the switch");
});

test("count = distinct originals with a published record; manual writes are corrected", () => {
  const sql = read("schema-patch-topic-incidence-automatic.sql");
  assert.match(sql, /FROM exam_questions e\s+WHERE e\.topic_id = p_topic_id\s+AND EXISTS/);
  assert.match(sql, /p\.status = 'publish'/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF incidence_count ON topics/);
  assert.match(sql, /NEW\.incidence_count := n;/);
  for (const t of ["exam_questions", "quiz_questions", "pages"]) {
    assert.match(sql, new RegExp(`AFTER [A-Za-z ,_]+ ON ${t}\\s+FOR EACH STATEMENT`), `${t} must trigger a refresh`);
  }
});

test("rollback restores the pre-switch numbers after removing the triggers", () => {
  const sql = read("schema-patch-topic-incidence-automatic-rollback.sql");
  assert.ok(sql.indexOf("DROP TRIGGER IF EXISTS topics_incidence_enforce") < sql.indexOf("FROM topics_bk_incidence"));
});
