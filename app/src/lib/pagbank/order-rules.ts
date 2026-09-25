// Pure order-state rules shared by checkout, finalize and refund. No server
// imports, so the tests exercise exactly what the routes run.

/**
 * Statuses a PAID settlement may move an order out of.
 *
 * `cancelled` stays in on purpose: we cancel a Pix order in OUR database when it
 * expires or is superseded, but PagBank may still settle its QR — the buyer paid,
 * so the payment must be honoured. `refunded` is the one that must never come
 * back: a late or replayed PAID notification for an order we already refunded
 * would otherwise re-grant access the money no longer backs.
 */
export const FINALIZABLE_STATUSES = ["pending", "cancelled", "declined"] as const;

export function isFinalizable(status: string | null | undefined): boolean {
  return (FINALIZABLE_STATUSES as readonly string[]).includes(status ?? "");
}

/**
 * A 100%-coupon order never touched PagBank: finalize records a synthetic
 * `COUPON_<coupon>_<order>` charge at R$ 0. Refunding it is revoking access —
 * there is no charge to cancel, and calling PagBank with that id only fails.
 */
export function isSyntheticCouponCharge(chargeId: string | null | undefined, amountCents: number | null | undefined): boolean {
  return (typeof chargeId === "string" && chargeId.startsWith("COUPON_")) || amountCents === 0;
}

/**
 * Shown when a buyer asks for a card charge while a Pix QR for the same turma
 * can still be paid. We cannot void a QR at PagBank, so letting the card through
 * would leave the buyer one scan away from paying twice.
 */
export function livePixBlocksCardMessage(pixExpiresAtIso: string): string {
  const at = new Date(pixExpiresAtIso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    `Você já gerou um Pix para esta turma, e ele ainda pode ser pago até as ${at}. ` +
    "Se já pagou, aguarde a confirmação. Para pagar com cartão, espere esse Pix expirar — " +
    "assim não existe risco de pagar duas vezes."
  );
}
