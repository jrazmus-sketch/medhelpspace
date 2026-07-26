#!/usr/bin/env node
// Emit an idempotent SQL seed block for one or more email template kinds, read
// straight from EMAIL_TEMPLATE_DEFAULTS in app/src/lib/email-render.ts.
//
// WHY: every email patch in this repo carries the note "keep in sync with
// EMAIL_TEMPLATE_DEFAULTS", and hand-transcribing HTML bodies into SQL string
// literals is exactly where that sync breaks (a missed doubled quote, a dropped
// paragraph, a stale variables array). Generating the seed removes the class.
//
// Usage:
//   node scripts/gen-email-template-seed.js lead-sim-turma lead-sim-valor
//   node scripts/gen-email-template-seed.js --prefix lead-sim- > /tmp/seed.sql
//
// ON CONFLICT (kind) DO NOTHING by default: an existing row is somebody's edited
// copy and must never be clobbered. Pass --force to emit DO UPDATE instead (only
// correct when the stored copy is factually wrong — see the v2 email patch).
//
// email-render.ts is a pure module with no imports, so Node loads it directly
// with built-in TypeScript stripping (Node 22.18+ / 24).

const path = require("node:path");
const { pathToFileURL } = require("node:url");

const args = process.argv.slice(2);
const force = args.includes("--force");
const prefixIdx = args.indexOf("--prefix");
const prefix = prefixIdx >= 0 ? args[prefixIdx + 1] : null;
const kinds = args.filter(
  (a, i) => !a.startsWith("--") && !(prefixIdx >= 0 && i === prefixIdx + 1),
);

function q(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

(async () => {
  const modPath = path.join(__dirname, "..", "app", "src", "lib", "email-render.ts");
  const mod = await import(pathToFileURL(modPath).href);
  const defaults = mod.EMAIL_TEMPLATE_DEFAULTS;

  const wanted = prefix
    ? Object.keys(defaults).filter((k) => k.startsWith(prefix))
    : kinds;

  if (wanted.length === 0) {
    console.error("Nothing to emit. Pass template kinds, or --prefix <str>.");
    process.exit(1);
  }

  const missing = wanted.filter((k) => !defaults[k]);
  if (missing.length) {
    console.error(`Unknown kind(s): ${missing.join(", ")}`);
    process.exit(1);
  }

  const conflict = force
    ? `ON CONFLICT (kind) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, subject = EXCLUDED.subject,
  kicker = EXCLUDED.kicker, headline = EXCLUDED.headline, body_html = EXCLUDED.body_html,
  cta_label = EXCLUDED.cta_label, cta_href = EXCLUDED.cta_href,
  variables = EXCLUDED.variables, sort_order = EXCLUDED.sort_order, updated_at = now()`
    : "ON CONFLICT (kind) DO NOTHING";

  for (const kind of wanted) {
    const t = defaults[kind];
    console.log(`-- ${kind} — ${t.name}`);
    console.log(
      `INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, active, sort_order)`,
    );
    console.log(`VALUES (`);
    console.log(`  ${q(t.kind)},`);
    console.log(`  ${q(t.name)},`);
    console.log(`  ${q(t.description)},`);
    console.log(`  ${q(t.subject)},`);
    console.log(`  ${q(t.kicker)},`);
    console.log(`  ${q(t.headline)},`);
    console.log(`  ${q(t.body_html)},`);
    console.log(`  ${q(t.cta_label)},`);
    console.log(`  ${q(t.cta_href)},`);
    console.log(`  ${q(JSON.stringify(t.variables))}::jsonb,`);
    console.log(`  ${t.active === false ? "false" : "true"},`);
    console.log(`  ${t.sort_order}`);
    console.log(`)`);
    console.log(`${conflict};`);
    console.log("");
  }
})();
