import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SpecialtyCard } from "./specialty-card";

// TODO: replace with real per-user accuracy once wired up
const MOCK_PROGRESS = [73, 45, 88, 12, 62, 95, 31, 57, 0, 78, 43, 66];

export async function ViewHubRenderer({
  view,
  excludePageId,
}: {
  view: string;
  excludePageId: number;
}) {
  const admin = createAdminClient();
  const supabase = await createClient();

  await supabase.auth.getUser(); // keep session fresh

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
      {sorted.map((page, i) => {
        const spec = specMap.get(page.specialty_id!);
        if (!spec) return null;
        return (
          <SpecialtyCard
            key={page.id}
            label={spec.name}
            href={`/app/${spec.slug}/${page.slug}`}
            slug={spec.slug}
            progress={MOCK_PROGRESS[i % MOCK_PROGRESS.length]}
          />
        );
      })}
    </div>
  );
}
