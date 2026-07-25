import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_TEMPLATE_DEFAULTS } from "@/lib/email-render";

// Server-only read model for the /admin/email-clicks feed: every link click in any
// email we send, attributed to a person. `lead_email_events` (a now-general email-events
// log despite its legacy name) is deny-all RLS, so this MUST run through
// createAdminClient() from a server context (the page gates the caller's role first).
//
// "Who clicked" is resolved at READ time by matching the recipient address against
// `profiles` (members) then `leads` — the events table stores only the raw address, so
// names stay current and no snapshot goes stale. A member match wins over a lead match
// (a converted lead is a customer first). Neither → "unknown" (e.g. an admin/test
// address). The email is named via its 'sent' anchor's `kind`.

export type EmailClickPersonType = "member" | "lead" | "unknown";

export type EmailClickPerson = {
  type: EmailClickPersonType;
  name: string | null; // display_name (member) / first_name (lead) / null
  id: string | null; // profile uuid or lead id
  role: string | null; // member role only (super_admin … member); null otherwise
};

export type EmailClick = {
  id: number; // lead_email_events.id
  at: string; // created_at (ISO)
  email: string; // recipient (lowercased)
  url: string | null; // the clicked link
  kind: string | null; // template kind from the 'sent' anchor
  kindLabel: string | null; // friendly name (EMAIL_TEMPLATE_DEFAULTS) or null
  person: EmailClickPerson;
};

export type EmailClickCounts = { all: number; member: number; lead: number; unknown: number };

export type EmailClicksResult = {
  clicks: EmailClick[]; // the requested page
  total: number; // total matching rows in the scanned window (post type-filter)
  page: number;
  pageSize: number;
  windowCapped: boolean; // true = older clicks exist beyond the scanned window
  counts: EmailClickCounts; // per-type totals within the window (pre type-filter)
};

// Most-recent clicks scanned per request. A rolling window keeps the identity lookups
// (`.in(email …)`) safely under the PostgREST 1000-row cap and the feed fast. Older
// clicks are surfaced via `windowCapped`, never silently dropped.
const WINDOW = 500;

export type EmailClicksParams = {
  page?: number;
  pageSize?: number;
  type?: EmailClickPersonType | "all";
  search?: string; // email substring (matched across full history, not just the window)
};

export async function getEmailClicks({
  page = 1,
  pageSize = 50,
  type = "all",
  search = "",
}: EmailClicksParams = {}): Promise<EmailClicksResult> {
  const admin = createAdminClient();
  const trimmedSearch = search.trim();

  // 1) The most-recent clicks (optionally filtered by email substring in SQL so search
  // covers all history, bounded to the WINDOW newest matches).
  let q = admin
    .from("lead_email_events")
    .select("id, email, url, resend_id, created_at")
    .eq("event_type", "clicked")
    .order("created_at", { ascending: false })
    .limit(WINDOW);
  if (trimmedSearch) q = q.ilike("email", `%${trimmedSearch}%`);
  const { data: rows } = await q;
  const clickRows = (rows ?? []) as {
    id: number;
    email: string;
    url: string | null;
    resend_id: string | null;
    created_at: string;
  }[];

  if (clickRows.length === 0) {
    return {
      clicks: [],
      total: 0,
      page,
      pageSize,
      windowCapped: false,
      counts: { all: 0, member: 0, lead: 0, unknown: 0 },
    };
  }

  // 2) Name each email via its 'sent' anchor's kind (grouped by resend message id).
  const resendIds = [...new Set(clickRows.map((r) => r.resend_id).filter((v): v is string => Boolean(v)))];
  const kindByResend = new Map<string, string>();
  if (resendIds.length > 0) {
    const { data: sentRows } = await admin
      .from("lead_email_events")
      .select("resend_id, kind")
      .eq("event_type", "sent")
      .in("resend_id", resendIds);
    for (const s of (sentRows ?? []) as { resend_id: string | null; kind: string | null }[]) {
      if (s.resend_id && s.kind) kindByResend.set(s.resend_id, s.kind);
    }
  }

  // 3) Resolve identity — members (profiles) win over leads. Both keyed by lowercased
  // email to match the lowercased addresses stored on events.
  const emails = [...new Set(clickRows.map((r) => r.email))];
  const [{ data: profs }, { data: leadRows }] = await Promise.all([
    admin.from("profiles").select("id, email, display_name, role").in("email", emails),
    admin.from("leads").select("id, email, first_name").in("email", emails),
  ]);
  const memberByEmail = new Map<string, { id: string; display_name: string | null; role: string | null }>();
  for (const p of (profs ?? []) as { id: string; email: string | null; display_name: string | null; role: string | null }[]) {
    if (p.email) memberByEmail.set(p.email.toLowerCase(), { id: p.id, display_name: p.display_name, role: p.role });
  }
  const leadByEmail = new Map<string, { id: string; first_name: string | null }>();
  for (const l of (leadRows ?? []) as { id: string; email: string | null; first_name: string | null }[]) {
    if (l.email) leadByEmail.set(l.email.toLowerCase(), { id: l.id, first_name: l.first_name });
  }

  const resolvePerson = (email: string): EmailClickPerson => {
    const m = memberByEmail.get(email);
    if (m) return { type: "member", name: m.display_name ?? null, id: m.id, role: m.role ?? null };
    const l = leadByEmail.get(email);
    if (l) return { type: "lead", name: l.first_name ?? null, id: l.id, role: null };
    return { type: "unknown", name: null, id: null, role: null };
  };

  // 4) Build resolved clicks + per-type counts (over the whole window, pre type-filter).
  const resolved: EmailClick[] = clickRows.map((r) => {
    const kind = r.resend_id ? kindByResend.get(r.resend_id) ?? null : null;
    return {
      id: r.id,
      at: r.created_at,
      email: r.email,
      url: r.url,
      kind,
      kindLabel: kind ? EMAIL_TEMPLATE_DEFAULTS[kind]?.name ?? null : null,
      person: resolvePerson(r.email),
    };
  });

  const counts: EmailClickCounts = { all: resolved.length, member: 0, lead: 0, unknown: 0 };
  for (const c of resolved) counts[c.person.type] += 1;

  // 5) Type filter (in-memory — identity is read-time) + pagination.
  const filtered = type === "all" ? resolved : resolved.filter((c) => c.person.type === type);
  const start = (page - 1) * pageSize;
  return {
    clicks: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    windowCapped: clickRows.length === WINDOW,
    counts,
  };
}
