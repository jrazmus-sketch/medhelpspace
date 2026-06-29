// Server-only aggregation for the admin dashboard. One round of parallel reads via
// the service-role client; the page gates which sections it actually renders by the
// viewer's role (billing/support/audit), so we only compute the heavy/sensitive
// sections when permitted.
//
// Volume is low (early-stage), so we follow the established pattern of fetching the
// order rows and aggregating in JS (mirrors admin/billing + admin/notas-fiscais)
// rather than pushing every rollup into SQL. Active-member counts are the one
// genuinely awkward cross-table distinct, so those come from an RPC
// (get_active_member_counts) with a graceful 0 fallback if the patch isn't applied.

import { createAdminClient } from "@/lib/supabase/admin";
import { getSupportOpenCount, getSupportTicketsList } from "@/lib/admin/support-tickets";

const DAY_MS = 24 * 60 * 60 * 1000;
const GUARANTEE_DAYS = 7; // mirrors notas-fiscais: nota becomes issuable on day 8
const NFSE_UPCOMING_DAYS = 3; // "becomes ready within N days" lookahead

function monthIndex(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type ContentStats = {
  pages: number;
  lessons: number;
  lessonsWithAudio: number;
  quizzes: number;
  flashcards: number;
  members: number;
  cohorts: number;
  drafts: number;
};

export type ActionCenter = {
  supportOpen: number;
  recentTickets: {
    id: number;
    subject: string;
    who: string;
    lastAt: string;
    unread: boolean;
  }[];
  drafts: number;
  // billing-only
  nfseReady: number;
  nfseAtRisk: number; // ready + already past its competência (purchase) month
  nfseUpcoming: number; // not ready yet, becomes ready within NFSE_UPCOMING_DAYS
  nfseOldestDays: number | null; // age of the oldest unissued ready nota
  pendingPix: number; // pending Pix orders not yet expired
  declined24h: number;
};

export type RevenueStats = {
  monthCents: number;
  lastMonthCents: number;
  pctChange: number | null; // null when last month was 0
  monthCount: number;
  weekCount: number;
  todayCount: number;
  pixCount: number;
  cardCount: number;
  avgOrderCents: number; // this month
  lifetimeCents: number;
  series: { day: string; cents: number }[]; // last 30 days, ascending
  recent: {
    id: string;
    name: string;
    amountCents: number;
    cohort: string;
    at: string;
    method: string;
  }[];
};

export type CohortStat = {
  id: number;
  name: string;
  testDate: string | null;
  daysToTest: number | null;
  members: number;
  revenueCents: number; // billing-only; 0 when not permitted
  unlock60dDate: string | null;
  daysTo60d: number | null;
  membershipEndsAt: string | null;
  daysToMembershipEnd: number | null;
  isForSale: boolean;
  saleEndsAt: string | null;
  daysToSaleEnd: number | null;
};

export type MemberStats = {
  total: number;
  signups7d: number;
  signups30d: number;
  active7d: number;
  active30d: number;
};

export type RecentActivity = {
  id: number;
  action: string;
  actor: string;
  target: string | null;
  at: string;
};

export type DashboardData = {
  content: ContentStats;
  actions: ActionCenter;
  members: MemberStats;
  cohorts: CohortStat[];
  revenue: RevenueStats | null; // null when viewer can't see billing
  recentActivity: RecentActivity[] | null; // null when viewer isn't super_admin
};

type PaidOrder = {
  id: string;
  amount_cents: number;
  created_at: string;
  cohort_id: number;
  payment_method: string;
  user_id: string;
  nfse_status: string | null;
};

export async function getAdminDashboardData(opts: {
  canSeeBilling: boolean;
  canSeeSupport: boolean;
  canSeeAudit: boolean;
}): Promise<DashboardData> {
  const admin = createAdminClient();
  const now = new Date();
  const nowMs = now.getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const weekAgoIso = new Date(nowMs - 7 * DAY_MS).toISOString();
  const monthAgoIso = new Date(nowMs - 30 * DAY_MS).toISOString();
  const dayAgoIso = new Date(nowMs - DAY_MS).toISOString();
  const nowMonthIdx = monthIndex(now);

  const headCount = (table: string) =>
    admin.from(table).select("*", { count: "exact", head: true });

  // ── Content + member counts (all admins) ────────────────────────────────────
  const contentP = Promise.all([
    headCount("pages"),
    admin.from("pages").select("*", { count: "exact", head: true }).eq("status", "draft"),
    headCount("lessons"),
    admin.from("lessons").select("*", { count: "exact", head: true }).not("audio_url", "is", null),
    headCount("quiz_questions"),
    headCount("flashcard_items"),
    headCount("profiles"),
    admin.from("cohorts").select("*", { count: "exact", head: true }).eq("active", true),
  ]);

  const signupsP = Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", weekAgoIso),
    admin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", monthAgoIso),
  ]);

  // ── Cohorts + memberships (all admins; revenue folded in later if permitted) ─
  const cohortsP = admin
    .from("cohorts")
    .select(
      "id, name, test_date, membership_ends_at, is_for_sale, sale_ends_at, active, display_order",
    )
    .eq("active", true)
    .order("display_order")
    .order("id");
  const membershipsP = admin.from("user_cohort_memberships").select("cohort_id");

  // ── Support (support/billing/super) ─────────────────────────────────────────
  const supportP = opts.canSeeSupport
    ? Promise.all([getSupportOpenCount(), getSupportTicketsList()])
    : Promise.resolve([0, []] as [number, Awaited<ReturnType<typeof getSupportTicketsList>>]);

  // ── Paid orders (billing only) — powers revenue, per-cohort revenue, nfse ────
  const paidOrdersP = opts.canSeeBilling
    ? admin
        .from("orders")
        .select("id, amount_cents, created_at, cohort_id, payment_method, user_id, nfse_status")
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(5000)
    : Promise.resolve({ data: [] as PaidOrder[] });

  const pendingPixP = opts.canSeeBilling
    ? admin
        .from("orders")
        .select("pix_expires_at")
        .eq("status", "pending")
        .eq("payment_method", "pix")
        .limit(1000)
    : Promise.resolve({ data: [] as { pix_expires_at: string | null }[] });

  const declinedP = opts.canSeeBilling
    ? admin
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "declined")
        .gte("created_at", dayAgoIso)
    : Promise.resolve({ count: 0 });

  // ── Active members (RPC; graceful fallback) ─────────────────────────────────
  const activeP = admin.rpc("get_active_member_counts");

  // ── Audit (super_admin only) ────────────────────────────────────────────────
  const auditP = opts.canSeeAudit
    ? admin
        .from("admin_audit_log")
        .select("id, actor_user_id, action, target_user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(8)
    : Promise.resolve({ data: [] as { id: number; actor_user_id: string | null; action: string; target_user_id: string | null; created_at: string }[] });

  const [
    contentRes,
    [signups7, signups30],
    cohortsRes,
    membershipsRes,
    [supportOpen, tickets],
    paidRes,
    pendingPixRes,
    declinedRes,
    activeRes,
    auditRes,
  ] = await Promise.all([
    contentP, signupsP, cohortsP, membershipsP, supportP, paidOrdersP, pendingPixP, declinedP, activeP, auditP,
  ]);

  const [pagesC, draftsC, lessonsC, audioC, quizC, flashC, membersC, cohortsC] = contentRes;

  const content: ContentStats = {
    pages: pagesC.count ?? 0,
    lessons: lessonsC.count ?? 0,
    lessonsWithAudio: audioC.count ?? 0,
    quizzes: quizC.count ?? 0,
    flashcards: flashC.count ?? 0,
    members: membersC.count ?? 0,
    cohorts: cohortsC.count ?? 0,
    drafts: draftsC.count ?? 0,
  };

  // Active-member counts: RPC returns a one-row table; tolerate absent patch.
  let active7d = 0;
  let active30d = 0;
  if (!activeRes.error && activeRes.data) {
    const row = Array.isArray(activeRes.data) ? activeRes.data[0] : activeRes.data;
    active7d = Number(row?.active_7d ?? 0);
    active30d = Number(row?.active_30d ?? 0);
  }

  const members: MemberStats = {
    total: content.members,
    signups7d: signups7.count ?? 0,
    signups30d: signups30.count ?? 0,
    active7d,
    active30d,
  };

  // ── Aggregate paid orders ───────────────────────────────────────────────────
  const paid = (paidRes.data ?? []) as PaidOrder[];
  const revenueByCohort = new Map<number, number>();
  let monthCents = 0, lastMonthCents = 0, monthCount = 0, weekCount = 0, todayCount = 0;
  let pixCount = 0, cardCount = 0, lifetimeCents = 0;

  // 30-day series buckets, pre-seeded so empty days render as 0.
  const series: { day: string; cents: number }[] = [];
  const seriesIdx = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const k = dayKey(new Date(nowMs - i * DAY_MS));
    seriesIdx.set(k, series.length);
    series.push({ day: k, cents: 0 });
  }

  // nfse accumulators
  let nfseReady = 0, nfseAtRisk = 0, nfseUpcoming = 0, nfseOldestMs = 0;

  for (const o of paid) {
    const created = new Date(o.created_at);
    const cMs = created.getTime();
    lifetimeCents += o.amount_cents;
    revenueByCohort.set(o.cohort_id, (revenueByCohort.get(o.cohort_id) ?? 0) + o.amount_cents);

    const cIdx = monthIndex(created);
    if (cIdx === nowMonthIdx) {
      monthCents += o.amount_cents;
      monthCount += 1;
      if (o.payment_method === "pix") pixCount += 1;
      else cardCount += 1;
    } else if (cIdx === nowMonthIdx - 1) {
      lastMonthCents += o.amount_cents;
    }
    if (cMs >= startOfToday.getTime()) todayCount += 1;
    if (o.created_at >= weekAgoIso) weekCount += 1;

    const sIdx = seriesIdx.get(dayKey(created));
    if (sIdx !== undefined) series[sIdx].cents += o.amount_cents;

    // NFS-e backlog (only unissued/unskipped paid orders count)
    if (o.nfse_status == null) {
      const eligibleMs = cMs + GUARANTEE_DAYS * DAY_MS;
      if (nowMs >= eligibleMs) {
        nfseReady += 1;
        // At risk: ready but the purchase month is already over (competência slip).
        if (cIdx < nowMonthIdx) nfseAtRisk += 1;
        const ageMs = nowMs - cMs;
        if (ageMs > nfseOldestMs) nfseOldestMs = ageMs;
      } else if (eligibleMs <= nowMs + NFSE_UPCOMING_DAYS * DAY_MS) {
        nfseUpcoming += 1;
      }
    }
  }

  const pendingPix = ((pendingPixRes.data ?? []) as { pix_expires_at: string | null }[]).filter(
    (r) => !r.pix_expires_at || new Date(r.pix_expires_at).getTime() > nowMs,
  ).length;

  const pctChange =
    lastMonthCents > 0 ? Math.round(((monthCents - lastMonthCents) / lastMonthCents) * 100) : null;

  // Recent sales (top 5 paid; resolve buyer names + cohort names)
  const recentPaid = paid.slice(0, 5);

  // ── Cohort rollups ──────────────────────────────────────────────────────────
  const memberByCohort = new Map<number, number>();
  for (const m of (membershipsRes.data ?? []) as { cohort_id: number }[]) {
    memberByCohort.set(m.cohort_id, (memberByCohort.get(m.cohort_id) ?? 0) + 1);
  }
  const cohortRows = (cohortsRes.data ?? []) as {
    id: number; name: string; test_date: string | null; membership_ends_at: string | null;
    is_for_sale: boolean | null; sale_ends_at: string | null;
  }[];
  const cohortNameById = new Map<number, string>(cohortRows.map((c) => [c.id, c.name]));

  const daysFromNow = (iso: string | null): number | null =>
    iso ? Math.ceil((new Date(iso).getTime() - startOfToday.getTime()) / DAY_MS) : null;

  const cohorts: CohortStat[] = cohortRows.map((c) => {
    const unlock60d = c.test_date
      ? new Date(new Date(c.test_date).getTime() - 60 * DAY_MS).toISOString().slice(0, 10)
      : null;
    return {
      id: c.id,
      name: c.name,
      testDate: c.test_date,
      daysToTest: daysFromNow(c.test_date),
      members: memberByCohort.get(c.id) ?? 0,
      revenueCents: revenueByCohort.get(c.id) ?? 0,
      unlock60dDate: unlock60d,
      daysTo60d: daysFromNow(unlock60d),
      membershipEndsAt: c.membership_ends_at,
      daysToMembershipEnd: daysFromNow(c.membership_ends_at),
      isForSale: !!c.is_for_sale,
      saleEndsAt: c.sale_ends_at,
      daysToSaleEnd: daysFromNow(c.sale_ends_at),
    };
  });

  // ── Resolve names for recent sales + audit (one profiles fetch) ─────────────
  const audit = (auditRes.data ?? []) as {
    id: number; actor_user_id: string | null; action: string; target_user_id: string | null; created_at: string;
  }[];
  const nameIds = new Set<string>();
  recentPaid.forEach((o) => nameIds.add(o.user_id));
  audit.forEach((a) => {
    if (a.actor_user_id) nameIds.add(a.actor_user_id);
    if (a.target_user_id) nameIds.add(a.target_user_id);
  });
  const nameById = new Map<string, string>();
  if (nameIds.size > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, display_name, email")
      .in("id", [...nameIds]);
    for (const p of (profs ?? []) as { id: string; display_name: string | null; email: string }[]) {
      nameById.set(p.id, p.display_name || p.email);
    }
  }

  const revenue: RevenueStats | null = opts.canSeeBilling
    ? {
        monthCents,
        lastMonthCents,
        pctChange,
        monthCount,
        weekCount,
        todayCount,
        pixCount,
        cardCount,
        avgOrderCents: monthCount > 0 ? Math.round(monthCents / monthCount) : 0,
        lifetimeCents,
        series,
        recent: recentPaid.map((o) => ({
          id: o.id,
          name: nameById.get(o.user_id) ?? "—",
          amountCents: o.amount_cents,
          cohort: cohortNameById.get(o.cohort_id) ?? "—",
          at: o.created_at,
          method: o.payment_method,
        })),
      }
    : null;

  // ── Action center ───────────────────────────────────────────────────────────
  const openTickets = (tickets as Awaited<ReturnType<typeof getSupportTicketsList>>)
    .filter((t) => t.status === "open" || t.status === "in_progress")
    .slice(0, 5);
  const actions: ActionCenter = {
    supportOpen: supportOpen as number,
    recentTickets: openTickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      who: t.display_name || t.email,
      lastAt: t.last_message_at,
      unread: !!t.admin_unread,
    })),
    drafts: content.drafts,
    nfseReady,
    nfseAtRisk,
    nfseUpcoming,
    nfseOldestDays: nfseReady > 0 ? Math.floor(nfseOldestMs / DAY_MS) : null,
    pendingPix,
    declined24h: declinedRes.count ?? 0,
  };

  const recentActivity: RecentActivity[] | null = opts.canSeeAudit
    ? audit.map((a) => ({
        id: a.id,
        action: a.action,
        actor: a.actor_user_id ? nameById.get(a.actor_user_id) ?? "—" : "sistema",
        target: a.target_user_id ? nameById.get(a.target_user_id) ?? "—" : null,
        at: a.created_at,
      }))
    : null;

  return { content, actions, members, cohorts, revenue, recentActivity };
}
