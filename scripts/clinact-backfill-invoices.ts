/**
 * Backfills `clinact_invoices` (schema-patch-nfse-national-v2.sql) for ClinAct
 * subscriptions paid BEFORE invoices were recorded — i.e. before 2026-10-27.
 * From then on the checkout, the renewal cron and the webhook write each paid
 * invoice themselves; but the cron skips ended subscriptions, so a subscription
 * already cancelled would never get its rows without this.
 *
 * READ-ONLY towards PagBank: two GETs per subscription (its invoices, and the
 * customer — to fill the cardholder snapshot that the old checkout did not keep).
 * Writes only rows that do not exist yet (ON CONFLICT DO NOTHING) and only fills
 * an EMPTY clinact_subscriptions.billing_* — nothing recorded is overwritten.
 *
 * Run (from the repo root) — dry run by default:
 *   node --env-file=app/.env.local --import ./app/tests/helpers/alias-hook.mjs \
 *     scripts/clinact-backfill-invoices.ts <DATABASE_URL> [--apply]
 *
 * Only rows of the environment PAGBANK_SUBSCRIPTIONS_ENVIRONMENT names are read,
 * with that environment's token.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { referencePeriod } from "@/lib/clinact/invoice-period";

const require = createRequire(import.meta.url);
const postgres = require(path.resolve("node_modules/postgres"));

const url = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!url || url.startsWith("--")) {
  console.error("usage: … clinact-backfill-invoices.ts <DATABASE_URL> [--apply]");
  process.exit(1);
}

const ENV = process.env.PAGBANK_SUBSCRIPTIONS_ENVIRONMENT === "production" ? "production" : "sandbox";
const BASE = ENV === "production"
  ? "https://api.assinaturas.pagseguro.com"
  : "https://sandbox.api.assinaturas.pagseguro.com";
const TOKEN = (ENV === "production"
  ? process.env.PAGBANK_SUBSCRIPTIONS_TOKEN
  : process.env.PAGBANK_SUBSCRIPTIONS_TOKEN_SANDBOX) ?? "";
// The assinaturas host 403s (Cloudflare 1010) a bot-looking User-Agent.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function get<T>(p: string): Promise<T> {
  const res = await fetch(`${BASE}${p}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`GET ${p} → ${res.status}`);
  return (await res.json()) as T;
}

type Invoice = {
  id: string;
  status: string;
  occurrence?: number;
  amount?: { value: number };
  created_at?: string;
  updated_at?: string;
};
type Customer = { name?: string; tax_id?: string; phones?: { area?: string; number?: string }[] };

const mask = (v: string | null | undefined) => (v ? `${v.slice(0, 3)}…(${v.length})` : "—");

const sql = postgres(url, { max: 1 });
try {
  if (!TOKEN) throw new Error(`no token for ${ENV}`);
  const subs = await sql`
    select user_id, pagbank_subscription_id, pagbank_customer_id, plan_key,
           billing_name, billing_tax_id, billing_phone
      from clinact_subscriptions
     where pagbank_subscription_id is not null and environment = ${ENV}`;
  console.log(`${subs.length} ${ENV} subscription(s) · ${APPLY ? "APPLY" : "dry run"}`);

  for (const s of subs) {
    const { invoices } = await get<{ invoices: Invoice[] }>(`/subscriptions/${s.pagbank_subscription_id}/invoices`);
    const paid = (invoices ?? []).filter((i) => i.status === "PAID");

    let billing = { name: s.billing_name, taxId: s.billing_tax_id, phone: s.billing_phone };
    if (!billing.name || !billing.taxId) {
      const c = s.pagbank_customer_id ? await get<Customer>(`/customers/${s.pagbank_customer_id}`) : {};
      const ph = c.phones?.[0];
      billing = {
        name: billing.name ?? c.name ?? null,
        taxId: billing.taxId ?? c.tax_id ?? null,
        phone: billing.phone ?? (ph ? `${ph.area ?? ""}${ph.number ?? ""}` : null),
      };
    }
    console.log(`  ${s.pagbank_subscription_id} (${s.plan_key}) · ${paid.length} paid · tomador ${mask(billing.name)} / ${mask(billing.taxId)}`);

    for (const inv of paid) {
      const billedAt = inv.created_at ?? inv.updated_at!;
      const period = referencePeriod(billedAt, s.plan_key);
      console.log(`    ${inv.id} #${inv.occurrence} R$ ${((inv.amount?.value ?? 0) / 100).toFixed(2)} · paid ${inv.updated_at} · ${period.start} → ${period.end}`);
      if (!APPLY) continue;
      await sql`
        insert into clinact_invoices
          (id, user_id, subscription_id, plan_key, occurrence, amount_cents, billed_at, paid_at,
           period_start, period_end, environment, billing_name, billing_tax_id, billing_phone)
        values (${inv.id}, ${s.user_id}, ${s.pagbank_subscription_id}, ${s.plan_key}, ${inv.occurrence ?? 1},
                ${inv.amount?.value ?? 0}, ${billedAt}, ${inv.updated_at ?? billedAt},
                ${period.start}, ${period.end}, ${ENV}, ${billing.name}, ${billing.taxId}, ${billing.phone})
        on conflict (id) do nothing`;
    }
    if (APPLY) {
      await sql`
        update clinact_subscriptions
           set billing_name   = coalesce(billing_name, ${billing.name}),
               billing_tax_id = coalesce(billing_tax_id, ${billing.taxId}),
               billing_phone  = coalesce(billing_phone, ${billing.phone})
         where user_id = ${s.user_id}`;
    }
  }
} finally {
  await sql.end();
}
