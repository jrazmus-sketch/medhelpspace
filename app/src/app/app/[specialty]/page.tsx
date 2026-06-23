import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveMembership } from "@/lib/membership-gate";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { BlurbNavHubRenderer } from "@/components/content/blurb-nav-hub-renderer";
import { TrackHubRenderer } from "@/components/content/track-hub-renderer";
import { ViewHubRenderer } from "@/components/content/view-hub-renderer";
import { buildCrumbsForPage, type Crumb } from "@/lib/breadcrumbs";
import { STUDY_TYPE_CONFIG, type StudyTypeConfig, type StudyTypeKey } from "@/lib/page-type";
import { getStudyTypeOverrides } from "@/lib/queries/study-types";
import { TypeChip } from "@/components/content/type-chip";
import { EditableText } from "@/components/admin/editable-text";
import { Coachmark } from "@/components/onboarding/coachmark";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { PageView } from "@/types/supabase";

// ── Helpers ───────────────────────────────────────────────────────────────────

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
  color: "var(--muted-2, #727272)", fontWeight: 600,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SpecialtyHubPage({
  params,
}: {
  params: Promise<{ specialty: string }>;
}) {
  const { specialty: slug } = await params;
  await requireActiveMembership();
  const supabase = await createClient();

  const { data: specialties } = await supabase
    .from("specialties")
    .select("*")
    .order("display_order");

  const spec = (specialties ?? []).find((s) => s.slug === slug);

  // ── Non-specialty slugs (track hubs, view hubs, etc.) ─────────────────────
  if (!spec) {
    const admin = createAdminClient();
    const { data: page } = await admin
      .from("pages")
      .select("id, title, slug, type, track_id, view, specialty_id, content_module_id")
      .eq("slug", slug)
      .single();

    if (!page) notFound();

    // Gate hubs that belong to a content module (e.g. formula-medhelp, now in
    // MedHelp 60D). NULL module = day-1, so this is a no-op for ungated hubs.
    await requireActiveMembership(page.content_module_id);

    const body =
      page.track_id != null ? (
        <TrackHubRenderer trackId={page.track_id} excludePageId={page.id} />
      ) : page.type === "blurb-nav-hub" ? (
        <BlurbNavHubRenderer pageId={page.id} />
      ) : page.view != null ? (
        <ViewHubRenderer view={page.view} excludePageId={page.id} />
      ) : null;

    if (!body) notFound();

    // Top-level type hub (no specialty) → buildCrumbsForPage emits
    // [Início, <Type root terminal>]. Voltar falls back to /app.
    const crumbs: Crumb[] = buildCrumbsForPage({
      page,
      specialty: null,
      specialtyHubSlug: null,
    });

    return (
      <div style={{ maxWidth: 1280, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
        <div className="mb-2">
          <VoltarButton fallbackHref="/app" />
        </div>
        <Breadcrumbs className="mb-6" crumbs={crumbs} />
        <header style={{ marginBottom: 28 }}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 600, letterSpacing: "-.025em", lineHeight: 1.15, margin: 0 }}>
              {page.title}
            </h1>
            <TypeChip page={page} withHelp />
          </div>
        </header>
        <Coachmark coachKey="type-hub" />
        {body}
      </div>
    );
  }

  // ── Specialty hub ─────────────────────────────────────────────────────────

  const admin = createAdminClient();

  // Fetch hub pages (blurb-nav-hub) and track pages for this specialty
  const [{ data: hubPages }, { data: trackPagesRaw }, { data: allTracks }, studyTypeOverrides, { count: revalidaUpCount }] = await Promise.all([
    admin
      .from("pages")
      .select("id, slug, view, title")
      .eq("specialty_id", spec.id)
      .eq("status", "publish")
      .eq("type", "blurb-nav-hub"),
    admin
      .from("pages")
      .select("id, slug, title, track_id")
      .eq("specialty_id", spec.id)
      .eq("status", "publish")
      .not("track_id", "is", null),
    admin.from("tracks").select("id, slug, name"),
    getStudyTypeOverrides(),
    // Revalida Up is query-based (no blurb-nav-hub) — just check it has topics here.
    admin
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("specialty_id", spec.id)
      .eq("status", "publish")
      .eq("view", "revalida-up"),
  ]);

  // Build type option cards: view-based hub pages
  type TypeOption = { key: StudyTypeKey; cfg: StudyTypeConfig; href: string };
  const typeOptions: TypeOption[] = [];

  // Fórmula moved into MedHelp 60D, so it no longer appears as a day-1 card here.
  const VIEW_ORDER: PageView[] = ["quiz", "simulados", "resumos"];
  for (const view of VIEW_ORDER) {
    const cfg = STUDY_TYPE_CONFIG[view as StudyTypeKey];
    if (!cfg) continue;
    const hubPage = (hubPages ?? []).find(p => p.view === view);
    if (hubPage) {
      typeOptions.push({ key: view as StudyTypeKey, cfg, href: `/app/${slug}/${hubPage.slug}` });
    }
  }

  // Revalida Up — day-1 active-recall deck. No blurb-nav-hub; its per-specialty
  // topic list lives at /app/revalida-up/[specialty].
  if ((revalidaUpCount ?? 0) > 0) {
    typeOptions.push({
      key: "revalida-up",
      cfg: STUDY_TYPE_CONFIG["revalida-up"],
      href: `/app/revalida-up/${slug}`,
    });
  }

  // Track-based pages (medvoice, audiocards)
  const TRACK_ORDER: StudyTypeKey[] = ["medvoice", "audiocards"];
  for (const trackSlug of TRACK_ORDER) {
    const cfg = STUDY_TYPE_CONFIG[trackSlug];
    const track = (allTracks ?? []).find(t => t.slug === trackSlug);
    if (!track) continue;
    const trackPage = (trackPagesRaw ?? []).find(p => p.track_id === track.id);
    if (trackPage) {
      typeOptions.push({ key: trackSlug, cfg, href: `/app/${slug}/${trackPage.slug}` });
    }
  }

  const emoji = (spec as { emoji?: string }).emoji;

  // Specialty all-content hub: Início > <Specialty terminal>.
  const crumbs: Crumb[] = [
    { label: "Início", href: "/app" },
    { label: spec.name },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app" />
      </div>
      <Breadcrumbs className="mb-6" crumbs={crumbs} />

      {/* ── Header ── */}
      <header style={{ marginBottom: 32 }}>
        {emoji && <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 10 }}>{emoji}</div>}
        <h1 style={{
          fontSize: "clamp(24px, 5vw, 36px)", fontWeight: 700,
          letterSpacing: "-.035em", lineHeight: 1.1, margin: 0,
        }}>
          {spec.name}
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          Escolha como quer estudar esta especialidade.
        </p>
      </header>

      <Coachmark coachKey="specialty-hub" />

      {/* ── Study type cards ── */}
      {typeOptions.length > 0 ? (
        <div>
          <div style={{ ...LABEL_STYLE, marginBottom: 14 }}>Tipo de conteúdo</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {typeOptions.map((opt, i) => {
              const { cfg, href } = opt;
              const override = studyTypeOverrides.get(opt.key);
              const label = override?.label ?? cfg.label;
              const description = override?.description ?? cfg.desc;
              return (
                <Link
                  key={opt.key}
                  href={href}
                  style={{
                    borderRadius: "var(--radius)",
                    padding: "22px 20px",
                    display: "flex", alignItems: "flex-start", gap: 16,
                    textDecoration: "none", minHeight: 100,
                    background: `linear-gradient(140deg, color-mix(in srgb, ${cfg.color} 92%, #1a0030) 0%, ${cfg.color} 100%)`,
                    animation: `dash-fade-up 0.45s cubic-bezier(.16,1,.3,1) both`,
                    animationDelay: `${i * 55}ms`,
                    position: "relative", overflow: "hidden",
                  }}
                  className="transition-opacity hover:opacity-90"
                >
                  <cfg.Icon
                    size={22}
                    strokeWidth={1.6}
                    style={{ color: "rgba(255,255,255,0.85)", flexShrink: 0, marginTop: 2 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.02em", color: "#fff", lineHeight: 1.2 }}>
                      {override && override.id > 0 ? (
                        <EditableText
                          variant="plain"
                          table="study_types"
                          id={override.id}
                          field="label"
                          value={label}
                          as="span"
                        />
                      ) : (
                        label
                      )}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 5, lineHeight: 1.4, color: "rgba(255,255,255,0.62)" }}>
                      {override && override.id > 0 ? (
                        <EditableText
                          variant="plain"
                          table="study_types"
                          id={override.id}
                          field="description"
                          value={description}
                          as="span"
                        />
                      ) : (
                        description
                      )}
                    </div>
                    <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>
                      Acessar <ChevronRight size={11} strokeWidth={2.5} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
          Conteúdo em preparação para esta especialidade.
        </p>
      )}

      {/* ── Back link ── */}
      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--surface-2)" }}>
        <Link
          href="/app"
          style={{ fontSize: 13, color: "var(--muted-foreground)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
          className="hover:text-foreground transition-colors"
        >
          ← Voltar ao início
        </Link>
      </div>
    </div>
  );
}
