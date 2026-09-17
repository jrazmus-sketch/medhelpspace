import "server-only";

// The pure half lives in subscriptions-core.ts so it can be tested: this
// module is server-only, which the test runner cannot import.
import { PagBankSubscriptionsError, type SubscriptionStatus } from "./subscriptions-core";

export {
  PagBankSubscriptionsError,
  isIdempotencyConflict,
  idempotencyKey,
  grantsAccess,
} from "./subscriptions-core";
export type { SubscriptionStatus } from "./subscriptions-core";

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
 * CARDS ARE ENCRYPTED IN THE BROWSER — we hold no PCI certification, so the card
 * number must never reach our server. Same `PagSeguro.encryptCard` SDK as the
 * Revalida checkout (app/checkout/card-form.tsx), but with THIS API's public key
 * (getPublicKey below): the Orders key is a different key. The encrypted blob
 * goes on the customer, PagBank tokenises it, and the subscription references
 * the token.
 *
 * ONE PLAINTEXT FIELD, and it is PagBank's rule, not ours: POST /subscriptions
 * refuses every shape without `security_code` — card token, `encrypted`, inline
 * customer — even though the CVV is already inside the encrypted blob. So the
 * CVV passes through our server exactly once, for that call. Never store it,
 * never log it, never put it in an error message. `PagBankSubscriptionsError`
 * deliberately carries only the status and the RESPONSE body; the request body
 * (which holds the CVV) is never attached to an error or logged anywhere.
 *
 * Verified end to end in sandbox with browser-encrypted cards (2026-09-15/17):
 * plan → customer + encrypted card → subscription → invoice PAID → payment
 * APPROVED → cancel; declined card → OVERDUE → card change → cancel; and the
 * annual plan (R$ 299,00) end to end. Evidence: pagbank-homologacao-recorrencia.txt.
 */

const PROD = "https://api.assinaturas.pagseguro.com";
const SANDBOX = "https://sandbox.api.assinaturas.pagseguro.com";

/** Cloudflare on this host blocks default client user agents. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/**
 * The idempotency header, and it is case-SENSITIVE: only the all-lowercase
 * spelling is accepted. Any other casing is answered with 400 "The idempotency
 * key format is incorrect. It must not contain special characters." — a message
 * about the VALUE, for a problem with the NAME (verified in sandbox 2026-09-17,
 * where Node's http client capitalised it to `X-idempotency-key` and every
 * perfectly alphanumeric key was refused).
 */
const IDEMPOTENCY_HEADER = "x-idempotency-key";

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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  idempotency?: string,
): Promise<T> {
  const env = getSubscriptionsEnv();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token(env)}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
  if (idempotency) headers[IDEMPOTENCY_HEADER] = idempotency;

  const res = await fetch(`${baseUrl(env)}${path}`, {
    method,
    headers,
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

export type PagBankCard = { token: string; brand: string; first_digits: string; last_digits: string };

export type PagBankCustomer = {
  id: string;
  reference_id: string;
  email: string;
  name: string;
  billing_info?: { type: string; card: PagBankCard }[];
};

export type PagBankSubscription = {
  id: string;
  reference_id: string;
  status: SubscriptionStatus;
  amount: Money;
  next_invoice_at?: string;
  plan: { id: string; name: string };
  customer: { id: string; email: string };
  /** Present once a charge has failed: the scheduled automatic retries. */
  retries?: { attempt: string; retried_at: string; status: string }[];
};

export type PagBankInvoice = { id: string; status: "PAID" | "OVERDUE" | "WAITING" | "CANCELED"; amount: Money; occurrence: number };
export type PagBankPayment = {
  id: string;
  status: "APPROVED" | "DENIED" | "IN_ANALYSIS" | "CANCELED";
  provider?: { code: string; message: string };
};

/** Every subscription webhook event PagBank documents. */
export const SUBSCRIPTION_WEBHOOK_EVENTS = [
  "subscription.initial",
  "subscription.updated",
  "subscription.activated",
  "subscription.suspended",
  "subscription.recurrence",
  "subscription.expired",
  "subscription.canceled",
  "subscription.migrated",
] as const;
export type SubscriptionWebhookEvent = (typeof SUBSCRIPTION_WEBHOOK_EVENTS)[number];

export type SubscriptionWebhookPayload = {
  env?: string;
  event: SubscriptionWebhookEvent;
  resource: PagBankSubscription;
};

// ── Operations, in the order the flow uses them ──────────────────────────────

/** The public key the browser encrypts cards with. Read-only — prefer this. */
export function getPublicKey(): Promise<{ public_key: string }> {
  return request("GET", "/public-keys");
}

/**
 * Creates the public key, or ROTATES it. After a rotation every card encrypted
 * with the old key is refused, including a checkout form already open in a
 * student's browser — so this is an operator action, never a request path.
 */
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

/**
 * Creates the subscriber. Pass the browser-encrypted card and PagBank tokenises
 * it in the same call; the token comes back on `billing_info[0].card.token`.
 * A second customer with the same `tax_id` is refused with 409.
 */
export function createCustomer(input: {
  reference_id: string;
  name: string;
  email: string;
  tax_id: string;
  phone?: { area: string; number: string };
  birth_date?: string;
  encrypted_card?: string;
  idempotency_key?: string;
}): Promise<PagBankCustomer> {
  return request(
    "POST",
    "/customers",
    {
      reference_id: input.reference_id,
      name: input.name,
      email: input.email,
      tax_id: input.tax_id,
      phones: input.phone ? [{ country: "55", area: input.phone.area, number: input.phone.number, type: "MOBILE" }] : undefined,
      birth_date: input.birth_date,
      billing_info: input.encrypted_card
        ? [{ type: "CREDIT_CARD", card: { encrypted: input.encrypted_card } }]
        : undefined,
    },
    input.idempotency_key,
  );
}

export function getCustomer(customerId: string): Promise<PagBankCustomer> {
  return request("GET", `/customers/${customerId}`);
}

/**
 * Replaces the subscriber's card with a new browser-encrypted one. The token
 * changes, so read it from the response, and an existing subscription moves to
 * the new card.
 * NOTE the payload is a BARE ARRAY; wrapping it in an object returns
 * "invalid_payload_format", which is not an obvious error message.
 */
export function setCustomerCard(customerId: string, encryptedCard: string): Promise<PagBankCustomer> {
  return request("PUT", `/customers/${customerId}/billing_info`, [
    { type: "CREDIT_CARD", card: { encrypted: encryptedCard } },
  ]);
}

/** The card token on a customer, if one is registered. */
export function customerCardToken(customer: PagBankCustomer): string | null {
  return customer.billing_info?.find((b) => b.type === "CREDIT_CARD")?.card.token ?? null;
}

/**
 * The card is referenced by its token; PagBank still demands the CVV in plain
 * text on this call (see the header). Pass it straight through — do not keep it.
 *
 * ALWAYS pass an idempotency_key. PagBank does NOT deduplicate on reference_id:
 * posting the same body twice creates a SECOND subscription and charges it
 * again (verified in sandbox 2026-09-17, two paid R$ 299,00 invoices). The key
 * is the only thing that makes a retried request safe.
 */
export function createSubscription(input: {
  reference_id: string;
  plan_id: string;
  customer_id: string;
  card_token: string;
  security_code: string;
  idempotency_key?: string;
}): Promise<PagBankSubscription> {
  return request(
    "POST",
    "/subscriptions",
    {
      reference_id: input.reference_id,
      plan: { id: input.plan_id },
      customer: { id: input.customer_id },
      payment_method: [{ type: "CREDIT_CARD", card: { id: input.card_token, security_code: input.security_code } }],
    },
    input.idempotency_key,
  );
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

export function suspendSubscription(subscriptionId: string): Promise<null> {
  return request("PUT", `/subscriptions/${subscriptionId}/suspend`);
}

export function activateSubscription(subscriptionId: string): Promise<null> {
  return request("PUT", `/subscriptions/${subscriptionId}/activate`);
}

/**
 * Charges the open invoice again, for a subscription in OVERDUE or
 * PENDING_ACTION — the recovery path after the subscriber registers a new card.
 * PagBank allows ONE manual retry per subscription per day.
 */
export function retrySubscriptionCharge(subscriptionId: string, idempotencyKeyValue?: string): Promise<null> {
  return request("PUT", `/subscriptions/${subscriptionId}/retry`, undefined, idempotencyKeyValue);
}

// ── Account-wide preferences (retries and webhooks) ──────────────────────────

/**
 * ACCOUNT-WIDE, not per subscription: one retry policy for every subscription
 * on the credential. Intervals are in days and only 1, 3, 5 and 7 are accepted.
 * `finally` is what happens when the last retry fails — CANCEL (PagBank's
 * default when unset) or SUSPEND, which keeps the subscription so a new card
 * plus retrySubscriptionCharge can recover it.
 */
export type RetrySettings = {
  first_try: number;
  second_try: number;
  third_try: number;
  finally: "SUSPEND" | "CANCEL";
};

export function getRetrySettings(): Promise<RetrySettings> {
  return request("GET", "/preferences/retries");
}

/** The API wants the intervals as STRINGS, though it reads them back as numbers. */
export function setRetrySettings(settings: RetrySettings): Promise<null> {
  return request("PUT", "/preferences/retries", {
    first_try: String(settings.first_try),
    second_try: String(settings.second_try),
    third_try: String(settings.third_try),
    finally: settings.finally,
  });
}

export type NotificationPreferences = {
  /** PagBank notifies ONLY the last URL in this array. */
  urls?: string[];
  email?: { merchant?: { enabled: boolean }; customer?: { enabled: boolean } };
};

export function getNotificationPreferences(): Promise<NotificationPreferences> {
  return request("GET", "/preferences/notifications");
}

/**
 * Registers the webhook URL — ACCOUNT-WIDE and for ALL subscription events;
 * there is no per-event subscription. Only the last URL receives notifications,
 * so writing this replaces the previous endpoint.
 */
export function setNotificationPreferences(prefs: NotificationPreferences): Promise<null> {
  return request("PUT", "/preferences/notifications", prefs);
}
