import "server-only";

/**
 * PagBank Pagamentos Recorrentes (subscriptions) — the ClinAct subscription API.
 *
 * DELIBERATELY SEPARATE from lib/pagbank/api.ts. This is a different product on
 * a different host with its own credential, and the Revalida checkout that runs
 * in production must not be able to break because of anything in here.
 *
 *   Orders (live, Revalida)  api.pagseguro.com          PAGBANK_ACCESS_TOKEN
 *   Subscriptions (ClinAct)  api.assinaturas.pagseguro  PAGBANK_SUBSCRIPTIONS_TOKEN_*
 *
 * GOTCHA, found the hard way (2026-09-04): the assinaturas host sits behind a
 * stricter Cloudflare policy than api.pagseguro.com and REJECTS requests whose
 * User-Agent looks like a bot — Node's default included. It answers 403 with
 * Cloudflare error 1010 "browser_signature_banned", which reads exactly like an
 * auth failure and sends you hunting for a token problem. Hence the explicit
 * User-Agent below; do not remove it.
 *
 * Verified end to end in sandbox: plan → customer → card (tokenised by PagBank,
 * we never store a PAN) → subscription → invoice PAID → payment APPROVED →
 * cancel. Evidence: pagbank-homologacao-recorrencia.txt.
 */

const PROD = "https://api.assinaturas.pagseguro.com";
const SANDBOX = "https://sandbox.api.assinaturas.pagseguro.com";

/** Cloudflare on this host blocks default client user agents. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export type SubscriptionsEnv = "sandbox" | "production";

export function getSubscriptionsEnv(): SubscriptionsEnv {
  return process.env.PAGBANK_SUBSCRIPTIONS_ENVIRONMENT === "production" ? "production" : "sandbox";
}

function baseUrl(env: SubscriptionsEnv): string {
  return env === "production" ? PROD : SANDBOX;
}

function token(env: SubscriptionsEnv): string {
  return (
    (env === "production"
      ? process.env.PAGBANK_SUBSCRIPTIONS_TOKEN
      : process.env.PAGBANK_SUBSCRIPTIONS_TOKEN_SANDBOX) ?? ""
  );
}

export class PagBankSubscriptionsError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`PagBank subscriptions ${status}`);
    this.name = "PagBankSubscriptionsError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const env = getSubscriptionsEnv();
  const res = await fetch(`${baseUrl(env)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token(env)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new PagBankSubscriptionsError(res.status, parsed);
  return parsed as T;
}

// ── Shapes (only the fields we rely on) ──────────────────────────────────────

export type Money = { value: number; currency: "BRL" };

export type PagBankPlan = {
  id: string;
  reference_id: string;
  status: string;
  name: string;
  amount: Money;
  interval: { unit: "MONTH" | "YEAR"; length: number };
};

export type PagBankCustomer = {
  id: string;
  reference_id: string;
  email: string;
  name: string;
  billing_info?: { type: string; card: { token: string; brand: string; first_digits: string; last_digits: string } }[];
};

/** OVERDUE means the charge did not go through — never treat it as access. */
export type SubscriptionStatus = "ACTIVE" | "OVERDUE" | "SUSPENDED" | "CANCELED" | "PENDING";

export type PagBankSubscription = {
  id: string;
  reference_id: string;
  status: SubscriptionStatus;
  amount: Money;
  next_invoice_at?: string;
  plan: { id: string; name: string };
  customer: { id: string; email: string };
};

export type PagBankInvoice = { id: string; status: "PAID" | "OVERDUE" | "WAITING" | "CANCELED"; amount: Money; occurrence: number };
export type PagBankPayment = {
  id: string;
  status: "APPROVED" | "DENIED" | "IN_ANALYSIS" | "CANCELED";
  provider?: { code: string; message: string };
};

// ── Operations, in the order the flow uses them ──────────────────────────────

/** Creates (or rotates) the public key used to encrypt cards in the browser. */
export function createPublicKey(): Promise<{ public_key: string }> {
  return request("PUT", "/public-keys", { type: "card" });
}

export function createPlan(input: {
  reference_id: string;
  name: string;
  description?: string;
  amount_cents: number;
  interval: { unit: "MONTH" | "YEAR"; length: number };
}): Promise<PagBankPlan> {
  return request("POST", "/plans", {
    reference_id: input.reference_id,
    name: input.name,
    description: input.description,
    amount: { value: input.amount_cents, currency: "BRL" },
    interval: input.interval,
    trial: { enabled: false },
    payment_method: ["CREDIT_CARD"],
  });
}

export function listPlans(): Promise<{ plans: PagBankPlan[] }> {
  return request("GET", "/plans");
}

export function createCustomer(input: {
  reference_id: string;
  name: string;
  email: string;
  tax_id: string;
  phone?: { area: string; number: string };
  birth_date?: string;
}): Promise<PagBankCustomer> {
  return request("POST", "/customers", {
    reference_id: input.reference_id,
    name: input.name,
    email: input.email,
    tax_id: input.tax_id,
    phones: input.phone ? [{ country: "55", area: input.phone.area, number: input.phone.number, type: "MOBILE" }] : undefined,
    birth_date: input.birth_date,
  });
}

export function getCustomer(customerId: string): Promise<PagBankCustomer> {
  return request("GET", `/customers/${customerId}`);
}

/**
 * Registers the card ON THE CUSTOMER, which is what tokenises it. The
 * subscription then references the returned token — it cannot take a raw card.
 * NOTE the payload is a BARE ARRAY; wrapping it in an object returns
 * "invalid_payload_format", which is not an obvious error message.
 */
export function setCustomerCard(
  customerId: string,
  card: { number: string; exp_month: string; exp_year: string; security_code: string; holder_name: string },
): Promise<PagBankCustomer> {
  return request("PUT", `/customers/${customerId}/billing_info`, [
    {
      type: "CREDIT_CARD",
      card: {
        number: card.number,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        security_code: card.security_code,
        holder: { name: card.holder_name },
      },
    },
  ]);
}

/** The card is referenced by its token; the CVV is still required each time. */
export function createSubscription(input: {
  reference_id: string;
  plan_id: string;
  customer_id: string;
  card_token: string;
  security_code: string;
}): Promise<PagBankSubscription> {
  return request("POST", "/subscriptions", {
    reference_id: input.reference_id,
    plan: { id: input.plan_id },
    customer: { id: input.customer_id },
    payment_method: [{ type: "CREDIT_CARD", card: { id: input.card_token, security_code: input.security_code } }],
  });
}

export function getSubscription(subscriptionId: string): Promise<PagBankSubscription> {
  return request("GET", `/subscriptions/${subscriptionId}`);
}

export function listInvoices(subscriptionId: string): Promise<{ invoices: PagBankInvoice[] }> {
  return request("GET", `/subscriptions/${subscriptionId}/invoices`);
}

export function listPayments(invoiceId: string): Promise<{ payments: PagBankPayment[] }> {
  return request("GET", `/invoices/${invoiceId}/payments`);
}

/** Returns 204 with no body. */
export function cancelSubscription(subscriptionId: string): Promise<null> {
  return request("PUT", `/subscriptions/${subscriptionId}/cancel`);
}

/**
 * Whether this subscription should currently grant access.
 *
 * Creating a subscription does NOT mean it was paid: a declined first charge
 * comes back with the subscription ACTIVE=false — status OVERDUE — while still
 * returning 201. Access must follow the PAYMENT, never the creation call.
 */
export function grantsAccess(status: SubscriptionStatus): boolean {
  return status === "ACTIVE";
}
