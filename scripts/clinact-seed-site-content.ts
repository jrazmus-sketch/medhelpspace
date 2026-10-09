/**
 * Creates every missing ClinAct `site_content` row from lib/clinact/site-copy.ts.
 *
 * Why (Karina, 2026-10-08): a <SiteText> is only editable once its row exists.
 * The sales page shipped with 41 keys in code and none in the database, so
 * "Edição rápida" turned on and nothing could be edited. Run this on PROD and
 * LOCAL every time a key is added to CLINACT_COPY.
 *
 * Re-run safe: an existing row is NEVER overwritten (ON CONFLICT DO NOTHING) —
 * a text Karina edited stays hers. Rows under clinact.* that are no longer in
 * the copy are reported, never deleted (the two screenshot slots are expected).
 *
 * Run (from the repo root):
 *   node --import ./app/tests/helpers/alias-hook.mjs scripts/clinact-seed-site-content.ts <DATABASE_URL>
 */
import { createRequire } from "node:module";
import path from "node:path";
import { CLINACT_COPY } from "@/lib/clinact/site-copy";
import { SALES_IMAGE_SLOTS } from "@/lib/clinact/sales-images";

const require = createRequire(import.meta.url);
const postgres = require(path.resolve("node_modules/postgres"));

const url = process.argv[2];
if (!url) {
  console.error("usage: … clinact-seed-site-content.ts <DATABASE_URL>");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });

(async () => {
  const entries = Object.entries(CLINACT_COPY);
  let inserted = 0;
  for (const [key, value] of entries) {
    const rows = await sql`
      INSERT INTO site_content (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO NOTHING
      RETURNING key`;
    inserted += rows.length;
  }
  const known = new Set<string>([...entries.map(([k]) => k), ...SALES_IMAGE_SLOTS.map((s) => s.key)]);
  const stray = (await sql`SELECT key FROM site_content WHERE key LIKE 'clinact.%' ORDER BY key`)
    .map((r: { key: string }) => r.key)
    .filter((k: string) => !known.has(k));
  const missing = (await sql`SELECT key FROM site_content WHERE key = ANY(${entries.map(([k]) => k)})`).length;
  console.log(`copy keys: ${entries.length} · inserted now: ${inserted} · already there: ${entries.length - inserted}`);
  if (missing !== entries.length) throw new Error(`only ${missing} of ${entries.length} keys exist after seeding`);
  if (stray.length) console.log("clinact.* rows not in the copy (left untouched):", stray);
  console.log("✓ every ClinAct key has its row");
  await sql.end();
})().catch(async (e) => {
  console.error("✗", e.message);
  await sql.end();
  process.exit(1);
});
