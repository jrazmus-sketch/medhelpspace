#!/usr/bin/env node
'use strict';

/**
 * Registers a global webhook with PagBank Connect at the account level.
 * The per-charge notification_urls already handles per-charge events;
 * this provides account-level coverage as a fallback.
 *
 * Usage:
 *   node scripts/register-pagbank-webhook.js           # list existing webhooks
 *   node scripts/register-pagbank-webhook.js --apply   # register the webhook
 */

const path = require('path');
const fs = require('fs');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', 'app', '.env.local');
  let raw;
  try { raw = fs.readFileSync(envPath, 'utf8'); }
  catch { return; }
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

loadEnvLocal();

const ENV = process.env.PAGBANK_ENVIRONMENT ?? 'production';
const TOKEN = ENV === 'sandbox'
  ? process.env.PAGBANK_ACCESS_TOKEN_SANDBOX
  : process.env.PAGBANK_ACCESS_TOKEN;
const BASE_URL = ENV === 'sandbox'
  ? 'https://sandbox.api.pagseguro.com'
  : 'https://api.pagseguro.com';
const WEBHOOK_URL = `${process.env.PAGBANK_WEBHOOK_BASE_URL}/api/pagbank/webhook`;

if (!TOKEN) {
  console.error(`PAGBANK_ACCESS_TOKEN${ENV === 'sandbox' ? '_SANDBOX' : ''} is not set.`);
  process.exit(1);
}

async function pagbankFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PagBank ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const apply = process.argv.includes('--apply');

  // List existing webhooks
  console.log(`Environment: ${ENV}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}\n`);

  let existing;
  try {
    existing = await pagbankFetch('/webhooks');
    const items = existing?.webhooks ?? existing?.data ?? [];
    if (items.length === 0) {
      console.log('No webhooks currently registered.');
    } else {
      console.log(`Existing webhooks (${items.length}):`);
      for (const w of items) {
        console.log(`  ${w.id ?? '—'}  ${w.url}  active=${w.active}`);
      }
    }
  } catch (err) {
    console.warn('Could not list webhooks (may not be supported):', err.message);
  }

  if (!apply) {
    console.log('\nDry run — rerun with --apply to register.');
    return;
  }

  console.log('\nRegistering webhook…');
  try {
    const result = await pagbankFetch('/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        url: WEBHOOK_URL,
        event_types: [{ name: 'CHARGE_*' }],
        security_type: 'OAUTH',
        active: true,
      }),
    });
    console.log('Registered:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Failed to register webhook:', err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
