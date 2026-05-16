import type {
  PagBankCharge,
  PagBankChargeRequest,
  PagBankEnvironment,
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
