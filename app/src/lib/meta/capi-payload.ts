// Pure half of the Meta Conversions API (no server-only, no I/O) so it can be
// unit-tested. lib/meta/capi.ts does the sending.

import { createHash } from "node:crypto";

export type MetaContext = {
  v: 1;
  fbp: string | null;
  fbc: string | null;
  ip: string | null;
  ua: string | null;
  /** Checkout page, origin + path only (no query string). */
  url: string | null;
  test_event_code: string | null;
  captured_at: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Brazilian phone → digits with country code, as Meta wants before hashing. */
export function normalizePhoneBR(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

export function asContext(value: unknown): MetaContext | null {
  if (!value || typeof value !== "object") return null;
  const c = value as MetaContext;
  return c.v === 1 ? c : null;
}

export function buildPurchasePayload(input: {
  eventId: string;
  valueCents: number;
  userId: string;
  email: string | null;
  phone: string | null;
  context: MetaContext;
  customData: Record<string, unknown>;
  eventTime: number;
}) {
  const { context } = input;
  const email = input.email?.trim().toLowerCase() || null;
  const phone = normalizePhoneBR(input.phone);
  const user_data: Record<string, unknown> = {
    external_id: [sha256(input.userId)],
    country: [sha256("br")],
  };
  if (email) user_data.em = [sha256(email)];
  if (phone) user_data.ph = [sha256(phone)];
  if (context.fbp) user_data.fbp = context.fbp;
  if (context.fbc) user_data.fbc = context.fbc;
  if (context.ip) user_data.client_ip_address = context.ip;
  if (context.ua) user_data.client_user_agent = context.ua;

  return {
    data: [
      {
        event_name: "Purchase",
        event_time: input.eventTime,
        event_id: input.eventId,
        action_source: "website",
        ...(context.url ? { event_source_url: context.url } : {}),
        user_data,
        custom_data: {
          currency: "BRL",
          value: Math.round(input.valueCents) / 100,
          content_type: "product",
          num_items: 1,
          ...input.customData,
        },
      },
    ],
    ...(context.test_event_code ? { test_event_code: context.test_event_code } : {}),
  };
}

