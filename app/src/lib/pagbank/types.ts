// PagBank Connect API types
// API: https://developer.pagseguro.com.br/reference/

export type PagBankEnvironment = "production" | "sandbox";

export interface PagBankAmount {
  value: number;    // in centavos (R$3.990 = 399000)
  currency: string; // "BRL"
}

export interface PagBankQrCode {
  id: string;       // QRCO_xxx
  text: string;     // EMV copy-paste pix string
  amount: PagBankAmount;
  expiration_date: string; // ISO 8601
  links: Array<{ rel: string; href: string; media?: string; type?: string }>;
}

export interface PagBankCard {
  encrypted: string;
  security_code?: string;
  holder: { name: string; tax_id?: string };
  store?: boolean;
}

export interface PagBankPaymentMethod {
  type: "PIX" | "CREDIT_CARD";
  installments?: number;
  capture?: boolean;
  card?: PagBankCard;
}

// Customer billing address — sent to PagBank for richer nota-fiscal data.
export interface PagBankAddress {
  street?: string;
  number?: string;
  complement?: string;
  locality?: string;   // bairro / neighborhood
  city?: string;
  region_code?: string; // UF, e.g. "BA"
  country?: string;     // "BRA"
  postal_code?: string; // CEP, digits only
}

export interface PagBankCustomer {
  name?: string;
  email?: string;
  tax_id?: string;            // CPF
  phones?: Array<{ country: string; area: string; number: string; type?: string }>;
  address?: PagBankAddress;
}

export interface PagBankChargeRequest {
  reference_id: string;        // our order UUID
  description: string;
  amount: PagBankAmount;
  payment_method: PagBankPaymentMethod;
  notification_urls: string[];
  customer?: PagBankCustomer;
}

// --- Orders API (Pix) ---
// PagBank does NOT accept PIX via /charges; it returns
//   400 invalid_parameter payment_method.pix.
// PIX QR codes are minted through POST /orders with a qr_codes[] array. The
// Orders API requires a customer with name + email + tax_id (CPF).
export interface PagBankOrderRequest {
  reference_id: string;        // our order UUID
  customer: PagBankCustomer;   // required for Pix orders
  items: Array<{ name: string; quantity: number; unit_amount: number }>;
  qr_codes: Array<{ amount: PagBankAmount; expiration_date?: string }>;
  notification_urls: string[];
}

export interface PagBankOrder {
  id: string;                  // ORDE_xxx
  reference_id: string;
  created_at?: string;
  customer?: PagBankCustomer;
  qr_codes?: PagBankQrCode[];
  charges?: PagBankCharge[];   // populated once the buyer pays the QR
  links?: PagBankChargeLink[];
}

export interface PagBankChargeLink {
  rel: string;
  href: string;
  media?: string;
  type?: string;
}

export interface PagBankCharge {
  id: string;                  // CHAR_xxx
  reference_id: string;        // our order UUID
  status: PagBankChargeStatus;
  description: string;
  amount: PagBankAmount;
  payment_method?: PagBankPaymentMethod & {
    card?: { brand?: string; first_digits?: string; last_digits?: string };
  };
  qr_codes?: PagBankQrCode[];
  links?: PagBankChargeLink[];
  created_at?: string;
  paid_at?: string;
}

export type PagBankChargeStatus =
  | "WAITING"      // pending — Pix not yet paid
  | "IN_ANALYSIS"  // CC under review
  | "PAID"         // confirmed
  | "AUTHORIZED"   // CC authorized but not captured
  | "DECLINED"     // CC declined
  | "CANCELED"     // cancelled
  | "REFUNDED"     // refunded
  | "CHARGEBACK";  // chargeback

export interface PagBankWebhookPayload {
  id: string;
  reference_id: string;
  status: PagBankChargeStatus;
  amount: PagBankAmount;
  paid_at?: string;
}

// --- Installment fee simulation (/charges/fees/calculate) ---
// Raw shape returned by PagBank: payment_methods.credit_card.<brand>.installment_plans[]
export interface PagBankInstallmentPlan {
  installments: number;
  installment_value: number; // centavos per installment
  interest_free: boolean;
  amount: {
    value: number; // centavos, interest-inclusive total
    currency?: string;
    fees?: { buyer?: { interest?: { total: number; installments: number } } };
  };
}

export interface PagBankFeesResponse {
  payment_methods: {
    credit_card: Record<string, { installment_plans: PagBankInstallmentPlan[] }>;
  };
}

// Normalized option consumed by the app (UI + charge route).
export interface InstallmentOption {
  installments: number;
  installmentValue: number; // centavos per installment
  totalValue: number;       // centavos, interest-inclusive total (what we charge)
  interestFree: boolean;
}
