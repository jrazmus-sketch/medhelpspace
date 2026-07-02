import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Roadmap ("Roteiro") data — a read-only projection of the full incidence-ranked
 * topic arc, grouped by priority tier, with per-topic progress. This is the
 * whole-course view that complements the adaptive daily plan (no frozen dates).
 *
 * Status is derived cheaply from quiz_attempts (no review_schedule join):
 *   - nao_iniciado : no attempts on the topic's quiz page
 *   - dominado     : answered ≥ all its questions AND accuracy ≥ 70%
 *   - em_andamento : started but not yet mastered
 * `topic.incidence_count` already equals the number of quiz questions on the
 * source page (that's how it was seeded), so it doubles as the "total" here.
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

  const [topicsRes, specialtiesRes, attemptsRes] = await Promise.all([
    admin
      .from("topics")
      .select("id, name, specialty_id, source_page_id, incidence_count, priority_tier")
      .not("priority_tier", "is", null)
      .order("incidence_count", { ascending: false }),
    admin.from("specialties").select("id, name, slug"),
    admin.from("quiz_attempts").select("page_id, is_correct").eq("user_id", userId),
  ]);

  const specialties = (specialtiesRes.data ?? []) as { id: number; name: string; slug: string }[];
  const specById = new Map(specialties.map((s) => [s.id, s]));
  const outrosId = specialties.find((s) => s.slug === "outros")?.id ?? -1;

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

  // Per-page attempt tally.
  const byPage = new Map<number, { n: number; correct: number }>();
  for (const a of (attemptsRes.data ?? []) as { page_id: number; is_correct: boolean }[]) {
    const b = byPage.get(a.page_id) ?? { n: 0, correct: 0 };
    b.n++;
    if (a.is_correct) b.correct++;
    byPage.set(a.page_id, b);
  }

  // Build per-tier buckets (skip Outros — coarse buckets guarded until 0c).
  const tierMap = new Map<string, RoadmapTopic[]>();
  let started = 0;
  let mastered = 0;

  for (const t of topicsRaw) {
    if (t.specialty_id == null || t.specialty_id === outrosId) continue;
    const spec = specById.get(t.specialty_id);
    if (!spec) continue;

    const tally = t.source_page_id != null ? byPage.get(t.source_page_id) : undefined;
    const n = tally?.n ?? 0;
    const accuracy = n > 0 ? (tally as { correct: number }).correct / n : null;
    let status: RoadmapStatus;
    if (n === 0) status = "nao_iniciado";
    else if (n >= t.incidence_count && (accuracy ?? 0) >= 0.7) status = "dominado";
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
