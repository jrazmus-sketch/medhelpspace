import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveMembership } from "@/lib/membership-gate";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { SpecialtyIcon } from "@/components/content/specialty-icon";
import type { Crumb } from "@/lib/breadcrumbs";

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

  const crumbs: Crumb[] = [
    { label: "Início", href: "/app" },
    { label: "Revalida Up", href: "/app/revalida-up" },
    { label: spec.name },
  ];

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app/revalida-up" />
      </div>
      <Breadcrumbs className="mb-6" crumbs={crumbs} />

      {/* ── Hero ── */}
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SpecialtyIcon specialtySlug={spec.slug} size={38} />
          <h1 className="text-3xl font-bold leading-tight">{spec.name}</h1>
        </div>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          Revalida Up — {topics.length} {topics.length === 1 ? "tema" : "temas"} de alto rendimento.
        </p>
      </header>

      {/* ── Topic list ── */}
      <ul className="flex flex-col gap-2">
        {topics.map((t) => (
          <li key={t.slug}>
            <Link
              href={`/app/${spec.slug}/${t.slug}`}
              className="group flex min-h-[52px] items-center gap-3 rounded-[var(--radius)] px-4 py-3 transition-colors"
              style={{ background: "var(--surface-1)", boxShadow: "inset 0 0 0 1px var(--surface-2)" }}
            >
              <span className="min-w-0 flex-1 text-[15px] font-medium text-foreground">{t.title}</span>
              <ChevronRight
                size={18}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
