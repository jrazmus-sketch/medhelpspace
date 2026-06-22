import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveMembership } from "@/lib/membership-gate";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { SpecialtyIcon, getSpecialtyAccent } from "@/components/content/specialty-icon";
import { TypeChip } from "@/components/content/type-chip";
import { TopicCard } from "@/components/content/blurb-nav-hub-renderer";
import type { Crumb } from "@/lib/breadcrumbs";

// Topic titles carry a redundant "… Revalida UP" suffix (inherited from the
// import). The page context + type chip already say "Revalida Up", so strip it
// for the card label to match the clean topic cards on quiz/resumos hubs.
function stripRevalidaUpSuffix(title: string): string {
  return title.replace(/\s*revalida\s*up\s*$/i, "").trim() || title;
}

export default async function RevalidaUpSpecialtyPage({
  params,
}: {
  params: Promise<{ specialty: string }>;
}) {
  const { specialty } = await params;
  await requireActiveMembership();

  const admin = createAdminClient();
  const { data: spec } = await admin
    .from("specialties")
    .select("id, slug, name")
    .eq("slug", specialty)
    .maybeSingle();
  if (!spec) notFound();

  const { data: topics } = await admin
    .from("pages")
    .select("slug, title")
    .eq("view", "revalida-up")
    .eq("status", "publish")
    .eq("specialty_id", spec.id)
    .order("title");

  if (!topics || topics.length === 0) notFound();

  const accent = getSpecialtyAccent(spec.slug);

  const crumbs: Crumb[] = [
    { label: "Início", href: "/app" },
    { label: "Revalida Up", href: "/app/revalida-up" },
    { label: spec.name },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app/revalida-up" />
      </div>
      <Breadcrumbs className="mb-6" crumbs={crumbs} />

      {/* ── Header (matches the other per-specialty hubs) ── */}
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SpecialtyIcon specialtySlug={spec.slug} size={38} />
          <h1 className="text-3xl font-bold leading-tight">{spec.name} Revalida Up</h1>
          <TypeChip typeKey="revalida-up" />
        </div>
        <div className="mt-3">
          <Link
            href={`/app/${spec.slug}`}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Ver toda {spec.name} →
          </Link>
        </div>
      </header>

      {/* ── Topic grid (same card grid every other hub uses) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 sm:gap-4">
        {topics.map((t) => (
          <TopicCard
            key={t.slug}
            label={stripRevalidaUpSuffix(t.title)}
            href={`/app/${spec.slug}/${t.slug}`}
            accent={accent}
          />
        ))}
      </div>
    </div>
  );
}
