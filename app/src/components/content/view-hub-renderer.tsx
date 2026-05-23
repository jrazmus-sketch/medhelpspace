import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { TrackHubAccordion, type SuperGroupData } from "./track-hub-accordion";

// Action verb shown on the per-specialty card inside an expanded accordion row.
const CTA_FOR_VIEW: Record<string, string> = {
  quiz:      "Responder",
  simulados: "Treinar",
  resumos:   "Estudar",
  formula:   "Acessar",
};

// ── Data loader: returns the SuperGroup data shape the accordion expects ──
// Exported separately so the tabbed /app/estudo-por-questoes page can call it
// twice (once for quiz, once for simulados) without re-implementing the query.
export async function getViewHubGroups(
  view: string,
  excludePageId: number | null,
): Promise<SuperGroupData[]> {
  const admin = createAdminClient();

  const [{ data: viewPages }, { data: specialties }] = await Promise.all([
    (excludePageId != null
      ? admin.from("pages")
          .select("id, slug, title, specialty_id")
          .eq("view", view)
          .eq("type", "blurb-nav-hub")
          .eq("status", "publish")
          .neq("id", excludePageId)
          .not("specialty_id", "is", null)
          .order("specialty_id")
      : admin.from("pages")
          .select("id, slug, title, specialty_id")
          .eq("view", view)
          .eq("type", "blurb-nav-hub")
          .eq("status", "publish")
          .not("specialty_id", "is", null)
          .order("specialty_id")),
    admin.from("specialties")
      .select("id, slug, name, display_order, group_label")
      .order("display_order"),
  ]);

  const pages = viewPages ?? [];
  if (pages.length === 0) return [];

  // Per-specialty progress.
  // - quiz / simulados → quiz accuracy by specialty (correct / total)
  // - resumos / formula → lesson completion across pages in (view + specialty)
  const progressBySpecialty = new Map<number, number>();
  if (!USE_MOCK_DATA) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        if (view === "simulados" || view === "quiz") {
          // Restrict attempts to pages tagged with THIS view, otherwise both
          // tabs read from the same pool and report identical accuracy.
          const { data: viewPageRows } = await admin
            .from("pages")
            .select("id")
            .eq("view", view);
          const viewPageIds = (viewPageRows ?? []).map((p) => p.id as number);

          if (viewPageIds.length > 0) {
            const { data: attempts } = await admin
              .from("quiz_attempts")
              .select("specialty_id, is_correct")
              .eq("user_id", user.id)
              .not("specialty_id", "is", null)
              .in("page_id", viewPageIds);
            const byId = new Map<number, { total: number; correct: number }>();
            for (const a of attempts ?? []) {
              const sid = a.specialty_id as number;
              const b = byId.get(sid) ?? { total: 0, correct: 0 };
              b.total++;
              if (a.is_correct) b.correct++;
              byId.set(sid, b);
            }
            for (const [sid, { total, correct }] of byId) {
              progressBySpecialty.set(sid, total > 0 ? Math.round((correct / total) * 100) : 0);
            }
          }
        } else if (view === "resumos" || view === "formula") {
          const { data: allViewPages } = await admin
            .from("pages")
            .select("id, specialty_id")
            .eq("view", view)
            .not("specialty_id", "is", null);
          const pagesBySpec = new Map<number, number[]>();
          let lessonPageIds: number[] = [];
          for (const p of allViewPages ?? []) {
            const sid = p.specialty_id as number;
            const list = pagesBySpec.get(sid) ?? [];
            list.push(p.id);
            pagesBySpec.set(sid, list);
            lessonPageIds.push(p.id);
          }
          lessonPageIds = [...new Set(lessonPageIds)];

          if (lessonPageIds.length > 0) {
            const [{ data: lessons }, { data: completions }] = await Promise.all([
              admin.from("lessons").select("id, page_id").in("page_id", lessonPageIds),
              admin.from("lesson_completions").select("lesson_id, page_id").eq("user_id", user.id).in("page_id", lessonPageIds),
            ]);
            const lessonsByPage = new Map<number, number>();
            for (const l of lessons ?? []) {
              lessonsByPage.set(l.page_id as number, (lessonsByPage.get(l.page_id as number) ?? 0) + 1);
            }
            const completedByPage = new Map<number, number>();
            for (const c of completions ?? []) {
              completedByPage.set(c.page_id as number, (completedByPage.get(c.page_id as number) ?? 0) + 1);
            }
            for (const [sid, pageIds] of pagesBySpec) {
              let total = 0;
              let done = 0;
              for (const pid of pageIds) {
                total += lessonsByPage.get(pid) ?? 0;
                done += completedByPage.get(pid) ?? 0;
              }
              progressBySpecialty.set(sid, total > 0 ? Math.round((done / total) * 100) : 0);
            }
          }
        }
      }
    } catch {
      // Non-critical — progress just stays at 0
    }
  }

  type Spec = { id: number; slug: string; name: string; display_order: number; group_label: string | null };
  const specMap = new Map<number, Spec>(
    (specialties ?? []).map((s) => [s.id as number, s as Spec]),
  );

  // Build super-groups (same shape MedVoice/AudioCards uses).
  // group_label='Clínica Médica' bundles 12 specialties; group_label=null = standalone row.
  type SuperGroup = SuperGroupData & { minOrder: number };
  const superMap = new Map<string, SuperGroup>();

  for (const page of pages) {
    const spec = specMap.get(page.specialty_id!);
    if (!spec) continue;
    const label = spec.group_label ?? spec.name;
    if (!superMap.has(label)) {
      const iconSlug = spec.group_label ? "clinica-medica" : spec.slug;
      superMap.set(label, { label, iconSlug, minOrder: spec.display_order, items: [] });
    }
    superMap.get(label)!.items.push({
      spec: { id: spec.id, slug: spec.slug, name: spec.name },
      href: `/app/${spec.slug}/${page.slug}`,
      progress: progressBySpecialty.get(spec.id),
    });
  }

  return [...superMap.values()]
    .sort((a, b) => a.minOrder - b.minOrder)
    .map(({ minOrder: _drop, ...rest }) => rest);
}

// ── Renderer (server component) ──────────────────────────────────────────
export async function ViewHubRenderer({
  view,
  excludePageId,
}: {
  view: string;
  excludePageId: number;
}) {
  const groups = await getViewHubGroups(view, excludePageId);
  if (groups.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
        Conteúdo em preparação.
      </p>
    );
  }
  return <TrackHubAccordion groups={groups} ctaLabel={CTA_FOR_VIEW[view] ?? "Acessar"} />;
}

export const CTA_LABEL_FOR_VIEW = CTA_FOR_VIEW;
