#!/usr/bin/env node
'use strict';

// Grants ClinAct access to an existing account, without a payment.
//
// Written for Karina's homologation request (2026-09-17): a dedicated account
// for the PagBank analyst, with access to the ClinAct area and the sales page,
// WITHOUT publishing the page to the public and WITHOUT any admin role. It is
// also the general "comp an account" tool — nothing else writes
// user_product_access yet.
//
// The person must already have an account (they sign up at /signup with the
// e-mail they want). This only grants the product.
//
// Dry run by default. Nothing is written without --apply.
//   node scripts/grant-clinact-access.js --email=alguem@exemplo.com --days=60
//   node scripts/grant-clinact-access.js --email=alguem@exemplo.com --days=60 --apply
//   node scripts/grant-clinact-access.js --email=alguem@exemplo.com --show
//
// Targets PROD unless DATABASE_URL points elsewhere, exactly like run-sql.js:
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
//     node scripts/grant-clinact-access.js --email=dev@local.test --apply
//
// --days=N means "access until N days from today". It never shortens what is
// already there: the invariant from schema-patch-clinact.sql is that paid_until
// only ever moves FORWARD, so running this against a paying student cannot take
// their access away (and cannot stack extra months onto it either).

const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', 'app', '.env.local');
  let raw;
  try { raw = fs.readFileSync(envPath, 'utf8'); } catch { return; }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

function buildConnectionUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!supabaseUrl || !password) {
    throw new Error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD in app/.env.local (or DATABASE_URL).');
  }
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) throw new Error(`Bad SUPABASE_URL: ${supabaseUrl}`);
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${match[1]}.supabase.co:5432/postgres`;
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  loadEnvLocal();

  const email = arg('email');
  const days = Number(arg('days', '60'));
  const apply = process.argv.includes('--apply');
  const show = process.argv.includes('--show');

  if (!email) {
    console.error('Usage: node scripts/grant-clinact-access.js --email=<address> [--days=60] [--show] [--apply]');
    process.exit(1);
  }
  if (!Number.isFinite(days) || days <= 0) {
    console.error(`--days must be a positive number (got "${arg('days')}")`);
    process.exit(1);
  }

  const url = buildConnectionUrl();
  const target = url.includes('127.0.0.1') ? 'LOCAL' : 'PROD';
  const db = require('postgres')(url, { max: 1, connect_timeout: 15 });

  try {
    const users = await db`
      SELECT u.id, u.email, p.display_name, p.role
      FROM auth.users u
      LEFT JOIN profiles p ON p.id = u.id
      WHERE lower(u.email) = lower(${email})`;

    if (users.length === 0) {
      console.error(`\nNo account with ${email} on ${target}.`);
      console.error('They must sign up first at /signup — this script only grants the product.');
      process.exit(2);
    }
    const user = users[0];

    const current = await db`
      SELECT product, source, starts_at, paid_until
      FROM user_product_access
      WHERE user_id = ${user.id}`;

    console.log(`\nTarget database: ${target}`);
    console.log(`Account:         ${user.email}  (${user.display_name || 'sem nome'}, role=${user.role || 'member'})`);
    console.log('Current access:');
    if (current.length === 0) console.log('  (none)');
    for (const row of current) {
      const active = new Date(row.paid_until) > new Date();
      console.log(`  ${row.product}: até ${row.paid_until.toISOString().slice(0, 10)} (${row.source}) ${active ? '— ativo' : '— expirado'}`);
    }

    if (show) return;

    // Exactly what the write below computes, so the preview cannot mislead.
    const [{ new_until: preview }] = await db`
      SELECT GREATEST(
               COALESCE((SELECT paid_until FROM user_product_access
                         WHERE user_id = ${user.id} AND product = 'clinact'), now()),
               now() + (${days} || ' days')::interval
             ) AS new_until`;

    console.log(`\nWould grant ClinAct until ${preview.toISOString().slice(0, 10)} (+${days} days, source='grant').`);

    if (!apply) {
      console.log('\nDry run. Re-run with --apply to write it.');
      return;
    }

    // paid_until only moves forward — GREATEST against the existing value.
    const [row] = await db`
      INSERT INTO user_product_access (user_id, product, source, starts_at, paid_until)
      VALUES (${user.id}, 'clinact', 'grant', now(), now() + (${days} || ' days')::interval)
      ON CONFLICT (user_id, product) DO UPDATE
        SET paid_until = GREATEST(user_product_access.paid_until, EXCLUDED.paid_until),
            source     = 'grant',
            updated_at = now()
      RETURNING paid_until`;

    console.log(`\nGranted. ClinAct access until ${row.paid_until.toISOString().slice(0, 10)}.`);
    // Never claim the account is "just a member" — say what was actually done.
    console.log(`No role was changed (still ${user.role || 'member'}); only product access was granted.`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
