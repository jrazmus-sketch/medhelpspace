#!/usr/bin/env node
'use strict';

// Read-only diagnostic: is schema-patch-coupons.sql live on the connected DB?
// Reuses run-sql.js's env + connection conventions. Safe — only SELECTs.
//   node scripts/check-coupons-applied.js

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

async function main() {
  loadEnvLocal();
  const db = require('postgres')(buildConnectionUrl(), { max: 1, connect_timeout: 15 });
  try {
    const tables = await db`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('coupons', 'coupon_redemptions')
      ORDER BY table_name`;
    const funcs = await db`
      SELECT proname FROM pg_proc
      WHERE proname IN ('preview_coupon', 'redeem_coupon', 'decrement_coupon_counter')
      ORDER BY proname`;
    const cols = await db`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders'
        AND column_name IN ('coupon_id', 'discount_cents')
      ORDER BY column_name`;

    const hasTables = tables.length === 2;
    const hasFuncs = funcs.length === 3;
    const hasCols = cols.length === 2;
    const applied = hasTables && hasFuncs && hasCols;

    console.log('=== schema-patch-coupons.sql status ===');
    console.log(`tables   : ${tables.map((t) => t.table_name).join(', ') || '(none)'}  ${hasTables ? 'OK' : 'MISSING'}`);
    console.log(`functions: ${funcs.map((f) => f.proname).join(', ') || '(none)'}  ${hasFuncs ? 'OK' : 'MISSING'}`);
    console.log(`orders   : ${cols.map((c) => c.column_name).join(', ') || '(none)'}  ${hasCols ? 'OK' : 'MISSING'}`);

    if (applied) {
      const [{ count: couponCount }] = await db`SELECT COUNT(*)::int AS count FROM coupons`;
      const [{ count: redCount }] = await db`SELECT COUNT(*)::int AS count FROM coupon_redemptions`;
      const codes = await db`SELECT code, discount_type, discount_value, active FROM coupons ORDER BY created_at LIMIT 20`;
      console.log(`\nAPPLIED. coupons=${couponCount}, redemptions=${redCount}`);
      if (codes.length) {
        console.log('Existing codes:');
        for (const c of codes) console.log(`  ${c.code}  ${c.discount_type}=${c.discount_value}  active=${c.active}`);
      }
    } else {
      console.log('\nNOT (fully) APPLIED. Run: node scripts/run-sql.js schema-patch-coupons.sql');
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => { console.error('Check failed:', err.message); process.exit(1); });
