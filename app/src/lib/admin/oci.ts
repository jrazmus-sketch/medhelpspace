import { createAdminClient } from "@/lib/supabase/admin";

// Google Ads Offline Conversion Import (OCI) — attribution Phase 2.
// Reports server-verified conversions back to Google, keyed on gclid, for leads
// that came from a Google ad. Server-only (leads is deny-all RLS → service role).
//
// A lead contributes up to FOUR conversions, uploaded independently:
//   • "Lead verified"      — time verified_at,      value 0
//   • "Simulado started"   — time sim_entered_at,   value 0
//   • "Simulado submitted" — time sim_completed_at, value 0
//   • "Purchase"           — time converted_at,     value = the paid order amount (BRL)
// Each is stamped (oci_*_uploaded_at) once uploaded so it never exports twice.
//
// Why the simulado gets its own two: "Lead verified" fires on verified_at, which
// is only stamped by a CLICK on an emailed link. The /simulado-revalida exam
// starts immediately on-site, so a lead can sign up, answer 100 questions and
// submit without ever opening the inbox — invisible to Google. The simulado
// campaign therefore bids on "Simulado started" (the signup, high volume) and
// reads "Simulado submitted" (>=50 answers graded, deep intent) as the quality
// column. See schema-patch-leads-oci-simulado.sql.

// Conversion action names — MUST match the actions defined in Google Ads exactly
// (the CSV's "Conversion Name" column is matched character-for-character).
export const OCI_CONVERSION_VERIFIED = "Lead verified";
export const OCI_CONVERSION_PURCHASE = "Purchase";
export const OCI_CONVERSION_SIM_STARTED = "Simulado started";
export const OCI_CONVERSION_SIM_SUBMITTED = "Simulado submitted";
const OCI_TIMEZONE = "America/Sao_Paulo"; // the Ads account time zone (BRT)
const OCI_CURRENCY = "BRL";

export type OciReadyCounts = {
  verified: number;
  purchase: number;
  simStarted: number;
  simSubmitted: number;
};

/** Counts of not-yet-uploaded conversions from gclid-sourced leads. */
export async function getOciReadyCounts(): Promise<OciReadyCounts> {
  const admin = createAdminClient();
  const base = () =>
    admin
      .from("leads")
      .select("*", { count: "exact", head: true })
      .not("gclid", "is", null)
      .eq("is_test", false);
  const [{ count: verified }, { count: purchase }, { count: simStarted }, { count: simSubmitted }] =
    await Promise.all([
      base().not("verified_at", "is", null).is("oci_verified_uploaded_at", null),
      base().not("converted_at", "is", null).is("oci_purchase_uploaded_at", null),
      base().not("sim_entered_at", "is", null).is("oci_sim_started_uploaded_at", null),
      base().not("sim_completed_at", "is", null).is("oci_sim_submitted_uploaded_at", null),
    ]);
  return {
    verified: verified ?? 0,
    purchase: purchase ?? 0,
    simStarted: simStarted ?? 0,
    simSubmitted: simSubmitted ?? 0,
  };
}

export type OciExport = {
  csv: string;
  verifiedIds: string[];
  purchaseIds: string[];
  simStartedIds: string[];
  simSubmittedIds: string[];
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

  // Zero-value conversions all share a shape: one timestamp column gating one
  // upload marker. Only Purchase needs the extra order-value join below.
  const zeroValue = (timeCol: string, markerCol: string) =>
    admin
      .from("leads")
      .select(`id, gclid, ${timeCol}`)
      .not("gclid", "is", null)
      .not(timeCol, "is", null)
      .is(markerCol, null)
      .eq("is_test", false);

  const [
    { data: verifiedLeads },
    { data: purchaseLeads },
    { data: simStartedLeads },
    { data: simSubmittedLeads },
  ] = await Promise.all([
    zeroValue("verified_at", "oci_verified_uploaded_at"),
    admin
      .from("leads")
      .select("id, email, gclid, converted_at")
      .not("gclid", "is", null)
      .not("converted_at", "is", null)
      .is("oci_purchase_uploaded_at", null)
      .eq("is_test", false),
    zeroValue("sim_entered_at", "oci_sim_started_uploaded_at"),
    zeroValue("sim_completed_at", "oci_sim_submitted_uploaded_at"),
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
  const purchaseIds: string[] = [];

  // Emit one zero-value conversion per lead and return the IDs included, so
  // "mark uploaded" stamps exactly what was downloaded.
  const emitZeroValue = (
    leads: unknown,
    timeCol: string,
    conversionName: string,
  ): string[] => {
    const ids: string[] = [];
    for (const l of (leads as Array<Record<string, unknown>> | null) ?? []) {
      rows.push(
        [
          csvEsc(l.gclid as string),
          conversionName,
          fmtTime(l[timeCol] as string),
          "0",
          OCI_CURRENCY,
        ].join(","),
      );
      ids.push(l.id as string);
    }
    return ids;
  };

  const verifiedIds = emitZeroValue(verifiedLeads, "verified_at", OCI_CONVERSION_VERIFIED);
  const simStartedIds = emitZeroValue(
    simStartedLeads,
    "sim_entered_at",
    OCI_CONVERSION_SIM_STARTED,
  );
  const simSubmittedIds = emitZeroValue(
    simSubmittedLeads,
    "sim_completed_at",
    OCI_CONVERSION_SIM_SUBMITTED,
  );

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

  return { csv, verifiedIds, purchaseIds, simStartedIds, simSubmittedIds, rowCount: rows.length };
}
