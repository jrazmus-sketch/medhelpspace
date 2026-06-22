import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveMembership } from "@/lib/membership-gate";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { TrackHubAccordion, type SuperGroupData } from "@/components/content/track-hub-accordion";
import { TypeChip } from "@/components/content/type-chip";
import { STUDY_TYPE_CONFIG } from "@/lib/page-type";
import type { Crumb } from "@/lib/breadcrumbs";

export const metadata = { title: "Revalida Up" };

export default async function RevalidaUpHubPage() {
  // Day-1 content: members only (no module gate — Revalida Up is no longer in 60D).
  await requireActiveMembership();

  const admin = createAdminClient();
  const [{ data: specialties }, { data: topicRows }] = await Promise.all([
    admin
      .from("specialties")
      .select("id, slug, name, display_order, group_label")
      .order("display_order"),
    admin
      .from("pages")
      .select("specialty_id")
      .eq("view", "revalida-up")
      .eq("status", "publish"),
  ]);

  // Count published topics per specialty.
  const counts = new Map<number, number>();
  for (const r of topicRows ?? []) {
    if (r.specialty_id != null) counts.set(r.specialty_id, (counts.get(r.specialty_id) ?? 0) + 1);
  }

  // Build super-groups the same way every other study hub does
  // (view-hub-renderer / track-hub-renderer): bundle specialties by group_label
  // so the 12 Clínica Médica specialties nest under one row and the rest are
  // standalone. group_label=null → standalone row using the specialty's own icon.
  type Spec = { id: number; slug: string; name: string; display_order: number; group_label: string | null };
  type SuperGroup = SuperGroupData & { minOrder: number };
  const superMap = new Map<string, SuperGroup>();
  for (const s of (specialties ?? []) as Spec[]) {
    if (!counts.has(s.id)) continue;
    const label = s.group_label ?? s.name;
    if (!superMap.has(label)) {
      const iconSlug = s.group_label ? "clinica-medica" : s.slug;
      superMap.set(label, { label, iconSlug, minOrder: s.display_order, items: [] });
    }
    const count = counts.get(s.id)!;
    superMap.get(label)!.items.push({
      spec: { id: s.id, slug: s.slug, name: s.name },
      href: `/app/revalida-up/${s.slug}`,
      note: `${count} ${count === 1 ? "tema" : "temas"}`,
    });
  }
  const groups: SuperGroupData[] = [...superMap.values()]
    .sort((a, b) => a.minOrder - b.minOrder)
    .map(({ minOrder: _drop, ...rest }) => rest);

  // Trailing "Outros" (Em breve) row to match the other study hubs.
  if (groups.length > 0) {
    groups.push({ label: "Outros", iconSlug: "outros", items: [] });
  }

  const crumbs: Crumb[] = [
    { label: "Início", href: "/app" },
    { label: "Revalida Up" },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app" />
      </div>
      <Breadcrumbs className="mb-6" crumbs={crumbs} />

      {/* ── Header (matches the other type hubs: title + type chip) ── */}
      <header style={{ marginBottom: 28 }}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1
            style={{
              fontSize: "clamp(20px, 5vw, 26px)",
              fontWeight: 600,
              letterSpacing: "-.025em",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            Revalida Up
          </h1>
          <TypeChip typeKey="revalida-up" />
        </div>
      </header>

      {/* ── Specialty groups (same accordion every other study hub uses) ── */}
      {groups.length > 0 ? (
        <TrackHubAccordion
          groups={groups}
          ctaLabel="Estudar"
          accentColor={STUDY_TYPE_CONFIG["revalida-up"].color}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Conteúdo em preparação.</p>
      )}
    </div>
  );
}
