import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { SpecialtyCard } from "./specialty-card";

export async function ViewHubRenderer({
  view,
  excludePageId,
}: {
  view: string;
  excludePageId: number;
}) {
  const admin = createAdminClient();

  const [{ data: viewPages }, { data: specialties }] = await Promise.all([
    admin
      .from("pages")
      .select("id, slug, title, specialty_id")
      .eq("view", view)
      .eq("type", "blurb-nav-hub")
      .eq("status", "publish")
      .neq("id", excludePageId)
      .not("specialty_id", "is", null)
      .order("specialty_id"),
    admin
      .from("specialties")
      .select("id, slug, name, display_order")
      .order("display_order"),
  ]);

  const pages = viewPages ?? [];

  if (pages.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
        Conteúdo em preparação.
      </p>
    );
  }

  // Compute real progress per specialty for the logged-in user.
  // - simulados → quiz accuracy per specialty (correct / total)
  // - resumos / formula → lesson completion % across pages in (view + specialty)
  const progressBySpecialty = new Map<number, number>();
  if (!USE_MOCK_DATA) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        if (view === "simulados") {
          const { data: attempts } = await admin
            .from("quiz_attempts")
            .select("specialty_id, is_correct")
            .eq("user_id", user.id)
            .not("specialty_id", "is", null);
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
        } else if (view === "resumos" || view === "formula") {
          // Find all pages for this view + each specialty, then count completions
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

  type Spec = { id: number; slug: string; name: string; display_order: number };
  const specMap = new Map<number, Spec>(
    (specialties ?? []).map((s) => [s.id as number, s as Spec]),
  );

  const sorted = [...pages].sort((a, b) => {
    const oa = specMap.get(a.specialty_id!)?.display_order ?? 99;
    const ob = specMap.get(b.specialty_id!)?.display_order ?? 99;
    return oa - ob;
  });

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))",
      gap: "clamp(12px, 3vw, 30px)",
    }}>
      {sorted.map((page) => {
        const spec = specMap.get(page.specialty_id!);
        if (!spec) return null;
        return (
          <SpecialtyCard
            key={page.id}
            label={spec.name}
            href={`/app/${spec.slug}/${page.slug}`}
            slug={spec.slug}
            progress={progressBySpecialty.get(spec.id) ?? 0}
          />
        );
      })}
    </div>
  );
}
