// First-touch attribution for the lead funnels (Karina, 2026-09-27, "Lead").
//
// The problem it solves: a visitor clicks a Google ad on Monday, lands on the
// homepage, leaves, and comes back on Wednesday through a homepage CTA such as
// "/questoes-revalida?utm_source=site&utm_medium=hero". By the time they type an
// e-mail, the URL carries the INTERNAL utm and no gclid, and document.referrer is
// our own site — so the lead row says "site / homepage" and the ad click is lost.
//
// So the FIRST landing on the site is remembered in a small first-party cookie
// (no personal data: utm tags, gclid, the external referrer, the landing path and
// a timestamp), and every lead-creating action prefers it over what the funnel
// page sees at submit time. First touch wins; nothing here ever overwrites a value
// a lead row already holds (the actions only fill still-null columns).
//
// Pure module — no next/headers, no DOM — so both the client component and the
// server actions can import it and the rules can be unit-tested.

export const FIRST_TOUCH_COOKIE = "mhs_ft";
export const FIRST_TOUCH_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days, Google's own click window

// Short keys: the whole cookie must stay far under the 4 KB limit.
export type FirstTouch = {
  s?: string; // utm_source
  m?: string; // utm_medium
  c?: string; // utm_campaign
  t?: string; // utm_term
  ct?: string; // utm_content
  g?: string; // gclid
  r?: string; // external referrer (absent when the visit was direct or came from our own site)
  p?: string; // landing path + query
  at?: string; // ISO timestamp of that first landing
};

export type FunnelUtm = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  content?: string | null;
  gclid?: string | null;
};

// utm_source=site marks the site's OWN links (hero CTA, pricing downsell, e-mails
// use "email"). It says how the visitor moved inside the site, never where they
// came from — so it can never beat an external first touch.
const INTERNAL_SOURCES = new Set(["site"]);

const clamp = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
};

const isExternalSource = (s: string | null | undefined): s is string =>
  Boolean(s) && !INTERNAL_SOURCES.has(String(s).toLowerCase());

/** What to store on a first landing. `null` only when there is nothing sensible to record. */
export function buildFirstTouch(input: {
  search: string; // location.search ("?utm_source=…")
  pathname: string; // location.pathname
  referrer: string; // document.referrer
  host: string; // location.host — a referrer on our own host is not a source
  now?: Date;
}): FirstTouch | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(input.search || "");
  } catch {
    params = new URLSearchParams();
  }
  const ft: FirstTouch = {};
  const s = clamp(params.get("utm_source"), 100);
  const m = clamp(params.get("utm_medium"), 100);
  const c = clamp(params.get("utm_campaign"), 150);
  const t = clamp(params.get("utm_term"), 150);
  const ct = clamp(params.get("utm_content"), 150);
  const g = clamp(params.get("gclid"), 200);
  if (s) ft.s = s;
  if (m) ft.m = m;
  if (c) ft.c = c;
  if (t) ft.t = t;
  if (ct) ft.ct = ct;
  if (g) ft.g = g;

  const ref = clamp(input.referrer, 300);
  if (ref) {
    try {
      const u = new URL(ref);
      if (u.host.toLowerCase() !== input.host.toLowerCase()) ft.r = ref;
    } catch {
      // not a URL — ignore
    }
  }
  const p = clamp((input.pathname || "/") + (input.search || ""), 300);
  if (p) ft.p = p;
  ft.at = (input.now ?? new Date()).toISOString();
  return ft;
}

export function serializeFirstTouch(ft: FirstTouch): string {
  return encodeURIComponent(JSON.stringify(ft));
}

export function parseFirstTouch(raw: string | null | undefined): FirstTouch | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const src = obj as Record<string, unknown>;
    const out: FirstTouch = {};
    for (const k of ["s", "m", "c", "t", "ct", "g", "r", "p", "at"] as const) {
      const v = clamp(src[k], k === "r" || k === "p" ? 300 : 200);
      if (v) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/**
 * The utm to store for a lead: the first external touch wins; the page's own
 * values win over an internal or empty first touch; the gclid is kept from
 * whichever side has one, first touch preferred.
 */
export function firstTouchUtm(current: FunnelUtm, ft: FirstTouch | null): FunnelUtm {
  const gclid = ft?.g ?? current.gclid ?? null;
  const ftUtm: FunnelUtm = ft
    ? { source: ft.s ?? null, medium: ft.m ?? null, campaign: ft.c ?? null, term: ft.t ?? null, content: ft.ct ?? null }
    : {};
  let base: FunnelUtm;
  if (ft && isExternalSource(ft.s)) base = ftUtm;
  else if (current.source) base = current;
  else if (ft?.s) base = ftUtm;
  else base = current;
  return {
    source: base.source ?? null,
    medium: base.medium ?? null,
    campaign: base.campaign ?? null,
    term: base.term ?? null,
    content: base.content ?? null,
    gclid,
  };
}

/** The referrer to store: the first landing's external referrer, else what the page saw. */
export function firstTouchReferrer(current: string | null | undefined, ft: FirstTouch | null): string | null {
  return ft?.r ?? current ?? null;
}

/** The landing path to store: the first landing, else the page the lead submitted from. */
export function firstTouchLandingPath(current: string | null | undefined, ft: FirstTouch | null): string | null {
  return ft?.p ?? current ?? null;
}
