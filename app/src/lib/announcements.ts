import { createAdminClient } from "@/lib/supabase/admin";
import type { AnnouncementWithCategory } from "@/types/supabase";

/**
 * Live announcements for the member-facing notification strip AND the bell.
 *
 * Visibility: anything that isn't a draft becomes visible once its publish_at
 * has arrived — so scheduled items surface automatically without a status flip.
 * Cohort targeting: an announcement with cohort_id = NULL is shown to everyone;
 * a cohort-targeted one is shown only to members of that cohort.
 * Per-user read state comes from announcement_reads.
 *
 * Both the strip and the bell source announcements from here so they can never
 * drift.
 */
export async function getLiveAnnouncementsForUser(
  userId: string | null,
  limit = 20,
): Promise<AnnouncementWithCategory[]> {
  const admin = createAdminClient();

  // Resolve the user's cohort membership(s) for targeting. A user can belong to
  // more than one cohort (e.g. an admin holding a test membership).
  let cohortIds: number[] = [];
  if (userId) {
    const { data: memberships } = await admin
      .from("user_cohort_memberships")
      .select("cohort_id")
      .eq("user_id", userId);
    cohortIds = (memberships ?? []).map((m: { cohort_id: number }) => m.cohort_id);
  }

  // Untargeted (cohort_id IS NULL) → all members; otherwise only the user's
  // cohort(s). With no membership, only untargeted announcements are visible.
  const cohortFilter =
    cohortIds.length > 0
      ? `cohort_id.is.null,cohort_id.in.(${cohortIds.join(",")})`
      : "cohort_id.is.null";

  // RLS would filter, but the admin client bypasses it — filter manually so the
  // member-facing view respects status + publish_at + cohort targeting.
  // is_welcome leads the ordering so the welcome is always fetched (never pushed
  // out of the limit) and lands first; per-user dismissal is applied below.
  const { data: rows } = await admin
    .from("announcements")
    .select("*, category:announcement_categories(*)")
    .neq("status", "draft")
    .lte("publish_at", new Date().toISOString())
    .or(cohortFilter)
    .order("is_welcome", { ascending: false })
    .order("pinned", { ascending: false })
    .order("publish_at", { ascending: false })
    .limit(limit);

  if (!rows || rows.length === 0) return [];

  let readIds = new Set<number>();
  let dismissedIds = new Set<number>();
  if (userId) {
    const ids = rows.map((r: { id: number }) => r.id);
    const [{ data: reads }, { data: dismissals }] = await Promise.all([
      admin.from("announcement_reads").select("announcement_id").eq("user_id", userId).in("announcement_id", ids),
      admin.from("announcement_dismissals").select("announcement_id").eq("user_id", userId).in("announcement_id", ids),
    ]);
    readIds = new Set((reads ?? []).map((r: { announcement_id: number }) => r.announcement_id));
    dismissedIds = new Set((dismissals ?? []).map((r: { announcement_id: number }) => r.announcement_id));
  }

  // A dismissed welcome disappears entirely for that member (strip + bell).
  // Non-welcome rows are never affected by dismissals.
  return rows
    .filter((r) => !(r.is_welcome && dismissedIds.has(r.id)))
    .map((r) => ({ ...r, is_read: readIds.has(r.id), is_dismissed: dismissedIds.has(r.id) }));
}
