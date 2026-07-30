import { createAdminClient } from "@/lib/supabase/admin";
import { buildPageProgress, isPageMastered, type Signals } from "./derive";

/**
 * Roadmap ("Roteiro") data — a read-only projection of the full incidence-ranked
 * topic arc, grouped by priority tier, with per-topic progress. This is the
 * whole-course view that complements the adaptive daily plan (no frozen dates).
 *
 * Status:
 *   - nao_iniciado : no attempts on the topic's quiz page
 *   - dominado     : every question on the page answered AND accuracy ≥ 70%
 *   - em_andamento : started but not yet mastered
 *
 * "Dominado" MUST mean exactly what the daily plan means by "retired", or the
 * two surfaces contradict each other — the Roteiro would call a topic finished
 * while the plan keeps scheduling it, or vice versa. So this shares the engine's
 * buildPageProgress + isPageMastered rather than re-deriving:
 *   - progress counts DISTINCT questions (latest attempt each), so answering one
 *     question twenty times no longer reads as a mastered twenty-question page;
 *   - the denominator is the page's REAL question count from
 *     quiz_page_question_counts, not `incidence_count`. Those agree for 199 of
 *     211 topics, but the 12 sub-topics that share a coarse source page (e.g. the
 *     7 urology topics on one 30-question page) were flipping to "Dominado" after
 *     2–6 answers, which also inflated the "N dominados" headline.
 */

export type RoadmapStatus = "nao_iniciado" | "em_andamento" | "dominado";

export type RoadmapTopic = {
  id: number;
  name: string;
  specialtyName: string;
  href: string;
  incidence: number;
  tier: string; // 'A' | 'B' | 'C' | 'D'
  status: RoadmapStatus;
  accuracy: number | null; // 0..1, null if not started
};

export type RoadmapTier = {
  tier: string;
  label: string;
  topics: RoadmapTopic[];
  started: number;
  mastered: number;
};

export type RoadmapData = {
  tiers: RoadmapTier[];
  totals: { total: number; started: number; mastered: number };
};

const TIER_LABEL: Record<string, string> = {
  A: "Prioridade A · altíssima incidência",
  B: "Prioridade B · alta incidência",
  C: "Prioridade C · incidência média",
  D: "Prioridade D · menor incidência",
};

export async function getRoadmapForUser(userId: string): Promise<RoadmapData> {
  const admin = createAdminClient();

  const [topicsRes, specialtiesRes, attemptsRes, questionCountsRes] = await Promise.all([
    admin
      .from("topics")
      .select("id, name, specialty_id, source_page_id, incidence_count, priority_tier")
      .not("priority_tier", "is", null)
      .order("incidence_count", { ascending: false }),
    admin.from("specialties").select("id, name, slug"),
    admin
      .from("quiz_attempts")
      .select("page_id, is_correct, created_at, question_id")
      .eq("user_id", userId)
      .order("created_at")
      .order("id"),
    // Real per-page question totals. If the view is unavailable each topic falls
    // back to its own incidence_count (correct for 199 of 211).
    admin.from("quiz_page_question_counts").select("page_id, question_count"),
  ]);

  const specialties = (specialtiesRes.data ?? []) as { id: number; name: string; slug: string }[];
  const specById = new Map(specialties.map((s) => [s.id, s]));

  // Source-page slugs for building the quiz link.
  const topicsRaw = (topicsRes.data ?? []) as {
    id: number; name: string; specialty_id: number | null;
    source_page_id: number | null; incidence_count: number; priority_tier: string;
  }[];
  const sourcePageIds = [...new Set(topicsRaw.map((t) => t.source_page_id).filter((v): v is number => v != null))];
  const pageSlugById = new Map<number, string>();
  if (sourcePageIds.length > 0) {
    const { data: pages } = await admin.from("pages").select("id, slug").in("id", sourcePageIds);
    for (const p of pages ?? []) pageSlugById.set(p.id as number, p.slug as string);
  }

  // Per-page progress — the SAME computation the daily plan uses.
  const byPage = buildPageProgress((attemptsRes.data ?? []) as Signals["quizAttempts"]);
  const questionCounts = new Map<number, number>();
  for (const r of questionCountsRes.data ?? []) {
    questionCounts.set(Number(r.page_id), Number(r.question_count));
  }

  // Build per-tier buckets. Outros is no longer guarded — its coarse buckets were
  // split into per-condition sub-topics (0c), so they rank at their true incidence.
  const tierMap = new Map<string, RoadmapTopic[]>();
  let started = 0;
  let mastered = 0;

  for (const t of topicsRaw) {
    if (t.specialty_id == null) continue;
    const spec = specById.get(t.specialty_id);
    if (!spec) continue;

    const tally = t.source_page_id != null ? byPage.get(t.source_page_id) : undefined;
    const n = tally?.answered ?? 0;
    const accuracy = n > 0 ? tally!.correct / n : null;
    const totalQuestions =
      (t.source_page_id != null ? questionCounts.get(t.source_page_id) : undefined)
      ?? t.incidence_count;
    let status: RoadmapStatus;
    if (n === 0) status = "nao_iniciado";
    else if (isPageMastered(tally, totalQuestions)) status = "dominado";
    else status = "em_andamento";

    if (status !== "nao_iniciado") started++;
    if (status === "dominado") mastered++;

    const quizSlug = t.source_page_id != null ? pageSlugById.get(t.source_page_id) : undefined;
    const href = quizSlug ? `/app/${spec.slug}/${quizSlug}` : `/app/${spec.slug}`;

    const arr = tierMap.get(t.priority_tier) ?? [];
    arr.push({
      id: t.id,
      name: t.name,
      specialtyName: spec.name,
      href,
      incidence: t.incidence_count,
      tier: t.priority_tier,
      status,
      accuracy,
    });
    tierMap.set(t.priority_tier, arr);
  }

  const tiers: RoadmapTier[] = ["A", "B", "C", "D"]
    .filter((tier) => (tierMap.get(tier)?.length ?? 0) > 0)
    .map((tier) => {
      const topics = tierMap.get(tier)!; // already incidence-sorted from the query
      return {
        tier,
        label: TIER_LABEL[tier] ?? tier,
        topics,
        started: topics.filter((x) => x.status !== "nao_iniciado").length,
        mastered: topics.filter((x) => x.status === "dominado").length,
      };
    });

  const total = tiers.reduce((s, t) => s + t.topics.length, 0);
  return { tiers, totals: { total, started, mastered } };
}
