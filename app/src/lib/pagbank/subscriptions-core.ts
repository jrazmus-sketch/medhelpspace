/**
 * The parts of the subscriptions client that are pure: the error type, the
 * idempotency helpers, and the access rule.
 *
 * Separate from subscriptions.ts ON PURPOSE, and for the same reason
 * library-filters.ts is separate from library.ts: subscriptions.ts declares
 * `server-only`, which cannot be imported by the test runner. Rules this
 * important — when a replayed request is safe, and what grants a student access
 * — must be testable, so they live here and are re-exported from there.
 *
 * Nothing in this file performs I/O or reads a credential.
 */

export class PagBankSubscriptionsError extends Error {
  readonly status: number;
  readonly body: unknown;

  // Fields assigned explicitly rather than via TS parameter properties: the
  // test runner strips types instead of compiling them and cannot parse those.
  //
  // The RESPONSE body only. The request body is never attached: on
  // POST /subscriptions it holds the card's security code.
  constructor(status: number, body: unknown) {
    super(`PagBank subscriptions ${status}`);
    this.name = "PagBankSubscriptionsError";
    this.status = status;
    this.body = body;
  }
}

/**
 * A replayed idempotency key answers 409 `idempotency_key_in_use` /
 * `idempotency_key_validation` — it does NOT return the original record. So a
 * caller that retries after a timeout must treat this as "the first attempt
 * went through" and go look the resource up by its reference_id, never as a
 * failure to create.
 */
export function isIdempotencyConflict(error: unknown): boolean {
  if (!(error instanceof PagBankSubscriptionsError) || error.status !== 409) return false;
  const messages = (error.body as { error_messages?: { error?: string; description?: string }[] })?.error_messages;
  return (messages ?? []).some(
    (m) => /idempot/i.test(m.error ?? "") || /idempot/i.test(m.description ?? ""),
  );
}

/** Alphanumeric only, max 200 chars, valid for 48h. Never reuse across payloads. */
export function idempotencyKey(...parts: (string | number)[]): string {
  return parts
    .join("")
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 200);
}

/**
 * Only ACTIVE grants access. OVERDUE means a charge failed and retries are
 * pending; PENDING_ACTION means the retries are exhausted and the subscriber
 * must register a new card; SUSPENDED is the configured end state when
 * `finally: "SUSPEND"` is set (see setRetrySettings).
 */
export type SubscriptionStatus =
  | "ACTIVE"
  | "OVERDUE"
  | "PENDING_ACTION"
  | "SUSPENDED"
  | "CANCELED"
  | "PENDING"
  | "TRIAL";

/**
 * Whether this subscription should currently grant access.
 *
 * Creating a subscription does NOT mean it was paid: a declined first charge
 * still returns 201, with the subscription in status OVERDUE. Access must
 * follow the PAYMENT, never the creation call.
 *
 * NOTE for the recovery path: after a successful retry the INVOICE is PAID
 * minutes before the subscription flips to ACTIVE (observed in sandbox:
 * ~90s vs ~3min). Access should follow the paid invoice, not this status
 * alone, or a student who just fixed their card waits for no reason.
 */
export function grantsAccess(status: SubscriptionStatus): boolean {
  return status === "ACTIVE";
}

/**
 * What a 409 idempotency conflict turned out to mean.
 *
 * Karina's condition for production (2026-09-18), and it is the right one: if
 * PagBank creates the subscription but our request times out before the 201
 * arrives, the retry with the SAME key answers 409 — it does not return the
 * original record. That 409 must never be shown to a student as a failed
 * payment, and must never be answered by retrying with a NEW key, because a new
 * key is a new request: it creates a SECOND subscription and charges again
 * (verified in sandbox — two paid R$ 299,00 invoices).
 *
 * So the 409 sends us looking for what already exists, and this decides what we
 * found. Access follows the PAID INVOICE rather than the subscription's status:
 * after a recovered charge the invoice reads PAID minutes before the
 * subscription flips to ACTIVE, and a student who just fixed their card should
 * not wait out that gap.
 */
export type ReconciliationOutcome =
  /** It exists and it is paid — grant access. */
  | { kind: "paid"; subscriptionId: string }
  /** It exists but nothing is paid yet — say "aguardando confirmação", never "falhou". */
  | { kind: "pending"; subscriptionId: string; status: SubscriptionStatus }
  /** Nothing was created. Only here is a fresh key safe. */
  | { kind: "absent" };

export function reconcileOutcome(
  subscription: { id: string; status: SubscriptionStatus } | null,
  invoices: { status: string }[],
): ReconciliationOutcome {
  if (!subscription) return { kind: "absent" };
  if (invoices.some((i) => i.status === "PAID")) {
    return { kind: "paid", subscriptionId: subscription.id };
  }
  return { kind: "pending", subscriptionId: subscription.id, status: subscription.status };
}

/**
 * A new idempotency key means a new charge. It is only ever safe when the first
 * attempt left nothing behind.
 */
export function canRetryWithNewKey(outcome: ReconciliationOutcome): boolean {
  return outcome.kind === "absent";
}

/**
 * Whether a subscription's current state should EXTEND access, and until when.
 *
 * The renewal problem this solves: PagBank charges month two on its own, and
 * nothing tells us in a way we can rely on. There is no payment-level webhook —
 * observed in sandbox, a charge produces no "paid" event, and a recovered one
 * arrives as a second subscription.initial. So access is extended by reading
 * the subscription and its invoices back, and deciding here.
 *
 * THE RULES, each for a reason:
 *
 *  - Only the LATEST invoice counts. An old paid invoice says nothing about
 *    this month; extending on it would hand out a free period whenever the
 *    renewal failed.
 *  - A cancelled or expired subscription is never extended. The student keeps
 *    what they already paid for (paid_until only moves forward, so nothing
 *    here can take it away) and simply is not given more.
 *  - The new horizon is PagBank's own next_invoice_at, not now + a month. If we
 *    computed it ourselves, a late run would push access past the next charge
 *    date and grant days nobody paid for.
 */
export type RenewalDecision =
  | { action: "extend"; until: string }
  | { action: "hold"; reason: "ended" | "unpaid" | "no-next-invoice" };

export function renewalDecision(
  subscription: { status: string; next_invoice_at?: string | null },
  invoices: { status: string; occurrence?: number | null }[],
): RenewalDecision {
  if (subscription.status === "CANCELED" || subscription.status === "EXPIRED") {
    return { action: "hold", reason: "ended" };
  }

  const latest = [...invoices].sort((a, b) => (b.occurrence ?? 0) - (a.occurrence ?? 0))[0];
  if (!latest || latest.status !== "PAID") return { action: "hold", reason: "unpaid" };

  if (!subscription.next_invoice_at) return { action: "hold", reason: "no-next-invoice" };
  // PagBank sends a bare date (YYYY-MM-DD). Noon in Brasília keeps it on the
  // right calendar day whichever timezone reads it later.
  const until = new Date(`${subscription.next_invoice_at}T12:00:00-03:00`);
  if (Number.isNaN(until.getTime())) return { action: "hold", reason: "no-next-invoice" };
  return { action: "extend", until: until.toISOString() };
}
