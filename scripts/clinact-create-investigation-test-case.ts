/**
 * Creates (or refreshes) the INVESTIGAÇÃO test case CEC-INV-TESTE-01 from
 * docs/clinact/exemplos/cec-inv-teste-01.txt, as a DRAFT, through the real
 * parser and the one write path (clinact_save_case).
 *
 * The official CEC-01 ("no-inicio-do-plantao") must stay untouched (Karina,
 * 2026-09-03 and 2026-10-06). The script fingerprints it before and after —
 * document hash, steps, options, attempts, events, revision, status, is_free,
 * published_at — and fails loudly if anything moved.
 *
 * Run (from the repo root):
 *   node --import ./app/tests/helpers/alias-hook.mjs scripts/clinact-create-investigation-test-case.ts <DATABASE_URL>
 *
 * Re-run safe: an existing test case is updated in place by slug, and only if it
 * is still a draft (a published one is refused).
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { parseCaseFile, resolveTaxonomy } from "@/lib/clinact/parse";

const require = createRequire(import.meta.url);
const postgres = require(path.resolve("node_modules/postgres"));

const url = process.argv[2];
if (!url) {
  console.error("usage: … clinact-create-investigation-test-case.ts <DATABASE_URL>");
  process.exit(1);
}
const OFFICIAL_SLUG = "no-inicio-do-plantao";
const FILE = path.resolve("docs/clinact/exemplos/cec-inv-teste-01.txt");

const sql = postgres(url, { max: 1 });

async function fingerprint(caseId: number) {
  const [c] = await sql`SELECT id, slug, status, is_free, revision, published_at FROM clinact_cases WHERE id = ${caseId}`;
  const [{ doc }] = await sql`SELECT clinact_case_document(${caseId}) AS doc`;
  const [{ steps }] = await sql`SELECT count(*)::int AS steps FROM clinact_steps WHERE case_id = ${caseId}`;
  const [{ options }] = await sql`SELECT count(*)::int AS options FROM clinact_options o JOIN clinact_steps s ON s.id = o.step_id WHERE s.case_id = ${caseId}`;
  const [{ attempts }] = await sql`SELECT count(*)::int AS attempts FROM clinact_attempts WHERE case_id = ${caseId}`;
  const [{ events }] = await sql`SELECT count(*)::int AS events FROM clinact_step_events e JOIN clinact_attempts a ON a.id = e.attempt_id WHERE a.case_id = ${caseId}`;
  return {
    ...c,
    published_at: c.published_at ? new Date(c.published_at).toISOString() : null,
    steps,
    options,
    attempts,
    events,
    docHash: createHash("sha256").update(JSON.stringify(doc)).digest("hex").slice(0, 16),
  };
}

(async () => {
  const [official] = await sql`SELECT id FROM clinact_cases WHERE slug = ${OFFICIAL_SLUG}`;
  if (!official) throw new Error(`official case ${OFFICIAL_SLUG} not found`);
  const before = await fingerprint(official.id);
  console.log("official CEC-01 before:", before);

  const parsed = parseCaseFile(readFileSync(FILE, "utf8")).cases[0];
  // Same taxonomy link the admin importer makes (ESPECIALIDADE/TEMA → ids).
  const specialties = await sql`SELECT id, name FROM specialties WHERE active`;
  const topics = await sql`SELECT id, name, specialty_id FROM topics`;
  resolveTaxonomy(parsed, specialties as never, topics as never);
  if (parsed.errors.length) throw new Error("parse errors: " + JSON.stringify(parsed.errors));
  if (parsed.warnings.length) console.warn("parse warnings:", parsed.warnings);
  const doc = parsed.doc!;
  if (doc.slug === OFFICIAL_SLUG) throw new Error("the test case must never carry the official slug");

  const [existing] = await sql`SELECT id, status FROM clinact_cases WHERE slug = ${doc.slug}`;
  if (existing && existing.status !== "draft") throw new Error(`test case ${doc.slug} exists and is ${existing.status} — refusing`);
  const payload = { ...doc, id: existing?.id ?? undefined };
  const [{ id }] = await sql`SELECT clinact_save_case(${sql.json(payload)}, NULL) AS id`;
  const [created] = await sql`SELECT id, slug, title, status, is_free FROM clinact_cases WHERE id = ${id}`;
  console.log(existing ? "test case UPDATED:" : "test case CREATED:", created);

  const after = await fingerprint(official.id);
  console.log("official CEC-01 after: ", after);
  const changed = Object.keys(before).filter((k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((after as Record<string, unknown>)[k]));
  if (changed.length) throw new Error("OFFICIAL CEC-01 CHANGED: " + changed.join(", "));
  if (created.status !== "draft" || created.is_free) throw new Error("test case must be a non-free draft");
  console.log("✓ official CEC-01 untouched; test case is a non-free draft, id", id);
  await sql.end();
})().catch(async (e) => {
  console.error("✗", e.message);
  await sql.end();
  process.exit(1);
});
