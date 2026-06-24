import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MembersClient } from "./members-client";
import {
  EXPIRING_SOON_DAYS,
  type MemberListRow,
  type MembershipStatus,
} from "@/lib/admin/member-detail";

export const metadata = { title: "Membros" };

const BILLING_ROLES = ["super_admin", "billing_admin"];
const DAY_MS = 86_400_000;

// Derive the membership lifecycle from the user's cohort window so the table can
// colour a Status pill without per-row work. Mirrors the access logic in
// requireActiveMembership: outside [starts_at, ends_at] there is no live access.
function deriveStatus(
  startsAt: string | null,
  endsAt: string | null,
  nowMs: number,
): MembershipStatus {
  if (!startsAt || !endsAt) return "none";
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (nowMs < start) return "scheduled";
  if (nowMs > end) return "expired";
  if (end - nowMs <= EXPIRING_SOON_DAYS * DAY_MS) return "expiring";
  return "active";
}

export default async function MembersPage() {
  const [supabase, admin] = [await createClient(), createAdminClient()];

  const { data: { user } } = await supabase.auth.getUser();
  const { data: currentProfile } = user
    ? await admin.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };

  const [{ data: profiles }, { data: memberships }, { data: cohorts }, { data: paidOrders }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, email, display_name, role, created_at")
        .order("created_at", { ascending: false }),
      admin.from("user_cohort_memberships").select("user_id, cohort_id"),
      admin
        .from("cohorts")
        .select("id, name, slug, membership_starts_at, membership_ends_at")
        .order("id"),
      // Lifetime paid = sum of paid orders. Only the paid rows are needed for the
      // column total; the drawer fetches the full per-user order history on open.
      admin.from("orders").select("user_id, amount_cents").eq("status", "paid"),
    ]);

  const userIds = (profiles ?? []).map((p) => p.id as string);
  // One round-trip for everyone's last study activity, instead of N×2 queries.
  const { data: activity } = userIds.length
    ? await admin.rpc("get_last_activity_per_user", { user_ids: userIds })
    : { data: [] };

  const cohortById = new Map(
    (cohorts ?? []).map((c) => [
      c.id as number,
      {
        name: c.name as string,
        startsAt: c.membership_starts_at as string,
        endsAt: c.membership_ends_at as string,
      },
    ]),
  );
  const cohortByUser = new Map(
    (memberships ?? []).map((m) => [m.user_id as string, m.cohort_id as number]),
  );
  const lastActiveByUser = new Map<string, string>(
    ((activity ?? []) as { user_id: string; last_activity: string }[]).map((a) => [
      a.user_id,
      a.last_activity,
    ]),
  );
  const paidByUser = new Map<string, number>();
  for (const o of paidOrders ?? []) {
    const uid = o.user_id as string;
    paidByUser.set(uid, (paidByUser.get(uid) ?? 0) + (o.amount_cents as number));
  }

  const nowMs = Date.now();

  const rows: MemberListRow[] = (profiles ?? []).map((p) => {
    const cohortId = cohortByUser.get(p.id as string) ?? null;
    const cohort = cohortId != null ? cohortById.get(cohortId) : undefined;
    return {
      id: p.id as string,
      email: p.email as string,
      display_name: p.display_name as string | null,
      role: p.role as string,
      created_at: p.created_at as string,
      cohort_id: cohortId,
      cohortName: cohort?.name ?? null,
      membershipStartsAt: cohort?.startsAt ?? null,
      membershipEndsAt: cohort?.endsAt ?? null,
      status: deriveStatus(cohort?.startsAt ?? null, cohort?.endsAt ?? null, nowMs),
      lastActiveAt: lastActiveByUser.get(p.id as string) ?? null,
      lifetimePaidCents: paidByUser.get(p.id as string) ?? 0,
    };
  });

  const currentUserRole = (currentProfile?.role as string) ?? "member";

  return (
    <MembersClient
      rows={rows}
      cohorts={(cohorts ?? []).map((c) => ({ id: c.id as number, name: c.name as string }))}
      currentUserRole={currentUserRole}
      currentUserId={user?.id ?? ""}
      canSeeBilling={BILLING_ROLES.includes(currentUserRole)}
    />
  );
}
