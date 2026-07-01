import { createAdminClient } from "@/lib/supabase/admin";

// Google Ads Offline Conversion Import (OCI) — attribution Phase 2.
// Reports server-verified conversions back to Google, keyed on gclid, for leads
// that came from a Google ad. Server-only (leads is deny-all RLS → service role).
//
// A lead contributes up to TWO conversions, uploaded independently:
//   • "Lead verified"  — time verified_at,   value 0
//   • "Purchase"       — time converted_at,  value = the paid order amount (BRL)
// Each is stamped (oci_*_uploaded_at) once uploaded so it never exports twice.

// Conversion action names — MUST match the actions defined in Google Ads exactly
// (the CSV's "Conversion Name" column is matched character-for-character).
export const OCI_CONVERSION_VERIFIED = "Lead verified";
export const OCI_CONVERSION_PURCHASE = "Purchase";
const OCI_TIMEZONE = "America/Sao_Paulo"; // the Ads account time zone (BRT)
const OCI_CURRENCY = "BRL";

export type OciReadyCounts = { verified: number; purchase: number };

/** Counts of not-yet-uploaded conversions from gclid-sourced leads. */
export async function getOciReadyCounts(): Promise<OciReadyCounts> {
  const admin = createAdminClient();
  const base = () =>
    admin.from("leads").select("*", { count: "exact", head: true }).not("gclid", "is", null);
  const [{ count: verified }, { count: purchase }] = await Promise.all([
    base().not("verified_at", "is", null).is("oci_verified_uploaded_at", null),
    base().not("converted_at", "is", null).is("oci_purchase_uploaded_at", null),
  ]);
  return { verified: verified ?? 0, purchase: purchase ?? 0 };
}

export type OciExport = {
  csv: string;
  verifiedIds: string[];
  purchaseIds: string[];
  rowCount: number;
};

// Account-local wall clock in the declared zone: "YYYY-MM-DD HH:mm:ss".
// Built from parts so it's stable across engines (and guards the hour12:false "24").
function fmtTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OCI_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")} ${hour}:${g("minute")}:${g("second")}`;
}

function csvEsc(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build the Google Ads offline-conversion CSV for every not-yet-uploaded
 * conversion, plus the exact lead IDs included (so "mark uploaded" stamps only
 * what was downloaded). Format: a Parameters line declaring the time zone, the
 * column header, then one row per conversion.
 */
export async function buildOciExport(): Promise<OciExport> {
  const admin = createAdminClient();

  const [{ data: verifiedLeads }, { data: purchaseLeads }] = await Promise.all([
    admin
      .from("leads")
      .select("id, gclid, verified_at")
      .not("gclid", "is", null)
      .not("verified_at", "is", null)
      .is("oci_verified_uploaded_at", null),
    admin
      .from("leads")
      .select("id, email, gclid, converted_at")
      .not("gclid", "is", null)
      .not("converted_at", "is", null)
      .is("oci_purchase_uploaded_at", null),
  ]);

  // Purchase value: lead.email → profiles.email → orders(user_id, status='paid').
  // Mirrors how finalize.ts flips the lead to converted (matched by account email).
  const emailToValue = new Map<string, number>();
  const emails = [
    ...new Set((purchaseLeads ?? []).map((l) => (l.email as string).toLowerCase())),
  ];
  if (emails.length) {
    const { data: profs } = await admin.from("profiles").select("id, email").in("email", emails);
    const idToEmail = new Map(
      (profs ?? []).map((p) => [p.id as string, (p.email as string).toLowerCase()]),
    );
    const userIds = [...idToEmail.keys()];
    if (userIds.length) {
      const { data: orders } = await admin
        .from("orders")
        .select("user_id, amount_cents, base_amount_cents, status")
        .in("user_id", userIds)
        .eq("status", "paid");
      for (const o of orders ?? []) {
        const em = idToEmail.get(o.user_id as string);
        if (!em) continue;
        // Sale value in BRL. Prefer the base (pre-installment-interest) price and
        // fall back to the total charged. Change here if you'd rather report the
        // total (amount_cents) or net-of-discount.
        const cents =
          (o.base_amount_cents as number | null) ?? (o.amount_cents as number | null) ?? 0;
        emailToValue.set(em, Math.max(emailToValue.get(em) ?? 0, cents / 100));
      }
    }
  }

  const rows: string[] = [];
  const verifiedIds: string[] = [];
  const purchaseIds: string[] = [];

  for (const l of verifiedLeads ?? []) {
    rows.push(
      [
        csvEsc(l.gclid as string),
        OCI_CONVERSION_VERIFIED,
        fmtTime(l.verified_at as string),
        "0",
        OCI_CURRENCY,
      ].join(","),
    );
    verifiedIds.push(l.id as string);
  }
  for (const l of purchaseLeads ?? []) {
    const val = emailToValue.get((l.email as string).toLowerCase()) ?? 0;
    rows.push(
      [
        csvEsc(l.gclid as string),
        OCI_CONVERSION_PURCHASE,
        fmtTime(l.converted_at as string),
        val.toFixed(2),
        OCI_CURRENCY,
      ].join(","),
    );
    purchaseIds.push(l.id as string);
  }

  const csv =
    [
      `Parameters:TimeZone=${OCI_TIMEZONE}`,
      "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
      ...rows,
    ].join("\n") + "\n";

  return { csv, verifiedIds, purchaseIds, rowCount: rows.length };
}
