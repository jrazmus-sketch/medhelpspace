import Link from "next/link";
import { Target, ChevronRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveMembership } from "@/lib/membership-gate";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { SpecialtyIcon } from "@/components/content/specialty-icon";
import type { Crumb } from "@/lib/breadcrumbs";

export const metadata = { title: "Revalida Up" };

export default async function RevalidaUpHubPage() {
  // Day-1 content: members only (no module gate — Revalida Up is no longer in 60D).
  await requireActiveMembership();

  const admin = createAdminClient();
  const [{ data: specialties }, { data: topicRows }] = await Promise.all([
    admin.from("specialties").select("id, slug, name, display_order").order("display_order"),
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

  const cards = (specialties ?? [])
    .filter((s) => counts.has(s.id))
    .map((s) => ({ slug: s.slug as string, name: s.name as string, count: counts.get(s.id)! }));

  const crumbs: Crumb[] = [
    { label: "Início", href: "/app" },
    { label: "Revalida Up" },
  ];

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app" />
      </div>
      <Breadcrumbs className="mb-6" crumbs={crumbs} />

      {/* ── Hero ── */}
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            aria-hidden="true"
            className="flex items-center justify-center rounded-[var(--radius)]"
            style={{
              width: 44,
              height: 44,
              background: "color-mix(in srgb, var(--brand) 12%, transparent)",
              color: "var(--brand)",
            }}
          >
            <Target size={24} strokeWidth={1.8} />
          </span>
          <h1 className="text-3xl font-bold leading-tight">Revalida Up</h1>
        </div>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          Decisão estratégica por especialidade — os padrões que mais caem na prova,
          tema por tema. Escolha a especialidade para começar.
        </p>
      </header>

      {/* ── Specialty grid ── */}
      {cards.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((c) => (
            <Link
              key={c.slug}
              href={`/app/revalida-up/${c.slug}`}
              className="group flex items-center gap-4 rounded-[var(--radius)] p-4 transition-colors"
              style={{ background: "var(--surface-1)", boxShadow: "inset 0 0 0 1px var(--surface-2)" }}
            >
              <span
                aria-hidden="true"
                className="flex shrink-0 items-center justify-center rounded-[var(--radius)]"
                style={{ width: 44, height: 44, background: "var(--surface-2)" }}
              >
                <SpecialtyIcon specialtySlug={c.slug} size={26} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-foreground">{c.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {c.count} {c.count === 1 ? "tema" : "temas"}
                </span>
              </span>
              <ChevronRight
                size={18}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Conteúdo em preparação.</p>
      )}
    </div>
  );
}
