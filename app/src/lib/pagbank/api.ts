import type {
  PagBankCharge,
  PagBankChargeRequest,
  PagBankEnvironment,
  PagBankFeesResponse,
  PagBankOrder,
  PagBankOrderRequest,
  InstallmentOption,
} from "./types";

function getBaseUrl(env: PagBankEnvironment): string {
  return env === "production"
    ? "https://api.pagseguro.com"
    : "https://sandbox.api.pagseguro.com";
}

function getAccessToken(env: PagBankEnvironment): string {
  if (env === "sandbox") {
    return process.env.PAGBANK_ACCESS_TOKEN_SANDBOX ?? "";
  }
  return process.env.PAGBANK_ACCESS_TOKEN ?? "";
}

export function getPagBankEnv(): PagBankEnvironment {
  return (process.env.PAGBANK_ENVIRONMENT as PagBankEnvironment) ?? "production";
}

export function getWebhookBaseUrl(): string {
  return process.env.PAGBANK_WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

async function pagbankFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const env = getPagBankEnv();
  const url = `${getBaseUrl(env)}${path}`;
  const token = getAccessToken(env);

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PagBank API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function createCharge(req: PagBankChargeRequest): Promise<PagBankCharge> {
  return pagbankFetch<PagBankCharge>("/charges", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getCharge(chargeId: string): Promise<PagBankCharge> {
  return pagbankFetch<PagBankCharge>(`/charges/${chargeId}`);
}

// Pix: create an order with a QR code. Returns the order (ORDE_…) carrying
// qr_codes[0].text + the QRCODE.PNG link. Once paid, the order's charges[] holds
// a PAID charge (surfaced via getOrder in the webhook / status poll).
export async function createPixOrder(req: PagBankOrderRequest): Promise<PagBankOrder> {
  return pagbankFetch<PagBankOrder>("/orders", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getOrder(orderId: string): Promise<PagBankOrder> {
  return pagbankFetch<PagBankOrder>(`/orders/${orderId}`);
}

// Mainstream brands all share an identical interest ladder; when no BIN is known
// we display one of these (first match wins) as the representative ladder.
const PREFERRED_BRANDS = ["visa", "mastercard", "elo", "amex", "hipercard", "diners"];

function selectBrandPlans(res: PagBankFeesResponse): InstallmentOption[] {
  const cc = res.payment_methods?.credit_card ?? {};
  const brands = Object.keys(cc);
  if (brands.length === 0) return [];

  // A valid BIN narrows the response to exactly one brand — respect it directly.
  // Otherwise prefer a mainstream brand, falling back to whichever offers the most
  // installments so we never under-report the available plans.
  let key = brands[0];
  if (brands.length > 1) {
    key =
      PREFERRED_BRANDS.find((b) => cc[b]) ??
      brands.reduce((a, b) =>
        (cc[b].installment_plans?.length ?? 0) > (cc[a].installment_plans?.length ?? 0) ? b : a,
      );
  }

  return (cc[key].installment_plans ?? [])
    .map((p) => ({
      installments: p.installments,
      installmentValue: p.installment_value,
      totalValue: p.amount.value,
      interestFree: p.interest_free,
    }))
    .sort((a, b) => a.installments - b.installments);
}

/**
 * Live installment ladder from PagBank with buyer-paid interest baked in.
 * `max_installments_no_interest=0` → only 1x (à vista) is interest-free; 2x+ carry
 * the buyer interest, matching the legacy WordPress checkout behavior.
 *
 * When `bin` (first 6 card digits) is supplied the ladder is brand-accurate. If
 * PagBank doesn't recognize the BIN it retries without it, so an unknown card still
 * gets the representative mainstream ladder rather than failing.
 */
export async function getInstallmentOptions(
  valueCents: number,
  opts: { maxInstallments?: number; bin?: string } = {},
): Promise<InstallmentOption[]> {
  const max = opts.maxInstallments ?? 12;

  const build = (bin?: string) => {
    const qs = new URLSearchParams({
      payment_methods: "CREDIT_CARD",
      value: String(valueCents),
      max_installments: String(max),
      max_installments_no_interest: "0",
    });
    if (bin) qs.set("credit_card_bin", bin);
    return `/charges/fees/calculate?${qs.toString()}`;
  };

  const bin = opts.bin?.replace(/\D/g, "").slice(0, 6) || undefined;

  try {
    const res = await pagbankFetch<PagBankFeesResponse>(build(bin));
    return selectBrandPlans(res);
  } catch (err) {
    // Unknown BIN → retry without it for the default mainstream ladder.
    if (bin && err instanceof Error && err.message.includes("credit_card_bin_data_not_found")) {
      const res = await pagbankFetch<PagBankFeesResponse>(build());
      return selectBrandPlans(res);
    }
    throw err;
  }
}
