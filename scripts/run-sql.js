#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ── Load app/.env.local ────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', 'app', '.env.local');
  let raw;
  try {
    raw = fs.readFileSync(envPath, 'utf8');
  } catch {
    return; // no .env.local — rely on process.env
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

// ── Build connection URL ───────────────────────────────────────────────────────

function buildConnectionUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;

  if (!supabaseUrl) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not set.\n' +
        '  Add it to app/.env.local, or set DATABASE_URL to the full connection string.',
    );
  }
  if (!password) {
    throw new Error(
      'SUPABASE_DB_PASSWORD is not set.\n' +
        '  Add SUPABASE_DB_PASSWORD=<your-db-password> to app/.env.local\n' +
        '  Find it at: Supabase dashboard → Project Settings → Database → Database password',
    );
  }

  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) {
    throw new Error(
      `Cannot extract project ref from SUPABASE_URL: ${supabaseUrl}\n` +
        '  Expected format: https://<project-ref>.supabase.co/...',
    );
  }
  const ref = match[1];

  // Direct Postgres connection (avoids needing the pooler region).
  // To use the pooler instead, set DATABASE_URL directly:
  //   postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

// ── Count statements (approximate) ────────────────────────────────────────────

function countStatements(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .filter((s) => s.trim().length > 0)
    .length;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  loadEnvLocal();

  const sqlFile = process.argv[2];
  if (!sqlFile) {
    console.error('Usage: node scripts/run-sql.js <path/to/file.sql>');
    process.exit(1);
  }

  const sqlPath = path.resolve(sqlFile);
  let sqlContent;
  try {
    sqlContent = fs.readFileSync(sqlPath, 'utf8');
  } catch (err) {
    console.error(`Cannot read SQL file: ${sqlPath}\n${err.message}`);
    process.exit(1);
  }

  const stmtCount = countStatements(sqlContent);

  let connectionUrl;
  try {
    connectionUrl = buildConnectionUrl();
  } catch (err) {
    console.error(`Configuration error: ${err.message}`);
    process.exit(1);
  }

  console.log('Connecting...');

  let postgres;
  try {
    postgres = require('postgres');
  } catch {
    console.error(
      "Package 'postgres' not found.\n" +
        '  Run: npm install  (from the medhelpspace/ project root)',
    );
    process.exit(1);
  }

  const db = postgres(connectionUrl, {
    max: 1,
    connect_timeout: 15,
    idle_timeout: 0,
    statement_timeout: 0, // no timeout for large migrations
    onnotice: (n) => process.stdout.write(`NOTICE: ${n.message}\n`),
  });

  console.log(`Executing ${stmtCount} statement${stmtCount !== 1 ? 's' : ''}...`);

  let results;
  try {
    results = await db.begin(async (tx) => tx.unsafe(sqlContent));
  } catch (err) {
    const parts = [err.detail, err.hint, err.where].filter(Boolean);
    console.error(
      `\nExecution failed: ${err.message}` +
        (parts.length ? `\n  ${parts.join('\n  ')}` : ''),
    );
    await db.end().catch(() => {});
    process.exit(1);
  }

  const rowsAffected = (Array.isArray(results) ? results : [results]).reduce(
    (sum, r) => sum + (Number(r?.count) || 0),
    0,
  );

  console.log(`Done. ${rowsAffected} row${rowsAffected !== 1 ? 's' : ''} affected.`);

  await db.end();
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
