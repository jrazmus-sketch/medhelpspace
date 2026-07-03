import "server-only";

// GA4 Data API reader for the admin dashboard "Aquisição" zone. Server-only: uses
// a Google Cloud service-account key (a real secret) that must never reach the
// client. Isolated + fully null-safe on purpose — if GA isn't configured yet, the
// key is bad, or the API errors, this returns null and the dashboard simply hides
// the zone. It must NEVER throw into the admin page render.
//
// Config (both required, else this no-ops):
//   GA4_PROPERTY_ID          numeric property id, e.g. "123456789"
//   GA4_SERVICE_ACCOUNT_JSON full service-account JSON key (Viewer on the property)

import { BetaAnalyticsDataClient } from "@google-analytics/data";

const PROPERTY_ID = process.env.GA4_PROPERTY_ID ?? "";
const SA_JSON = process.env.GA4_SERVICE_ACCOUNT_JSON ?? "";

export interface AnalyticsStats {
  totals: {
    users: number;
    usersPrev: number;
    newUsers: number;
    sessions: number;
    sessionsPrev: number;
    views: number;
    viewsPrev: number;
    avgEngagementSec: number;
  };
  channels: { name: string; sessions: number }[];
  landingPages: { path: string; sessions: number }[];
  conversions: { signUps: number; purchases: number; revenueCents: number };
  sparkline: { date: string; users: number }[];
}

export function analyticsConfigured(): boolean {
  return !!PROPERTY_ID && !!SA_JSON;
}

let clientSingleton: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient | null {
  if (!analyticsConfigured()) return null;
  if (clientSingleton) return clientSingleton;
  try {
    const creds = JSON.parse(SA_JSON);
    clientSingleton = new BetaAnalyticsDataClient({
      credentials: {
        client_email: creds.client_email,
        private_key: creds.private_key,
      },
      projectId: creds.project_id,
    });
    return clientSingleton;
  } catch (e) {
    console.error("[analytics-stats] invalid GA4_SERVICE_ACCOUNT_JSON:", e);
    return null;
  }
}

const CUR = { startDate: "28daysAgo", endDate: "today" };
const PREV = { startDate: "56daysAgo", endDate: "29daysAgo" };

async function fetchGA(): Promise<AnalyticsStats | null> {
  const client = getClient();
  if (!client) return null;
  const property = `properties/${PROPERTY_ID}`;

  try {
    const [[totalsCur], [totalsPrev], [channelsR], [landingR], [convR], [sparkR]] =
      await Promise.all([
        client.runReport({
          property,
          dateRanges: [CUR],
          metrics: [
            { name: "activeUsers" },
            { name: "newUsers" },
            { name: "sessions" },
            { name: "screenPageViews" },
            { name: "averageSessionDuration" },
          ],
        }),
        client.runReport({
          property,
          dateRanges: [PREV],
          metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
        }),
        client.runReport({
          property,
          dateRanges: [CUR],
          dimensions: [{ name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: 6,
        }),
        client.runReport({
          property,
          dateRanges: [CUR],
          dimensions: [{ name: "landingPagePlusQueryString" }],
          metrics: [{ name: "sessions" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: 6,
        }),
        client.runReport({
          property,
          dateRanges: [CUR],
          dimensions: [{ name: "eventName" }],
          metrics: [{ name: "eventCount" }, { name: "purchaseRevenue" }],
          dimensionFilter: {
            filter: {
              fieldName: "eventName",
              inListFilter: { values: ["sign_up", "purchase"] },
            },
          },
        }),
        client.runReport({
          property,
          dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
          dimensions: [{ name: "date" }],
          metrics: [{ name: "activeUsers" }],
          orderBys: [{ dimension: { dimensionName: "date" } }],
        }),
      ]);

    const metric = (
      resp: (typeof totalsCur) | undefined,
      row: number,
      col: number,
    ): number => Number(resp?.rows?.[row]?.metricValues?.[col]?.value ?? 0);

    let signUps = 0;
    let purchases = 0;
    let revenue = 0;
    for (const r of convR?.rows ?? []) {
      const name = r.dimensionValues?.[0]?.value;
      const count = Number(r.metricValues?.[0]?.value ?? 0);
      if (name === "sign_up") signUps = count;
      else if (name === "purchase") {
        purchases = count;
        revenue = Number(r.metricValues?.[1]?.value ?? 0);
      }
    }

    return {
      totals: {
        users: metric(totalsCur, 0, 0),
        newUsers: metric(totalsCur, 0, 1),
        sessions: metric(totalsCur, 0, 2),
        views: metric(totalsCur, 0, 3),
        avgEngagementSec: Math.round(metric(totalsCur, 0, 4)),
        usersPrev: metric(totalsPrev, 0, 0),
        sessionsPrev: metric(totalsPrev, 0, 1),
        viewsPrev: metric(totalsPrev, 0, 2),
      },
      channels: (channelsR?.rows ?? []).map((r) => ({
        name: r.dimensionValues?.[0]?.value ?? "(other)",
        sessions: Number(r.metricValues?.[0]?.value ?? 0),
      })),
      landingPages: (landingR?.rows ?? []).map((r) => ({
        path: r.dimensionValues?.[0]?.value ?? "/",
        sessions: Number(r.metricValues?.[0]?.value ?? 0),
      })),
      conversions: { signUps, purchases, revenueCents: Math.round(revenue * 100) },
      sparkline: (sparkR?.rows ?? []).map((r) => ({
        date: r.dimensionValues?.[0]?.value ?? "",
        users: Number(r.metricValues?.[0]?.value ?? 0),
      })),
    };
  } catch (e) {
    console.error("[analytics-stats] GA Data API request failed:", e);
    return null;
  }
}

// Per-instance TTL cache (1h). GA quota is generous and admin loads are few, so
// this is plenty to avoid re-querying on every dashboard refresh. Errors (null)
// are intentionally NOT cached, so a transient GA blip retries on the next load.
let cache: { at: number; data: AnalyticsStats } | null = null;
const TTL_MS = 60 * 60 * 1000;

export async function getAnalyticsStats(): Promise<AnalyticsStats | null> {
  if (!analyticsConfigured()) return null;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const data = await fetchGA();
  if (data) cache = { at: Date.now(), data };
  return data;
}
