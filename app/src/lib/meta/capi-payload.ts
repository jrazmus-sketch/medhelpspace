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

// ── Browser-event mirror (PageView / InitiateCheckout) ──────────────────────
// The Pixel's own request can carry no Test Events code, so in test mode it may
// never show up in Events Manager; and an ad blocker drops it entirely. Each
// browser event is therefore ALSO sent by the server with the SAME event_id —
// Meta keeps one (its documented Pixel + CAPI deduplication).

export const MIRROR_EVENTS = ["PageView", "InitiateCheckout"] as const;
export type MirrorEvent = (typeof MIRROR_EVENTS)[number];

export function isMirrorEvent(v: unknown): v is MirrorEvent {
  return typeof v === "string" && (MIRROR_EVENTS as readonly string[]).includes(v);
}

/** Browser-generated ids: letters, digits, dash. Never trusted beyond that. */
export function isValidEventId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);
}

/**
 * Only the InitiateCheckout fields the browser legitimately sends, with their
 * types checked: the browser is untrusted, so nothing else reaches Meta.
 */
export function sanitizeMirrorCustomData(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const str = (k: string, max = 80) => {
    const v = r[k];
    if (typeof v === "string" && v.length > 0 && v.length <= max && !v.includes("@")) out[k] = v;
  };
  if (r.currency === "BRL") out.currency = "BRL";
  if (typeof r.value === "number" && Number.isFinite(r.value) && r.value >= 0 && r.value < 100000) out.value = r.value;
  if (Array.isArray(r.content_ids)) {
    const ids = r.content_ids.filter((x) => typeof x === "string" && /^[a-z0-9_-]{1,60}$/.test(x)).slice(0, 3);
    if (ids.length) out.content_ids = ids;
  }
  if (r.num_items === 1) out.num_items = 1;
  str("content_type", 20);
  str("content_name");
  if (r.product === "revalida" || r.product === "clinact") out.product = r.product;
  if (r.plan === "monthly" || r.plan === "annual") out.plan = r.plan;
  if (typeof r.turma === "string" && /^[a-z0-9-]{1,40}$/.test(r.turma)) out.turma = r.turma;
  return out;
}

export function buildMirrorPayload(input: {
  eventName: MirrorEvent;
  eventId: string;
  userId: string | null;
  context: MetaContext;
  customData: Record<string, unknown>;
  eventTime: number;
}) {
  const { context } = input;
  const user_data: Record<string, unknown> = {};
  if (input.userId) user_data.external_id = [sha256(input.userId)];
  if (context.fbp) user_data.fbp = context.fbp;
  if (context.fbc) user_data.fbc = context.fbc;
  if (context.ip) user_data.client_ip_address = context.ip;
  if (context.ua) user_data.client_user_agent = context.ua;
  return {
    data: [
      {
        event_name: input.eventName,
        event_time: input.eventTime,
        event_id: input.eventId,
        action_source: "website",
        ...(context.url ? { event_source_url: context.url } : {}),
        user_data,
        ...(input.eventName === "PageView" ? {} : { custom_data: input.customData }),
      },
    ],
    ...(context.test_event_code ? { test_event_code: context.test_event_code } : {}),
  };
}

/**
 * The ONLY product fields a Purchase may carry besides value / currency (Karina
 * 2026-11-09): which product, which turma or plan. No order number, no payment
 * method — a field added by a caller later is dropped here, not sent.
 */
export const PURCHASE_CUSTOM_FIELDS = ["content_ids", "content_name", "product", "plan", "turma"] as const;

function pickPurchaseFields(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PURCHASE_CUSTOM_FIELDS) if (raw[k] !== undefined) out[k] = raw[k];
  return out;
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
          ...pickPurchaseFields(input.customData),
        },
      },
    ],
    ...(context.test_event_code ? { test_event_code: context.test_event_code } : {}),
  };
}

